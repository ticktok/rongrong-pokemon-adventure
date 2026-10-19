-- Additive only: does not update game rows, accounts, or the existing commit RPC.
CREATE FUNCTION public.rr_export_backup()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVER_ONLY' USING ERRCODE='42501';
  END IF;
  -- One statement uses one MVCC snapshot across all three tables.
  RETURN (SELECT jsonb_build_object(
    'exportedAt', statement_timestamp(),
    'saves', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.family_id), '[]'::jsonb) FROM public.rr_saves s),
    'members', (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.uid), '[]'::jsonb) FROM public.rr_members m),
    'operations', (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.family_id,o.operation_id), '[]'::jsonb) FROM public.rr_operations o)
  ));
END;
$$;
REVOKE ALL ON FUNCTION public.rr_export_backup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rr_export_backup() TO service_role;
