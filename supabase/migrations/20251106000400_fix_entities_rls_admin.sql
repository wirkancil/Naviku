-- Fix RLS policy for entities table to allow admin to create/update/delete
-- Using RPC functions to avoid RLS recursion issues

BEGIN;

-- Create RPC function for admin to create entity
CREATE OR REPLACE FUNCTION public.admin_create_entity(
  p_name text,
  p_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_uid uuid;
  v_entity_id uuid;
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
    RAISE EXCEPTION 'Only admin can create entities';
  END IF;
  
  -- Insert the entity (bypassing RLS because we're SECURITY DEFINER)
  INSERT INTO public.entities (name, code, is_active, created_by)
  VALUES (p_name, p_code, true, v_uid)
  RETURNING id INTO v_entity_id;
  
  RETURN v_entity_id;
END;
$$;

-- Create RPC function for admin to update entity
CREATE OR REPLACE FUNCTION public.admin_update_entity(
  p_entity_id uuid,
  p_name text DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
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
  
  -- Check admin status
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_profiles 
    WHERE user_id = v_uid 
      AND role = 'admin'
    LIMIT 1
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admin can update entities';
  END IF;
  
  -- Update the entity (bypassing RLS because we're SECURITY DEFINER)
  UPDATE public.entities
  SET 
    name = COALESCE(p_name, name),
    code = COALESCE(p_code, code),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_entity_id;
  
  RETURN FOUND;
END;
$$;

-- Create RPC function for admin to delete entity
CREATE OR REPLACE FUNCTION public.admin_delete_entity(
  p_entity_id uuid
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
  
  -- Check admin status
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_profiles 
    WHERE user_id = v_uid 
      AND role = 'admin'
    LIMIT 1
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admin can delete entities';
  END IF;
  
  -- Delete the entity (bypassing RLS because we're SECURITY DEFINER)
  DELETE FROM public.entities
  WHERE id = p_entity_id;
  
  RETURN FOUND;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_create_entity(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_entity(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_entity(uuid) TO authenticated;

COMMIT;

