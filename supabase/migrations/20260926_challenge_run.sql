-- ---------------------------------------------------------------------------
-- Persist the outcome of a Challenge run.
--
-- The Challenge stage produced no row anywhere: `runChallengeCritique` only read
-- from the database, so the stage tick and the Deliver Quality cards were fed by
-- client state and both reset to "not run" on reload. The run's own summary is
-- now stored on the startup it belongs to, and stage completion is derived from
-- it like every other stage.
--
-- Apply this in: Supabase dashboard → SQL Editor → New query → Run.
--
-- This is one nullable column, not a new table. `lib/challenge-run.ts` validates
-- the stored shape on read, so a null or malformed value leaves the stage
-- incomplete rather than granting completion.
-- ---------------------------------------------------------------------------

ALTER TABLE public.startups
  ADD COLUMN IF NOT EXISTS challenge_run jsonb;

-- The app writes the run summary through the anon client, which already holds
-- insert/select on startups (`anon_can_insert_startups`,
-- `anon_can_select_startups`). UPDATE is added here to match the other tables in
-- this schema. Note this grants anon UPDATE on the whole startups row (name,
-- raw_idea, description) as well as challenge_run — RLS cannot restrict an
-- update to a single column. Tighten by replacing this with a SECURITY DEFINER
-- function if per-column write control is required later.
CREATE POLICY anon_can_update_startups
  ON public.startups
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
