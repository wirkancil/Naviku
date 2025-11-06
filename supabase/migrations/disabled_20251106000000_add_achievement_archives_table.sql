-- Create achievement_archives table for storing snapshots of manager achievements
BEGIN;

CREATE TABLE IF NOT EXISTS public.achievement_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL,  -- e.g., 'Q4 2025'
  manager_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  division_id UUID REFERENCES public.divisions(id) ON DELETE SET NULL,
  revenue NUMERIC NOT NULL DEFAULT 0,
  margin NUMERIC NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast querying
CREATE INDEX idx_achievement_archives_manager_id ON public.achievement_archives(manager_id);
CREATE INDEX idx_achievement_archives_period ON public.achievement_archives(period);
CREATE INDEX idx_achievement_archives_entity_id ON public.achievement_archives(entity_id);
CREATE INDEX idx_achievement_archives_division_id ON public.achievement_archives(division_id);

-- Enable RLS
ALTER TABLE public.achievement_archives ENABLE ROW LEVEL SECURITY;

-- Policy: Heads can view archives for their entity/division
CREATE POLICY achievement_archives_select_head ON public.achievement_archives
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid()
        AND up.role = 'head'
        AND up.entity_id = achievement_archives.entity_id
        AND up.division_id = achievement_archives.division_id
    )
  );

-- Policy: Managers can view their own archives
CREATE POLICY achievement_archives_select_manager ON public.achievement_archives
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid()
        AND up.role = 'manager'
        AND up.id = achievement_archives.manager_id
    )
  );

-- Policy: Admins can view all
CREATE POLICY achievement_archives_select_admin ON public.achievement_archives
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid()
        AND up.role = 'admin'
    )
  );

-- INSERT policy: Only Heads and Admins can insert (we'll use RPC for insertion)
CREATE POLICY achievement_archives_insert ON public.achievement_archives
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid()
        AND up.role IN ('head', 'admin')
    )
  );

COMMIT;
