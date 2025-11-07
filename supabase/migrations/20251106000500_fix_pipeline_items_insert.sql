-- Fix RLS policy for pipeline_items INSERT
-- Create RPC function to allow creating pipeline_items for opportunities the user owns or can access

BEGIN;

-- Create RPC function for creating pipeline_item
CREATE OR REPLACE FUNCTION public.create_pipeline_item(
  p_opportunity_id uuid,
  p_pipeline_id uuid,
  p_amount numeric DEFAULT NULL,
  p_currency text DEFAULT 'IDR',
  p_status text DEFAULT 'negotiation',
  p_probability integer DEFAULT 10,
  p_expected_close_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_opportunity_owner_id uuid;
  v_user_profile_id uuid;
  v_user_role text;
  v_user_entity_id uuid;
  v_user_division_id uuid;
  v_owner_entity_id uuid;
  v_owner_division_id uuid;
  v_pipeline_item_id uuid;
BEGIN
  -- Get current user ID
  v_uid := auth.uid();
  
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Get opportunity owner
  SELECT owner_id INTO v_opportunity_owner_id
  FROM public.opportunities
  WHERE id = p_opportunity_id
  LIMIT 1;
  
  IF v_opportunity_owner_id IS NULL THEN
    RAISE EXCEPTION 'Opportunity not found';
  END IF;
  
  -- Check if user is owner of the opportunity
  IF v_opportunity_owner_id = v_uid THEN
    -- User owns the opportunity, allow creation
    INSERT INTO public.pipeline_items (
      opportunity_id,
      pipeline_id,
      amount,
      currency,
      status,
      probability,
      expected_close_date
    )
    VALUES (
      p_opportunity_id,
      p_pipeline_id,
      p_amount,
      p_currency,
      p_status,
      p_probability,
      p_expected_close_date
    )
    RETURNING id INTO v_pipeline_item_id;
    
    RETURN v_pipeline_item_id;
  END IF;
  
  -- Check user role (bypassing RLS)
  SELECT 
    id,
    role,
    entity_id,
    division_id
  INTO 
    v_user_profile_id,
    v_user_role,
    v_user_entity_id,
    v_user_division_id
  FROM public.user_profiles
  WHERE user_id = v_uid
  LIMIT 1;
  
  -- Check if admin
  IF v_user_role = 'admin' THEN
    INSERT INTO public.pipeline_items (
      opportunity_id,
      pipeline_id,
      amount,
      currency,
      status,
      probability,
      expected_close_date
    )
    VALUES (
      p_opportunity_id,
      p_pipeline_id,
      p_amount,
      p_currency,
      p_status,
      p_probability,
      p_expected_close_date
    )
    RETURNING id INTO v_pipeline_item_id;
    
    RETURN v_pipeline_item_id;
  END IF;
  
  -- Check if head or manager - need to verify they can access the opportunity
  IF v_user_role IN ('head', 'manager') THEN
    -- Get opportunity owner's profile
    SELECT 
      entity_id,
      division_id
    INTO 
      v_owner_entity_id,
      v_owner_division_id
    FROM public.user_profiles
    WHERE user_id = v_opportunity_owner_id
    LIMIT 1;
    
    -- Head can access if same entity
    IF v_user_role = 'head' AND v_user_entity_id = v_owner_entity_id AND v_user_entity_id IS NOT NULL THEN
      INSERT INTO public.pipeline_items (
        opportunity_id,
        pipeline_id,
        amount,
        currency,
        status,
        probability,
        expected_close_date
      )
      VALUES (
        p_opportunity_id,
        p_pipeline_id,
        p_amount,
        p_currency,
        p_status,
        p_probability,
        p_expected_close_date
      )
      RETURNING id INTO v_pipeline_item_id;
      
      RETURN v_pipeline_item_id;
    END IF;
    
    -- Manager can access if same entity and division
    IF v_user_role = 'manager' 
       AND v_user_entity_id = v_owner_entity_id 
       AND v_user_division_id = v_owner_division_id
       AND v_user_entity_id IS NOT NULL 
       AND v_user_division_id IS NOT NULL THEN
      INSERT INTO public.pipeline_items (
        opportunity_id,
        pipeline_id,
        amount,
        currency,
        status,
        probability,
        expected_close_date
      )
      VALUES (
        p_opportunity_id,
        p_pipeline_id,
        p_amount,
        p_currency,
        p_status,
        p_probability,
        p_expected_close_date
      )
      RETURNING id INTO v_pipeline_item_id;
      
      RETURN v_pipeline_item_id;
    END IF;
  END IF;
  
  -- If we get here, user doesn't have permission
  RAISE EXCEPTION 'You do not have permission to create pipeline items for this opportunity';
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_pipeline_item(uuid, uuid, numeric, text, text, integer, date) TO authenticated;

COMMIT;

