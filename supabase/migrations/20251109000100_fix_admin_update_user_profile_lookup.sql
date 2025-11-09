BEGIN;

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
  v_target_profile_id uuid;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

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

  SELECT id
  INTO v_target_profile_id
  FROM public.user_profiles
  WHERE id = p_profile_id
     OR user_id = p_profile_id
  LIMIT 1;

  IF v_target_profile_id IS NULL THEN
    RAISE NOTICE 'Profile not found for identifier %', p_profile_id;
    RETURN FALSE;
  END IF;

  UPDATE public.user_profiles
  SET
    role = COALESCE(p_role, role),
    entity_id = COALESCE(p_entity_id, entity_id),
    division_id = COALESCE(p_division_id, division_id),
    manager_id = COALESCE(p_manager_id, manager_id),
    updated_at = now()
  WHERE id = v_target_profile_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, role_enum, uuid, uuid, uuid) TO authenticated;

COMMIT;

