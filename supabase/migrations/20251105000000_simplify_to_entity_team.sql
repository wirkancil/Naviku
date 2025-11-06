-- Migration: Simplify organizational structure to Entity → Team (with Head) → Manager → Sales
-- This migration transforms the existing division/department structure into a simpler Entity-Team model
-- Following the requirement: Entity (Prosnep, Semut Merah) → TIM (A, B) → Head → Manager → Sales

-- ============================================================================
-- STEP 1: Prepare teams table (repurpose divisions)
-- ============================================================================

-- First, let's work with the existing divisions table and transform it to teams
-- We'll keep the data but change the structure

-- Add head_id to divisions (which will become teams)
ALTER TABLE public.divisions 
  ADD COLUMN IF NOT EXISTS head_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- Add entity_id to divisions (to link to entities)
ALTER TABLE public.divisions 
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES public.entities(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_divisions_head_id ON public.divisions(head_id);
CREATE INDEX IF NOT EXISTS idx_divisions_entity_id ON public.divisions(entity_id);

COMMENT ON COLUMN public.divisions.head_id IS 'Head (leader) of this team. One head per team.';
COMMENT ON COLUMN public.divisions.entity_id IS 'Entity (company) this team belongs to.';

-- ============================================================================
-- STEP 2: Migrate data from departments to divisions (consolidate teams)
-- ============================================================================

-- If there's data in departments that needs to be preserved as teams,
-- we'll create new division records for them
-- This assumes departments were sub-units that should become standalone teams

DO $$
DECLARE
  dept_record RECORD;
  new_team_id UUID;
BEGIN
  -- Loop through active departments and create corresponding teams (divisions)
  FOR dept_record IN 
    SELECT d.id, d.name, d.division_id, d.head_id, d.is_active
    FROM public.departments d
    WHERE d.is_active = true
  LOOP
    -- Create a new division (team) for each department
    INSERT INTO public.divisions (name, head_id, is_active, created_at, updated_at)
    VALUES (
      dept_record.name,
      dept_record.head_id,
      dept_record.is_active,
      NOW(),
      NOW()
    )
    RETURNING id INTO new_team_id;
    
    -- Update user_profiles that referenced this department to reference the new team
    UPDATE public.user_profiles
    SET division_id = new_team_id,
        department_id = NULL
    WHERE department_id = dept_record.id;
    
    RAISE NOTICE 'Migrated department % to new team (division) %', dept_record.name, new_team_id;
  END LOOP;
END $$;

-- ============================================================================
-- STEP 3: Update user_profiles - remove department_id, rename division_id semantically
-- ============================================================================

-- Note: We're keeping division_id column name for now to avoid breaking existing queries
-- But semantically it now means "team_id"
-- Later we can rename it, but for minimal changes we'll keep the column name

-- Remove department_id from user_profiles (no longer needed)
-- First, set all department_id to NULL
UPDATE public.user_profiles SET department_id = NULL WHERE department_id IS NOT NULL;

-- Drop dependencies before dropping column
-- 1. Drop view that depends on department_id
DROP VIEW IF EXISTS v_user_role CASCADE;

-- 2. Drop old RLS policies that reference department_id
-- These will be replaced by new entity-based policies in next migration
DROP POLICY IF EXISTS opportunities_select ON public.opportunities;
DROP POLICY IF EXISTS opportunities_select_policy ON public.opportunities;
DROP POLICY IF EXISTS opportunities_update_policy ON public.opportunities;
DROP POLICY IF EXISTS opportunities_delete_policy ON public.opportunities;
DROP POLICY IF EXISTS pipeline_items_select ON public.pipeline_items;
DROP POLICY IF EXISTS pipeline_items_insert_policy ON public.pipeline_items;
DROP POLICY IF EXISTS pipeline_items_update_policy ON public.pipeline_items;
DROP POLICY IF EXISTS pipeline_items_delete_policy ON public.pipeline_items;
DROP POLICY IF EXISTS sales_targets_select_policy ON public.sales_targets;
DROP POLICY IF EXISTS sales_targets_insert_policy ON public.sales_targets;
DROP POLICY IF EXISTS sales_targets_update_policy ON public.sales_targets;
DROP POLICY IF EXISTS sales_targets_delete_policy ON public.sales_targets;
DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update ON public.user_profiles;

-- Now drop the foreign key constraint
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_department_id_fkey;

-- Now we can safely drop the column
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS department_id;

-- Update comment to clarify division_id is now team_id semantically
COMMENT ON COLUMN public.user_profiles.division_id IS 'Team ID (formerly division_id). References divisions table which now represents teams.';

-- ============================================================================
-- STEP 4: Drop old teams table (no longer needed with simplified structure)
-- ============================================================================

-- The old teams table (child of departments) is no longer needed
-- Drop foreign keys referencing it first
DO $$
BEGIN
  -- Drop any foreign keys from other tables that reference teams
  -- Add specific drops here if needed
  
  -- Drop the table
  DROP TABLE IF EXISTS public.teams CASCADE;
  
  RAISE NOTICE 'Dropped old teams table';
END $$;

-- ============================================================================
-- STEP 5: Drop departments table (consolidated into teams/divisions)
-- ============================================================================

DROP TABLE IF EXISTS public.departments CASCADE;

-- ============================================================================
-- STEP 6: Add role 'sales' to role_enum (alias for account_manager)
-- ============================================================================

-- Add 'sales' as an alias for 'account_manager' to match the new terminology
ALTER TYPE role_enum ADD VALUE IF NOT EXISTS 'sales';

COMMENT ON TYPE role_enum IS 'User roles: admin (global), head (team leader), manager (sales manager), account_manager/sales (sales rep)';

-- ============================================================================
-- STEP 7: Create indexes for performance
-- ============================================================================

-- Ensure key columns are indexed for RLS performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_entity_id ON public.user_profiles(entity_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_division_id ON public.user_profiles(division_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_manager_id ON public.user_profiles(manager_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_manager_team_members_manager ON public.manager_team_members(manager_id);
CREATE INDEX IF NOT EXISTS idx_manager_team_members_am ON public.manager_team_members(account_manager_id);

-- ============================================================================
-- STEP 8: Update divisions table comment for clarity
-- ============================================================================

COMMENT ON TABLE public.divisions IS 'Teams within entities. Each team has one head (leader) and contains managers and sales reps. Formerly called divisions, now represents the Team concept in Entity → Team → Head → Manager → Sales hierarchy.';

-- ============================================================================
-- STEP 9: Add constraints for data integrity
-- ============================================================================

-- Ensure admin has no entity/team assignment
-- Ensure head has entity but no team assignment in user_profiles (team is via divisions.head_id)
-- Ensure manager has entity and team
-- Ensure sales has entity, team, and manager

-- Note: These are validation constraints, not enforcement (to allow flexibility during setup)

-- Function to validate user profile assignments
CREATE OR REPLACE FUNCTION validate_user_profile_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Admin should have no entity/team
  IF NEW.role = 'admin' AND (NEW.entity_id IS NOT NULL OR NEW.division_id IS NOT NULL) THEN
    RAISE WARNING 'Admin role should not have entity_id or team (division_id) assigned. Auto-clearing.';
    NEW.entity_id := NULL;
    NEW.division_id := NULL;
    NEW.manager_id := NULL;
  END IF;
  
  -- Head should have entity but ideally no division_id (assigned via divisions.head_id)
  IF NEW.role = 'head' AND NEW.entity_id IS NULL THEN
    RAISE EXCEPTION 'Head role must have entity_id assigned';
  END IF;
  
  -- Manager should have entity and team
  IF NEW.role = 'manager' THEN
    IF NEW.entity_id IS NULL THEN
      RAISE EXCEPTION 'Manager role must have entity_id assigned';
    END IF;
    IF NEW.division_id IS NULL THEN
      RAISE EXCEPTION 'Manager role must have team (division_id) assigned';
    END IF;
  END IF;
  
  -- Sales/Account Manager should have entity, team, and manager
  IF NEW.role IN ('sales', 'account_manager') THEN
    IF NEW.entity_id IS NULL THEN
      RAISE EXCEPTION 'Sales role must have entity_id assigned';
    END IF;
    IF NEW.division_id IS NULL THEN
      RAISE EXCEPTION 'Sales role must have team (division_id) assigned';
    END IF;
    IF NEW.manager_id IS NULL THEN
      RAISE WARNING 'Sales role should have manager_id assigned';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for validation
DROP TRIGGER IF EXISTS trigger_validate_user_profile ON public.user_profiles;
CREATE TRIGGER trigger_validate_user_profile
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION validate_user_profile_assignment();

-- ============================================================================
-- SUMMARY OF CHANGES
-- ============================================================================

-- What changed:
-- 1. divisions table now represents TEAMS with head_id and entity_id
-- 2. departments table DROPPED (consolidated into teams/divisions)
-- 3. old teams table DROPPED (no longer needed)
-- 4. user_profiles.department_id DROPPED
-- 5. user_profiles.division_id now semantically means "team_id" (kept name for compatibility)
-- 6. Added 'sales' to role_enum as alias for 'account_manager'
-- 7. Added validation trigger for proper role assignments
-- 8. Added indexes for RLS performance

-- New structure:
-- entities (Prosnep, Semut Merah)
--   └── divisions/teams (TIM A, TIM B) with head_id
--        └── user_profiles with role=manager (division_id points to team)
--             └── user_profiles with role=sales (manager_id points to manager)

-- Next steps (separate migrations):
-- 1. Update RLS policies to use entity_id + division_id (team_id) + manager_team_members
-- 2. Update RPC functions to use entity-based scoping
-- 3. Update frontend to use "Team" terminology instead of "Division"

DO $$
BEGIN
  RAISE NOTICE '
╔════════════════════════════════════════════════════════════════╗
║  Migration Complete: Simplified to Entity → Team Structure    ║
╚════════════════════════════════════════════════════════════════╝

Structure:
  entities (companies: Prosnep, Semut Merah)
    └── divisions (now = TEAMS: TIM A, TIM B)
         ├── head_id → user_profiles (Team Leader)
         └── user_profiles.division_id → this team
              ├── role=manager (manages sales)
              └── role=sales (managed by manager)

Next: Update RLS policies and RPC functions
';
END $$;
