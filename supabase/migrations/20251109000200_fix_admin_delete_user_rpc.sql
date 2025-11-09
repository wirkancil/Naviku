BEGIN;

DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM user_profiles
  WHERE user_id = auth.uid();

  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  SELECT id, user_id INTO v_profile_id, v_user_id
  FROM user_profiles
  WHERE id = p_id;

  IF v_profile_id IS NULL THEN
    SELECT id, user_id INTO v_profile_id, v_user_id
    FROM user_profiles
    WHERE user_id = p_id;
  END IF;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  SELECT role INTO v_role
  FROM user_profiles
  WHERE id = v_profile_id;

  IF v_role = 'admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot delete admin users'
    );
  END IF;

  IF v_user_id = auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot delete your own account'
    );
  END IF;

  DELETE FROM manager_team_members
  WHERE manager_id = v_profile_id OR account_manager_id = v_profile_id;

  DELETE FROM sales_targets
  WHERE assigned_to = v_profile_id;

  WITH fallback_admin AS (
    SELECT up.user_id
    FROM user_profiles up
    WHERE up.role = 'admin'
      AND up.user_id != v_user_id
    ORDER BY up.created_at
    LIMIT 1
  )
  UPDATE opportunities
  SET owner_id = COALESCE((SELECT user_id FROM fallback_admin), owner_id),
      created_by = COALESCE((SELECT user_id FROM fallback_admin), created_by)
  WHERE owner_id = v_user_id;

  DELETE FROM sales_activities
  WHERE created_by = v_user_id;

  DELETE FROM deals
  WHERE user_id = v_user_id;

  DELETE FROM user_profiles
  WHERE id = v_profile_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User profile deleted successfully. Auth user still exists in auth.users'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

COMMIT;

