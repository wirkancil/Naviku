-- Update RPC functions for Entity + Team based scoping
-- This updates get_entity_scoped_opportunities and get_entity_scoped_targets
-- to use entity_id + team (division_id) instead of division/department

-- ============================================================================
-- Helper: get effective user profile (updated to return entity_id)
-- ============================================================================

-- Drop old function first (signature changed - added entity_id column)
DROP FUNCTION IF EXISTS public._get_effective_user_profile(UUID);

CREATE OR REPLACE FUNCTION public._get_effective_user_profile(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  user_id UUID, 
  profile_id UUID, 
  role role_enum, 
  entity_id UUID,
  division_id UUID
)
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT 
    up.user_id,
    up.id AS profile_id,
    up.role,
    up.entity_id,
    up.division_id -- This is now semantically "team_id"
  FROM public.user_profiles up
  WHERE up.user_id = COALESCE(p_user_id, auth.uid())
  LIMIT 1;
$$;

COMMENT ON FUNCTION public._get_effective_user_profile IS 
'Returns user profile info including entity_id and team (division_id). Used by entity-scoped RPCs.';

-- ============================================================================
-- get_entity_scoped_opportunities() - no-arg variant
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_entity_scoped_opportunities()
RETURNS TABLE (
  id UUID,
  name TEXT,
  amount NUMERIC,
  stage TEXT,
  owner_id UUID,
  customer_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id UUID;
  v_profile_id UUID;
  v_role role_enum;
  v_entity UUID;
  v_team UUID; -- formerly v_division
BEGIN
  -- Get user profile info
  SELECT user_id, profile_id, role, entity_id, division_id
    INTO v_user_id, v_profile_id, v_role, v_entity, v_team
  FROM public._get_effective_user_profile(NULL);

  IF v_role = 'admin' THEN
    -- Admin: see ALL opportunities
    RETURN QUERY
    SELECT o.id, o.name, COALESCE(o.amount, 0), o.stage::TEXT, o.owner_id, o.customer_id, o.created_at
    FROM public.opportunities o;
    
  ELSIF v_role = 'head' THEN
    -- Head: see all opportunities in their entity
    RETURN QUERY
    SELECT o.id, o.name, COALESCE(o.amount, 0), o.stage::TEXT, o.owner_id, o.customer_id, o.created_at
    FROM public.opportunities o
    JOIN public.user_profiles owner ON owner.user_id = o.owner_id
    WHERE owner.entity_id = v_entity
      AND owner.entity_id IS NOT NULL;
    
  ELSIF v_role = 'manager' THEN
    -- Manager: see opportunities from their team (same entity + team)
    -- Option 1: via team match (division_id)
    -- Option 2: via manager_team_members explicit mapping
    RETURN QUERY
    SELECT o.id, o.name, COALESCE(o.amount, 0), o.stage::TEXT, o.owner_id, o.customer_id, o.created_at
    FROM public.opportunities o
    JOIN public.user_profiles owner ON owner.user_id = o.owner_id
    WHERE owner.entity_id = v_entity
      AND owner.entity_id IS NOT NULL
      AND (
        -- Same team
        (owner.division_id = v_team AND v_team IS NOT NULL)
        -- OR explicitly managed via manager_team_members
        OR EXISTS (
          SELECT 1 FROM public.manager_team_members mtm
          WHERE mtm.manager_id = v_profile_id
            AND mtm.account_manager_id = owner.id
        )
      );
  ELSE
    -- Sales/Account Manager: return own opportunities only
    RETURN QUERY
    SELECT o.id, o.name, COALESCE(o.amount, 0), o.stage::TEXT, o.owner_id, o.customer_id, o.created_at
    FROM public.opportunities o
    WHERE o.owner_id = v_user_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_entity_scoped_opportunities() IS
'Returns opportunities scoped by role: Admin→all, Head→entity, Manager→team, Sales→own. Entity-based scoping.';

-- ============================================================================
-- get_entity_scoped_opportunities(p_user_id) - param variant
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_entity_scoped_opportunities(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  amount NUMERIC,
  stage TEXT,
  owner_id UUID,
  customer_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id UUID;
  v_profile_id UUID;
  v_role role_enum;
  v_entity UUID;
  v_team UUID;
BEGIN
  -- Get user profile info for specified user
  SELECT user_id, profile_id, role, entity_id, division_id
    INTO v_user_id, v_profile_id, v_role, v_entity, v_team
  FROM public._get_effective_user_profile(p_user_id);

  IF v_role = 'admin' THEN
    RETURN QUERY
    SELECT o.id, o.name, COALESCE(o.amount, 0), o.stage::TEXT, o.owner_id, o.customer_id, o.created_at
    FROM public.opportunities o;
    
  ELSIF v_role = 'head' THEN
    RETURN QUERY
    SELECT o.id, o.name, COALESCE(o.amount, 0), o.stage::TEXT, o.owner_id, o.customer_id, o.created_at
    FROM public.opportunities o
    JOIN public.user_profiles owner ON owner.user_id = o.owner_id
    WHERE owner.entity_id = v_entity
      AND owner.entity_id IS NOT NULL;
    
  ELSIF v_role = 'manager' THEN
    RETURN QUERY
    SELECT o.id, o.name, COALESCE(o.amount, 0), o.stage::TEXT, o.owner_id, o.customer_id, o.created_at
    FROM public.opportunities o
    JOIN public.user_profiles owner ON owner.user_id = o.owner_id
    WHERE owner.entity_id = v_entity
      AND owner.entity_id IS NOT NULL
      AND (
        (owner.division_id = v_team AND v_team IS NOT NULL)
        OR EXISTS (
          SELECT 1 FROM public.manager_team_members mtm
          WHERE mtm.manager_id = v_profile_id
            AND mtm.account_manager_id = owner.id
        )
      );
  ELSE
    RETURN QUERY
    SELECT o.id, o.name, COALESCE(o.amount, 0), o.stage::TEXT, o.owner_id, o.customer_id, o.created_at
    FROM public.opportunities o
    WHERE o.owner_id = v_user_id;
  END IF;
END;
$$;

-- ============================================================================
-- get_entity_scoped_targets() - no-arg variant
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_entity_scoped_targets()
RETURNS TABLE (
  id UUID,
  assigned_to UUID,
  amount NUMERIC,
  period_start DATE,
  period_end DATE,
  measure TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id UUID;
  v_profile_id UUID;
  v_role role_enum;
  v_entity UUID;
  v_team UUID;
BEGIN
  SELECT user_id, profile_id, role, entity_id, division_id
    INTO v_user_id, v_profile_id, v_role, v_entity, v_team
  FROM public._get_effective_user_profile(NULL);

  IF v_role = 'admin' THEN
    -- Admin: see ALL targets
    RETURN QUERY
    SELECT st.id, st.assigned_to, COALESCE(st.amount, 0), st.period_start, st.period_end, st.measure
    FROM public.sales_targets st;
    
  ELSIF v_role = 'head' THEN
    -- Head: see all targets in their entity
    -- Targets are assigned to user_profiles.id, so join to check entity
    RETURN QUERY
    SELECT st.id, st.assigned_to, COALESCE(st.amount, 0), st.period_start, st.period_end, st.measure
    FROM public.sales_targets st
    JOIN public.user_profiles assignee ON assignee.id = st.assigned_to
    WHERE assignee.entity_id = v_entity
      AND assignee.entity_id IS NOT NULL;
    
  ELSIF v_role = 'manager' THEN
    -- Manager: see targets for their team members
    RETURN QUERY
    SELECT st.id, st.assigned_to, COALESCE(st.amount, 0), st.period_start, st.period_end, st.measure
    FROM public.sales_targets st
    JOIN public.user_profiles assignee ON assignee.id = st.assigned_to
    WHERE assignee.entity_id = v_entity
      AND assignee.entity_id IS NOT NULL
      AND (
        -- Same team
        (assignee.division_id = v_team AND v_team IS NOT NULL)
        -- OR explicitly managed
        OR EXISTS (
          SELECT 1 FROM public.manager_team_members mtm
          WHERE mtm.manager_id = v_profile_id
            AND mtm.account_manager_id = st.assigned_to
        )
      );
  ELSE
    -- Sales: return own targets
    RETURN QUERY
    SELECT st.id, st.assigned_to, COALESCE(st.amount, 0), st.period_start, st.period_end, st.measure
    FROM public.sales_targets st
    WHERE st.assigned_to = v_profile_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_entity_scoped_targets() IS
'Returns sales targets scoped by role: Admin→all, Head→entity, Manager→team, Sales→own. Entity-based scoping.';

-- ============================================================================
-- get_entity_scoped_targets(p_user_id) - param variant
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_entity_scoped_targets(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  assigned_to UUID,
  amount NUMERIC,
  period_start DATE,
  period_end DATE,
  measure TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id UUID;
  v_profile_id UUID;
  v_role role_enum;
  v_entity UUID;
  v_team UUID;
BEGIN
  SELECT user_id, profile_id, role, entity_id, division_id
    INTO v_user_id, v_profile_id, v_role, v_entity, v_team
  FROM public._get_effective_user_profile(p_user_id);

  IF v_role = 'admin' THEN
    RETURN QUERY
    SELECT st.id, st.assigned_to, COALESCE(st.amount, 0), st.period_start, st.period_end, st.measure
    FROM public.sales_targets st;
    
  ELSIF v_role = 'head' THEN
    RETURN QUERY
    SELECT st.id, st.assigned_to, COALESCE(st.amount, 0), st.period_start, st.period_end, st.measure
    FROM public.sales_targets st
    JOIN public.user_profiles assignee ON assignee.id = st.assigned_to
    WHERE assignee.entity_id = v_entity
      AND assignee.entity_id IS NOT NULL;
    
  ELSIF v_role = 'manager' THEN
    RETURN QUERY
    SELECT st.id, st.assigned_to, COALESCE(st.amount, 0), st.period_start, st.period_end, st.measure
    FROM public.sales_targets st
    JOIN public.user_profiles assignee ON assignee.id = st.assigned_to
    WHERE assignee.entity_id = v_entity
      AND assignee.entity_id IS NOT NULL
      AND (
        (assignee.division_id = v_team AND v_team IS NOT NULL)
        OR EXISTS (
          SELECT 1 FROM public.manager_team_members mtm
          WHERE mtm.manager_id = v_profile_id
            AND mtm.account_manager_id = st.assigned_to
        )
      );
  ELSE
    RETURN QUERY
    SELECT st.id, st.assigned_to, COALESCE(st.amount, 0), st.period_start, st.period_end, st.measure
    FROM public.sales_targets st
    WHERE st.assigned_to = v_profile_id;
  END IF;
END;
$$;

-- ============================================================================
-- Grant permissions (ensure authenticated users can call these)
-- ============================================================================

GRANT EXECUTE ON FUNCTION public._get_effective_user_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_entity_scoped_opportunities() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_entity_scoped_opportunities(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_entity_scoped_targets() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_entity_scoped_targets(UUID) TO authenticated;

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '
╔════════════════════════════════════════════════════════════════╗
║  RPC Functions Updated: Entity + Team Based Scoping           ║
╚════════════════════════════════════════════════════════════════╝

Updated functions:
  ✓ _get_effective_user_profile() - now returns entity_id + division_id (team)
  ✓ get_entity_scoped_opportunities() - entity + team scoping
  ✓ get_entity_scoped_opportunities(user_id) - entity + team scoping
  ✓ get_entity_scoped_targets() - entity + team scoping  
  ✓ get_entity_scoped_targets(user_id) - entity + team scoping

Scoping logic:
  • Admin: returns ALL records
  • Head: returns records where owner/assignee.entity_id matches
  • Manager: returns records where owner/assignee in same entity + team
             (via division_id match OR manager_team_members)
  • Sales: returns only own records

Note: division_id is now semantically team_id
';
END $$;
