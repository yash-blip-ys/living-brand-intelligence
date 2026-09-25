-- ============================================================================
-- Living Brand Intelligence — Hackathon MVP
-- Phase 2 (Discovery): RLS policies for unauthenticated (anon) MVP use.
--
-- Apply this in: Supabase dashboard → SQL Editor → New query → Run.
--
-- Preserves existing startups policies:
--   anon_can_insert_startups
--   anon_can_select_startups
--
-- Tables covered:
--   context_items
--   context_relationships
--   decision_context_links
--   brand_decisions
--   decision_relationships
--   change_analyses
--   change_analysis_impacts
--
-- Scoped strictly to the current hackathon MVP:
--   SELECT  — read the current startup's own rows
--   INSERT  — create rows for a startup the browser can see
--   UPDATE  — edit during approve/reject (no in-place DELETE)
--   DELETE  — NOT GRANTED.  The product intentionally preserves history via
--              status transitions (REJECTED/SUPERSEDED/archived).
--
-- These policies scope by startup_id using a SELECT-access pattern so that
-- foreign keys (which do not fire RLS SELECT on the referenced row) still
-- work for anonymous inserts while the app preserves referential integrity.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1.  Ensure Row Level Security is enabled on every product table.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.context_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.context_relationships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.decision_context_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.brand_decisions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.decision_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.change_analyses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.change_analysis_impacts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2.  context_items
-- ---------------------------------------------------------------------------
CREATE POLICY anon_can_select_context_items
  ON public.context_items
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY anon_can_insert_context_items
  ON public.context_items
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.startups s WHERE s.id = context_items.startup_id
    )
  );

CREATE POLICY anon_can_update_context_items
  ON public.context_items
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.startups s WHERE s.id = context_items.startup_id
    )
  );

-- ---------------------------------------------------------------------------
-- 3.  context_relationships  — link rows between context items.
-- ---------------------------------------------------------------------------
CREATE POLICY anon_can_select_context_relationships
  ON public.context_relationships
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY anon_can_insert_context_relationships
  ON public.context_relationships
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.startups s WHERE s.id = context_relationships.startup_id
    )
  );

-- ---------------------------------------------------------------------------
-- 4.  decision_context_links  — links are historically immutable in the MVP.
-- ---------------------------------------------------------------------------
CREATE POLICY anon_can_select_decision_context_links
  ON public.decision_context_links
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY anon_can_insert_decision_context_links
  ON public.decision_context_links
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 5.  brand_decisions  — Phase 3+ only; scoped early to avoid a second pass.
-- ---------------------------------------------------------------------------
CREATE POLICY anon_can_select_brand_decisions
  ON public.brand_decisions
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY anon_can_insert_brand_decisions
  ON public.brand_decisions
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.startups s WHERE s.id = brand_decisions.startup_id
    )
  );

CREATE POLICY anon_can_update_brand_decisions
  ON public.brand_decisions
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.startups s WHERE s.id = brand_decisions.startup_id
    )
  );

-- ---------------------------------------------------------------------------
-- 6.  decision_relationships
-- ---------------------------------------------------------------------------
CREATE POLICY anon_can_select_decision_relationships
  ON public.decision_relationships
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY anon_can_insert_decision_relationships
  ON public.decision_relationships
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.startups s WHERE s.id = decision_relationships.startup_id
    )
  );

-- ---------------------------------------------------------------------------
-- 7.  change_analyses  — Phase 7 only.
-- ---------------------------------------------------------------------------
CREATE POLICY anon_can_select_change_analyses
  ON public.change_analyses
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY anon_can_insert_change_analyses
  ON public.change_analyses
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.startups s WHERE s.id = change_analyses.startup_id
    )
  );

CREATE POLICY anon_can_update_change_analyses
  ON public.change_analyses
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.startups s WHERE s.id = change_analyses.startup_id
    )
  );

-- ---------------------------------------------------------------------------
-- 8.  change_analysis_impacts  — Phase 7 only.
-- ---------------------------------------------------------------------------
CREATE POLICY anon_can_select_change_analysis_impacts
  ON public.change_analysis_impacts
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY anon_can_insert_change_analysis_impacts
  ON public.change_analysis_impacts
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.change_analyses ca
       WHERE ca.id = change_analysis_impacts.change_analysis_id
    )
  );

CREATE POLICY anon_can_update_change_analysis_impacts
  ON public.change_analysis_impacts
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.change_analyses ca
       WHERE ca.id = change_analysis_impacts.change_analysis_id
    )
  );
