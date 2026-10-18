CREATE TABLE public.rr_members (
  uid text PRIMARY KEY,
  family_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('parent','child'))
);
CREATE TABLE public.rr_saves (
  family_id uuid PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 0,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.rr_operations (
  family_id uuid NOT NULL REFERENCES public.rr_saves(family_id),
  operation_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, operation_id)
);
ALTER TABLE public.rr_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rr_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rr_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rr_members, public.rr_saves, public.rr_operations FROM anon, authenticated;
GRANT ALL ON public.rr_members, public.rr_saves, public.rr_operations TO service_role;

CREATE FUNCTION public.rr_commit(p_family uuid, p_operation uuid, p_revision bigint, p_state jsonb, p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE current_save public.rr_saves%ROWTYPE; previous_result jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVER_ONLY' USING ERRCODE='42501';
  END IF;
  SELECT * INTO current_save FROM public.rr_saves WHERE family_id=p_family FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SAVE_NOT_FOUND'; END IF;
  SELECT result INTO previous_result FROM public.rr_operations
    WHERE family_id=p_family AND operation_id=p_operation;
  IF FOUND THEN RETURN jsonb_build_object('state',current_save.state,'revision',current_save.revision,'result',previous_result); END IF;
  IF current_save.revision <> p_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  UPDATE public.rr_saves SET state=p_state,revision=revision+1,updated_at=now() WHERE family_id=p_family;
  INSERT INTO public.rr_operations(family_id,operation_id,result) VALUES(p_family,p_operation,p_result);
  RETURN jsonb_build_object('state',p_state,'revision',p_revision+1,'result',p_result);
END;
$$;
REVOKE ALL ON FUNCTION public.rr_commit(uuid,uuid,bigint,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rr_commit(uuid,uuid,bigint,jsonb,jsonb) TO service_role;
