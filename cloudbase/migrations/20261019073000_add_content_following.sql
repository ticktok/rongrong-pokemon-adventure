-- Existing families remain independent; no save state or account mapping is changed.
ALTER TABLE public.rr_saves
  ADD COLUMN content_source_family_id uuid REFERENCES public.rr_saves(family_id),
  ADD CONSTRAINT rr_saves_content_source_not_self CHECK (content_source_family_id IS DISTINCT FROM family_id);
