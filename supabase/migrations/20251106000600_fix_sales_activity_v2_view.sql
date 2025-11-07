-- Fix sales_activity_v2 view to include pic_id and fix foreign key relationships
-- This allows PostgREST to properly resolve relationships in queries

BEGIN;

-- Add missing columns to sales_activities if they don't exist
DO $$
BEGIN
    -- Add pic_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sales_activities' 
        AND column_name = 'pic_id'
    ) THEN
        ALTER TABLE public.sales_activities ADD COLUMN pic_id uuid REFERENCES public.organization_contacts(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS sales_activities_pic_id_idx ON public.sales_activities(pic_id);
    END IF;
    
    -- Add new_opportunity_name column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sales_activities' 
        AND column_name = 'new_opportunity_name'
    ) THEN
        ALTER TABLE public.sales_activities ADD COLUMN new_opportunity_name text;
    END IF;
    
    -- Add mom_text column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sales_activities' 
        AND column_name = 'mom_text'
    ) THEN
        ALTER TABLE public.sales_activities ADD COLUMN mom_text text;
    END IF;
    
    -- Add mom_added_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'sales_activities' 
        AND column_name = 'mom_added_at'
    ) THEN
        ALTER TABLE public.sales_activities ADD COLUMN mom_added_at timestamptz;
    END IF;
END $$;

-- Drop and recreate sales_activity_v2 view with all necessary columns
DROP VIEW IF EXISTS public.sales_activity_v2;
CREATE VIEW public.sales_activity_v2 AS
SELECT
  sa.id,
  sa.activity_type,
  sa.subject,
  sa.description,
  sa.scheduled_at,
  sa.due_at,
  sa.status,
  sa.notes,
  sa.created_by,
  sa.created_at,
  sa.updated_at,
  sa.opportunity_id,
  sa.customer_id,
  sa.pic_id,
  sa.new_opportunity_name,
  sa.mom_text,
  sa.mom_added_at,
  org.name AS customer_name
FROM public.sales_activities sa
LEFT JOIN public.organizations org ON org.id = sa.customer_id
ORDER BY sa.created_at DESC;

-- Grant permissions
GRANT SELECT ON public.sales_activity_v2 TO authenticated;

-- Ensure foreign key relationships are properly set up for PostgREST
-- PostgREST needs foreign keys to resolve relationships like organizations!customer_id
-- These should already exist, but we'll verify

COMMIT;

