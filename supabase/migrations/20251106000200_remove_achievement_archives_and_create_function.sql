-- Remove achievement_archives table (data sudah ada di projects dan pipeline_items)
-- Create function untuk menghitung archived manager langsung dari data yang ada

BEGIN;

-- Drop function yang tidak diperlukan (jika ada)
DROP FUNCTION IF EXISTS public.archive_manager_achievement(UUID, TEXT);

-- Drop policies hanya jika tabel ada
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'achievement_archives') THEN
    DROP POLICY IF EXISTS achievement_archives_insert ON public.achievement_archives;
    DROP POLICY IF EXISTS achievement_archives_select_admin ON public.achievement_archives;
    DROP POLICY IF EXISTS achievement_archives_select_manager ON public.achievement_archives;
    DROP POLICY IF EXISTS achievement_archives_select_head ON public.achievement_archives;
  END IF;
END $$;

-- Drop indexes hanya jika tabel ada
DROP INDEX IF EXISTS public.idx_achievement_archives_division_id;
DROP INDEX IF EXISTS public.idx_achievement_archives_entity_id;
DROP INDEX IF EXISTS public.idx_achievement_archives_period;
DROP INDEX IF EXISTS public.idx_achievement_archives_manager_id;

-- Drop table jika ada
DROP TABLE IF EXISTS public.achievement_archives;

-- Create function untuk menghitung archived manager dari data projects dan pipeline_items
-- Archived = hasil dari account manager ketika add project:
-- - PO amount = revenue
-- - Margin = PO amount - COGS (dari pipeline_items)
CREATE OR REPLACE FUNCTION public.get_manager_archived(
  p_manager_id UUID,
  p_period TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  revenue NUMERIC,
  margin NUMERIC,
  project_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entity_id UUID;
  v_division_id UUID;
  v_start_date DATE;
  v_end_date DATE;
  v_quarter INT;
  v_year INT;
BEGIN
  -- Get manager's entity and division
  SELECT entity_id, division_id
  INTO v_entity_id, v_division_id
  FROM public.user_profiles
  WHERE id = p_manager_id
    AND role = 'manager';

  IF v_entity_id IS NULL OR v_division_id IS NULL THEN
    RAISE EXCEPTION 'Manager not found or missing entity/division assignment';
  END IF;

  -- Parse period jika diberikan
  IF p_period IS NOT NULL AND p_period ~ '^Q[1-4] \d{4}$' THEN
    v_quarter := SUBSTRING(p_period FROM 2 FOR 1)::INT;
    v_year := SUBSTRING(p_period FROM 4)::INT;
    v_start_date := MAKE_DATE(v_year, (v_quarter - 1) * 3 + 1, 1);
    v_end_date := (v_start_date + INTERVAL '3 MONTHS')::DATE - 1;
  ELSIF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start_date := p_start_date;
    v_end_date := p_end_date;
  ELSE
    -- Default: current quarter
    v_start_date := DATE_TRUNC('quarter', CURRENT_DATE)::DATE;
    v_end_date := (v_start_date + INTERVAL '3 MONTHS' - INTERVAL '1 day')::DATE;
  END IF;

  -- Return hasil perhitungan archived dari data yang ada
  RETURN QUERY
  WITH 
  -- Get all active AM/Staff/Sales under this manager (same entity + division)
  team_members AS (
    SELECT up.user_id
    FROM public.user_profiles up
    WHERE up.role IN ('account_manager', 'staff', 'sales')
      AND up.is_active = true
      AND up.entity_id = v_entity_id
      AND up.division_id = v_division_id
      AND up.manager_id = p_manager_id
  ),
  -- Get won opportunities for team in period
  team_opportunities AS (
    SELECT o.id, o.expected_close_date
    FROM public.opportunities o
    JOIN team_members tm ON o.owner_id = tm.user_id
    WHERE (o.is_won = true OR o.stage = 'Closed Won')
      AND o.status != 'archived'
      AND (
        o.expected_close_date >= v_start_date
        AND o.expected_close_date <= v_end_date
      )
  ),
  -- Get projects untuk opportunities yang won (dari form add project)
  team_projects AS (
    SELECT 
      p.opportunity_id,
      p.po_amount,
      p.created_at
    FROM public.projects p
    JOIN team_opportunities to_opp ON p.opportunity_id = to_opp.id
  ),
  -- Get costs dari pipeline_items (COGS = cost_of_goods + service_costs + other_expenses)
  project_costs AS (
    SELECT 
      pi.opportunity_id,
      COALESCE(pi.cost_of_goods, 0) + 
      COALESCE(pi.service_costs, 0) + 
      COALESCE(pi.other_expenses, 0) AS total_cost
    FROM public.pipeline_items pi
    JOIN team_projects tp ON pi.opportunity_id = tp.opportunity_id
    WHERE pi.status = 'won'
      AND (
        pi.cost_of_goods > 0 
        OR pi.service_costs > 0 
        OR pi.other_expenses > 0
      )
  )
  SELECT 
    COALESCE(SUM(tp.po_amount), 0)::NUMERIC AS revenue,
    COALESCE(SUM(tp.po_amount - COALESCE(pc.total_cost, 0)), 0)::NUMERIC AS margin,
    COUNT(DISTINCT tp.opportunity_id)::BIGINT AS project_count
  FROM team_projects tp
  LEFT JOIN project_costs pc ON tp.opportunity_id = pc.opportunity_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_manager_archived(UUID, TEXT, DATE, DATE) TO authenticated;

-- Create function untuk HEAD melihat archived dari semua manager di tim/entity mereka
CREATE OR REPLACE FUNCTION public.get_head_manager_archived(
  p_period TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  manager_id UUID,
  manager_name TEXT,
  entity_id UUID,
  division_id UUID,
  revenue NUMERIC,
  margin NUMERIC,
  project_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_head_profile RECORD;
  v_start_date DATE;
  v_end_date DATE;
  v_quarter INT;
  v_year INT;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get head profile
  SELECT * INTO v_head_profile
  FROM public.user_profiles
  WHERE user_id = v_user_id
    AND role = 'head';

  IF v_head_profile IS NULL THEN
    RAISE EXCEPTION 'User is not a head';
  END IF;

  -- Parse period jika diberikan
  IF p_period IS NOT NULL AND p_period ~ '^Q[1-4] \d{4}$' THEN
    v_quarter := SUBSTRING(p_period FROM 2 FOR 1)::INT;
    v_year := SUBSTRING(p_period FROM 4)::INT;
    v_start_date := MAKE_DATE(v_year, (v_quarter - 1) * 3 + 1, 1);
    v_end_date := (v_start_date + INTERVAL '3 MONTHS')::DATE - 1;
  ELSIF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start_date := p_start_date;
    v_end_date := p_end_date;
  ELSE
    -- Default: current quarter
    v_start_date := DATE_TRUNC('quarter', CURRENT_DATE)::DATE;
    v_end_date := (v_start_date + INTERVAL '3 MONTHS' - INTERVAL '1 day')::DATE;
  END IF;

  -- Return archived untuk semua manager di tim/entity head
  RETURN QUERY
  SELECT 
    m.id AS manager_id,
    m.full_name AS manager_name,
    m.entity_id,
    m.division_id,
    COALESCE(archived.revenue, 0)::NUMERIC AS revenue,
    COALESCE(archived.margin, 0)::NUMERIC AS margin,
    COALESCE(archived.project_count, 0)::BIGINT AS project_count
  FROM public.user_profiles m
  CROSS JOIN LATERAL (
    SELECT * FROM public.get_manager_archived(
      m.id,
      NULL,
      v_start_date,
      v_end_date
    )
  ) archived
  WHERE m.role = 'manager'
    AND m.is_active = true
    AND (
      -- Head melihat manager di tim mereka (division_id)
      (v_head_profile.division_id IS NOT NULL 
       AND m.division_id = v_head_profile.division_id)
      OR
      -- Fallback: Head melihat manager di entity mereka
      (v_head_profile.division_id IS NULL 
       AND v_head_profile.entity_id IS NOT NULL
       AND m.entity_id = v_head_profile.entity_id)
    )
  ORDER BY m.full_name;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_head_manager_archived(TEXT, DATE, DATE) TO authenticated;

COMMIT;

