-- Create function to archive manager achievement
BEGIN;

CREATE OR REPLACE FUNCTION public.archive_manager_achievement(p_manager_id UUID, p_period TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entity_id UUID;
  v_division_id UUID;
  v_revenue NUMERIC := 0;
  v_margin NUMERIC := 0;
  v_quarter INT;
  v_year INT;
  v_start_date DATE;
  v_end_date DATE;
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

  -- Parse period (e.g., 'Q4 2025') to date range
  IF p_period ~ '^Q[1-4] \d{4}$' THEN
    v_quarter := SUBSTRING(p_period FROM 2 FOR 1)::INT;
    v_year := SUBSTRING(p_period FROM 4)::INT;
    v_start_date := MAKE_DATE(v_year, (v_quarter - 1) * 3 + 1, 1);
    v_end_date := (v_start_date + INTERVAL '3 MONTHS')::DATE - 1;
  ELSE
    RAISE EXCEPTION 'Invalid period format. Use "Q1 2025" format.';
  END IF;

  -- Get all active AM/Staff/Sales under this manager (same entity + division)
  WITH team_members AS (
    SELECT up.user_id
    FROM public.user_profiles up
    WHERE up.role IN ('account_manager', 'staff', 'sales')
      AND up.is_active = true
      AND up.entity_id = v_entity_id
      AND up.division_id = v_division_id
      AND (up.manager_id = p_manager_id OR up.manager_id IS NULL)  -- Include explicit and implicit team members
  ),
  -- Get won opportunities for team in period
  team_opportunities AS (
    SELECT o.id
    FROM public.opportunities o
    JOIN team_members tm ON o.owner_id = tm.user_id
    WHERE (o.is_won = true OR o.stage = 'Closed Won')
      AND o.expected_close_date >= v_start_date
      AND o.expected_close_date <= v_end_date
      AND o.status != 'archived'
  ),
  -- Get projects for these opportunities
  team_projects AS (
    SELECT p.po_amount, p.opportunity_id
    FROM public.projects p
    JOIN team_opportunities to ON p.opportunity_id = to.id
  ),
  -- Get costs from pipeline_items (only if costs exist)
  project_costs AS (
    SELECT 
      pi.opportunity_id,
      COALESCE(pi.cost_of_goods, 0) + COALESCE(pi.service_costs, 0) + COALESCE(pi.other_expenses, 0) AS total_cost
    FROM public.pipeline_items pi
    JOIN team_projects tp ON pi.opportunity_id = tp.opportunity_id
    WHERE pi.status = 'won'
      AND (pi.cost_of_goods > 0 OR pi.service_costs > 0 OR pi.other_expenses > 0)  -- Only include if costs exist
  )

  -- Calculate aggregates
  SELECT 
    COALESCE(SUM(tp.po_amount), 0) INTO v_revenue
  FROM team_projects tp;

  SELECT 
    COALESCE(SUM(tp.po_amount - COALESCE(pc.total_cost, 0)), 0) INTO v_margin
  FROM team_projects tp
  LEFT JOIN project_costs pc ON tp.opportunity_id = pc.opportunity_id;

  -- Insert snapshot
  INSERT INTO public.achievement_archives (
    period, manager_id, entity_id, division_id, revenue, margin
  ) VALUES (
    p_period, p_manager_id, v_entity_id, v_division_id, v_revenue, v_margin
  );

  RAISE NOTICE 'Achievement archived for manager % in period %: Revenue %, Margin %', p_manager_id, p_period, v_revenue, v_margin;
END;
$$;

-- Grant execute to authenticated users (but RLS will control access)
GRANT EXECUTE ON FUNCTION public.archive_manager_achievement(UUID, TEXT) TO authenticated;

COMMIT;
