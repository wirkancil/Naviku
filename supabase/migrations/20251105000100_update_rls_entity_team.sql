-- Update RLS policies to use Entity + Team (division_id) based scoping
-- This replaces division/department checks with entity + team checks
-- Following Entity → Team → Head → Manager → Sales hierarchy

-- ============================================================================
-- OPPORTUNITIES - SELECT (Read)
-- ============================================================================

DROP POLICY IF EXISTS opportunities_select ON public.opportunities;
CREATE POLICY opportunities_select ON public.opportunities
FOR SELECT TO authenticated
USING (
  -- 1. ADMIN: see everything
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
  
  -- 2. HEAD: see all opportunities in their entity
  --    (Later can be scoped to specific teams via team assignment)
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    JOIN public.user_profiles owner ON owner.user_id = public.opportunities.owner_id
    WHERE me.user_id = auth.uid() 
      AND me.role = 'head'
      AND owner.entity_id = me.entity_id
      AND owner.entity_id IS NOT NULL
  )
  
  -- 3. MANAGER: see opportunities from their team (same division_id = team_id)
  --    Also check via manager_team_members for explicit mapping
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    JOIN public.user_profiles owner ON owner.user_id = public.opportunities.owner_id
    WHERE me.user_id = auth.uid() 
      AND me.role = 'manager'
      AND owner.entity_id = me.entity_id
      AND owner.division_id = me.division_id -- same team
      AND owner.entity_id IS NOT NULL
      AND owner.division_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    JOIN public.manager_team_members mtm ON mtm.manager_id = me.id
    JOIN public.user_profiles owner ON owner.user_id = public.opportunities.owner_id AND owner.id = mtm.account_manager_id
    WHERE me.user_id = auth.uid()
      AND me.role = 'manager'
      AND owner.entity_id = me.entity_id
  )
  
  -- 4. SALES/ACCOUNT_MANAGER: see own opportunities only
  OR public.opportunities.owner_id = auth.uid()
);

COMMENT ON POLICY opportunities_select ON public.opportunities IS 
'Entity-based scoping: Admin sees all, Head sees entity, Manager sees team (division_id), Sales sees own';

-- ============================================================================
-- OPPORTUNITIES - INSERT (Create)
-- ============================================================================

DROP POLICY IF EXISTS opportunities_insert_policy ON public.opportunities;
CREATE POLICY opportunities_insert_policy ON public.opportunities
FOR INSERT TO authenticated
WITH CHECK (
  -- User creates opportunities they own
  owner_id = auth.uid()
  
  -- Or admin/head/manager can create for their team
  OR EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() 
      AND up.role IN ('admin', 'head', 'manager')
  )
);

-- ============================================================================
-- OPPORTUNITIES - UPDATE (Edit)
-- ============================================================================

DROP POLICY IF EXISTS opportunities_update_policy ON public.opportunities;
CREATE POLICY opportunities_update_policy ON public.opportunities
FOR UPDATE TO authenticated
USING (
  -- Own opportunities
  owner_id = auth.uid()
  
  -- Admin: update all
  OR EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
  
  -- Head: update opportunities in their entity
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    JOIN public.user_profiles owner ON owner.user_id = public.opportunities.owner_id
    WHERE me.user_id = auth.uid()
      AND me.role = 'head'
      AND owner.entity_id = me.entity_id
      AND owner.entity_id IS NOT NULL
  )
  
  -- Manager: update team opportunities (same team/division)
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    JOIN public.user_profiles owner ON owner.user_id = public.opportunities.owner_id
    WHERE me.user_id = auth.uid()
      AND me.role = 'manager'
      AND owner.entity_id = me.entity_id
      AND owner.division_id = me.division_id
      AND owner.entity_id IS NOT NULL
      AND owner.division_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    JOIN public.manager_team_members mtm ON mtm.manager_id = me.id
    JOIN public.user_profiles owner ON owner.user_id = public.opportunities.owner_id AND owner.id = mtm.account_manager_id
    WHERE me.user_id = auth.uid()
      AND me.role = 'manager'
      AND owner.entity_id = me.entity_id
  )
)
WITH CHECK (
  -- Same conditions as USING clause
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role IN ('admin', 'head')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    JOIN public.user_profiles owner ON owner.user_id = public.opportunities.owner_id
    WHERE me.user_id = auth.uid()
      AND me.role = 'manager'
      AND owner.entity_id = me.entity_id
      AND owner.division_id = me.division_id
  )
);

-- ============================================================================
-- OPPORTUNITIES - DELETE
-- ============================================================================

DROP POLICY IF EXISTS opportunities_delete_policy ON public.opportunities;
CREATE POLICY opportunities_delete_policy ON public.opportunities
FOR DELETE TO authenticated
USING (
  -- Own opportunities
  owner_id = auth.uid()
  
  -- Admin: delete all
  OR EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
  
  -- Head: delete opportunities in their entity
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    JOIN public.user_profiles owner ON owner.user_id = public.opportunities.owner_id
    WHERE me.user_id = auth.uid()
      AND me.role = 'head'
      AND owner.entity_id = me.entity_id
      AND owner.entity_id IS NOT NULL
  )
  
  -- Manager: delete team opportunities
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    JOIN public.user_profiles owner ON owner.user_id = public.opportunities.owner_id
    WHERE me.user_id = auth.uid()
      AND me.role = 'manager'
      AND owner.entity_id = me.entity_id
      AND owner.division_id = me.division_id
      AND owner.entity_id IS NOT NULL
      AND owner.division_id IS NOT NULL
  )
);

-- ============================================================================
-- PIPELINE_ITEMS - SELECT (via opportunity ownership)
-- ============================================================================

DROP POLICY IF EXISTS pipeline_items_select ON public.pipeline_items;
CREATE POLICY pipeline_items_select ON public.pipeline_items
FOR SELECT TO authenticated
USING (
  -- Admin: see all
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
  
  -- Head: see pipeline items where opportunity owner is in their entity
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    JOIN public.opportunities o ON o.id = public.pipeline_items.opportunity_id
    JOIN public.user_profiles owner ON owner.user_id = o.owner_id
    WHERE me.user_id = auth.uid()
      AND me.role = 'head'
      AND owner.entity_id = me.entity_id
      AND owner.entity_id IS NOT NULL
  )
  
  -- Manager: see pipeline items where opportunity owner is in their team
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    JOIN public.opportunities o ON o.id = public.pipeline_items.opportunity_id
    JOIN public.user_profiles owner ON owner.user_id = o.owner_id
    WHERE me.user_id = auth.uid()
      AND me.role = 'manager'
      AND owner.entity_id = me.entity_id
      AND owner.division_id = me.division_id
      AND owner.entity_id IS NOT NULL
      AND owner.division_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    JOIN public.manager_team_members mtm ON mtm.manager_id = me.id
    JOIN public.opportunities o ON o.id = public.pipeline_items.opportunity_id
    JOIN public.user_profiles owner ON owner.user_id = o.owner_id AND owner.id = mtm.account_manager_id
    WHERE me.user_id = auth.uid()
      AND me.role = 'manager'
  )
  
  -- Sales: see own pipeline items
  OR EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = public.pipeline_items.opportunity_id 
      AND o.owner_id = auth.uid()
  )
);

-- ============================================================================
-- USER_PROFILES - SELECT (Enhanced)
-- ============================================================================

DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
CREATE POLICY user_profiles_select ON public.user_profiles
FOR SELECT TO authenticated
USING (
  -- Own profile
  user_id = auth.uid()
  
  -- Admin: see all profiles
  OR EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
  
  -- Head: see all profiles in their entity
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    WHERE me.user_id = auth.uid()
      AND me.role = 'head'
      AND public.user_profiles.entity_id = me.entity_id
      AND public.user_profiles.entity_id IS NOT NULL
  )
  
  -- Manager: see profiles in their team
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    WHERE me.user_id = auth.uid()
      AND me.role = 'manager'
      AND public.user_profiles.entity_id = me.entity_id
      AND public.user_profiles.division_id = me.division_id
      AND public.user_profiles.entity_id IS NOT NULL
      AND public.user_profiles.division_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.user_profiles me
    JOIN public.manager_team_members mtm ON mtm.manager_id = me.id
    WHERE me.user_id = auth.uid()
      AND me.role = 'manager'
      AND public.user_profiles.id = mtm.account_manager_id
  )
);

-- ============================================================================
-- SALES_ACTIVITIES - Add entity-based scoping
-- ============================================================================

-- Check if sales_activities table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_activities' AND table_schema = 'public') THEN
    
    -- Enable RLS
    EXECUTE 'ALTER TABLE public.sales_activities ENABLE ROW LEVEL SECURITY';
    
    -- Drop existing policies
    DROP POLICY IF EXISTS sales_activities_select ON public.sales_activities;
    DROP POLICY IF EXISTS sales_activities_insert ON public.sales_activities;
    DROP POLICY IF EXISTS sales_activities_update ON public.sales_activities;
    DROP POLICY IF EXISTS sales_activities_delete ON public.sales_activities;
    
    -- SELECT: see activities based on hierarchy
    CREATE POLICY sales_activities_select ON public.sales_activities
    FOR SELECT TO authenticated
    USING (
      -- Admin: see all
      EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.user_id = auth.uid() AND up.role = 'admin'
      )
      
      -- Head: see all activities in their entity
      OR EXISTS (
        SELECT 1 FROM public.user_profiles me
        JOIN public.user_profiles creator ON creator.user_id = public.sales_activities.created_by
        WHERE me.user_id = auth.uid()
          AND me.role = 'head'
          AND creator.entity_id = me.entity_id
          AND creator.entity_id IS NOT NULL
      )
      
      -- Manager: see activities from their team
      OR EXISTS (
        SELECT 1 FROM public.user_profiles me
        JOIN public.user_profiles creator ON creator.user_id = public.sales_activities.created_by
        WHERE me.user_id = auth.uid()
          AND me.role = 'manager'
          AND creator.entity_id = me.entity_id
          AND creator.division_id = me.division_id
          AND creator.entity_id IS NOT NULL
          AND creator.division_id IS NOT NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.user_profiles me
        JOIN public.manager_team_members mtm ON mtm.manager_id = me.id
        JOIN public.user_profiles creator ON creator.user_id = public.sales_activities.created_by AND creator.id = mtm.account_manager_id
        WHERE me.user_id = auth.uid()
          AND me.role = 'manager'
      )
      
      -- Sales: see own activities
      OR public.sales_activities.created_by = auth.uid()
    );
    
    -- INSERT: create own activities or admin/head/manager can create
    CREATE POLICY sales_activities_insert ON public.sales_activities
    FOR INSERT TO authenticated
    WITH CHECK (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.user_id = auth.uid() 
          AND up.role IN ('admin', 'head', 'manager')
      )
    );
    
    -- UPDATE: update own or manage based on hierarchy
    CREATE POLICY sales_activities_update ON public.sales_activities
    FOR UPDATE TO authenticated
    USING (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.user_id = auth.uid() AND up.role IN ('admin', 'head', 'manager')
      )
    )
    WITH CHECK (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.user_id = auth.uid() AND up.role IN ('admin', 'head', 'manager')
      )
    );
    
    -- DELETE: delete own or admin/head can delete
    CREATE POLICY sales_activities_delete ON public.sales_activities
    FOR DELETE TO authenticated
    USING (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.user_id = auth.uid() AND up.role IN ('admin', 'head')
      )
    );
    
    RAISE NOTICE 'Updated RLS policies for sales_activities';
  END IF;
END $$;

-- ============================================================================
-- ENTITIES - Admin can manage, all can read
-- ============================================================================

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entities_select ON public.entities;
CREATE POLICY entities_select ON public.entities
FOR SELECT TO authenticated
USING (true); -- All authenticated users can see entities

DROP POLICY IF EXISTS entities_insert ON public.entities;
CREATE POLICY entities_insert ON public.entities
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
);

DROP POLICY IF EXISTS entities_update ON public.entities;
CREATE POLICY entities_update ON public.entities
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
);

DROP POLICY IF EXISTS entities_delete ON public.entities;
CREATE POLICY entities_delete ON public.entities
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
);

-- ============================================================================
-- DIVISIONS (TEAMS) - Admin can manage, others can read their scope
-- ============================================================================

ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS divisions_select ON public.divisions;
CREATE POLICY divisions_select ON public.divisions
FOR SELECT TO authenticated
USING (
  -- Admin: see all teams
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
  
  -- Head: see teams they lead (via head_id) or teams in their entity
  OR public.divisions.head_id IN (
    SELECT id FROM public.user_profiles WHERE user_id = auth.uid()
  )
  OR public.divisions.entity_id IN (
    SELECT entity_id FROM public.user_profiles 
    WHERE user_id = auth.uid() AND role = 'head'
  )
  
  -- Manager/Sales: see their own team
  OR public.divisions.id IN (
    SELECT division_id FROM public.user_profiles 
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS divisions_insert ON public.divisions;
CREATE POLICY divisions_insert ON public.divisions
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
);

DROP POLICY IF EXISTS divisions_update ON public.divisions;
CREATE POLICY divisions_update ON public.divisions
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
);

DROP POLICY IF EXISTS divisions_delete ON public.divisions;
CREATE POLICY divisions_delete ON public.divisions
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'admin'
  )
);

-- ============================================================================
-- SUMMARY
-- ============================================================================

COMMENT ON POLICY opportunities_select ON public.opportunities IS 
'Entity + Team scoping: Admin→all, Head→entity, Manager→team (via division_id + manager_team_members), Sales→own';

COMMENT ON POLICY user_profiles_select ON public.user_profiles IS
'Entity + Team scoping: Admin→all, Head→entity, Manager→team, Sales→own';

DO $$
BEGIN
  RAISE NOTICE '
╔════════════════════════════════════════════════════════════════╗
║  RLS Policies Updated: Entity + Team Based Scoping            ║
╚════════════════════════════════════════════════════════════════╝

Updated policies for:
  ✓ opportunities (SELECT, INSERT, UPDATE, DELETE)
  ✓ pipeline_items (SELECT)
  ✓ user_profiles (SELECT)
  ✓ sales_activities (SELECT, INSERT, UPDATE, DELETE)
  ✓ entities (all operations)
  ✓ divisions/teams (all operations)

Scoping logic:
  • Admin: sees ALL data across all entities
  • Head: sees data in their entity (by entity_id match)
  • Manager: sees data in their team (by entity_id + division_id match + manager_team_members)
  • Sales: sees only their own data (by owner_id/created_by)

Note: division_id now semantically represents team_id
';
END $$;
