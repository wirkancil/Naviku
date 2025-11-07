-- Fix RLS policy for admin to update user_profiles
-- This ensures admin can update any user profile including entity_id, division_id, manager_id, and role
-- Solution: Use a separate table or view to check admin status, OR use RPC function for updates

BEGIN;

-- Drop existing update policies that might conflict
DROP POLICY IF EXISTS user_profiles_update ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update_admin_head ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update_self ON public.user_profiles;

-- Create a simple UPDATE policy that allows:
-- 1. Users to update their own profile
-- 2. We'll handle admin updates via RPC function instead of RLS policy
CREATE POLICY user_profiles_update ON public.user_profiles
FOR UPDATE
USING (
  -- Users can update their own profile
  user_id = auth.uid()
)
WITH CHECK (
  -- Users can update their own profile
  user_id = auth.uid()
);

-- Create RPC function for admin to update any user profile
-- This bypasses RLS completely using SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  p_profile_id uuid,
  p_role role_enum DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_division_id uuid DEFAULT NULL,
  p_manager_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_uid uuid;
BEGIN
  -- Check if current user is admin (bypassing RLS)
  v_uid := auth.uid();
  
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Check admin status (this query runs as postgres user, bypassing RLS)
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_profiles 
    WHERE user_id = v_uid 
      AND role = 'admin'
    LIMIT 1
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admin can use this function';
  END IF;
  
  -- Update the profile (bypassing RLS because we're SECURITY DEFINER)
  UPDATE public.user_profiles
  SET 
    role = COALESCE(p_role, role),
    entity_id = COALESCE(p_entity_id, entity_id),
    division_id = COALESCE(p_division_id, division_id),
    manager_id = COALESCE(p_manager_id, manager_id),
    updated_at = now()
  WHERE id = p_profile_id;
  
  RETURN FOUND;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, role_enum, uuid, uuid, uuid) TO authenticated;

COMMIT;

