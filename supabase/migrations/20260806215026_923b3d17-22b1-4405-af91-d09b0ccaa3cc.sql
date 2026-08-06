CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.sync_core_cron_jobs(_jobs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, cron
AS $$
DECLARE
  j jsonb;
  v_name text;
  v_schedule text;
  v_path text;
  v_secret text;
  v_apikey text;
  v_command text;
  v_existing record;
  v_outcome text;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF _jobs IS NULL OR jsonb_typeof(_jobs) <> 'array' THEN
    RAISE EXCEPTION 'sync_core_cron_jobs: _jobs must be a json array';
  END IF;

  FOR j IN SELECT * FROM jsonb_array_elements(_jobs)
  LOOP
    v_name := j->>'name';
    v_schedule := j->>'schedule';
    v_path := j->>'path';
    v_secret := nullif(j->>'secret_name', '');
    v_apikey := nullif(j->>'apikey_name', '');

    IF v_name IS NULL OR v_name !~ '^core_[a-z0-9_]+$' THEN
      RAISE EXCEPTION 'sync_core_cron_jobs: job name must match ^core_[a-z0-9_]+$, got %', v_name;
    END IF;
    IF v_schedule IS NULL OR v_schedule !~ '^[0-9*/,\- ]+$' THEN
      RAISE EXCEPTION 'sync_core_cron_jobs: invalid schedule for %', v_name;
    END IF;
    IF v_path IS NULL OR v_path !~ '^/api/public/hooks/[a-z0-9\-/]+$' THEN
      RAISE EXCEPTION 'sync_core_cron_jobs: invalid hook path for %', v_name;
    END IF;
    IF v_secret IS NOT NULL AND v_secret !~ '^core_[a-z0-9_]+$' THEN
      RAISE EXCEPTION 'sync_core_cron_jobs: invalid secret name for %', v_name;
    END IF;
    IF v_apikey IS NOT NULL AND v_apikey !~ '^core_[a-z0-9_]+$' THEN
      RAISE EXCEPTION 'sync_core_cron_jobs: invalid apikey name for %', v_name;
    END IF;
    IF v_secret IS NULL AND v_apikey IS NULL THEN
      RAISE EXCEPTION 'sync_core_cron_jobs: % needs at least one core token', v_name;
    END IF;

    v_command := format(
      'SELECT public.invoke_public_hook(%L, %L::jsonb, %s, %s);',
      v_path,
      '{}',
      CASE WHEN v_secret IS NULL THEN 'NULL' ELSE quote_literal(v_secret) END,
      CASE WHEN v_apikey IS NULL THEN 'NULL' ELSE quote_literal(v_apikey) END
    );

    SELECT jobid, schedule, command INTO v_existing FROM cron.job WHERE jobname = v_name;

    IF v_existing.jobid IS NULL THEN
      PERFORM cron.schedule(v_name, v_schedule, v_command);
      v_outcome := 'created';
    ELSIF v_existing.schedule IS DISTINCT FROM v_schedule OR v_existing.command IS DISTINCT FROM v_command THEN
      PERFORM cron.alter_job(job_id := v_existing.jobid, schedule := v_schedule, command := v_command);
      v_outcome := 'updated';
    ELSE
      v_outcome := 'unchanged';
    END IF;

    v_results := v_results || jsonb_build_object('name', v_name, 'schedule', v_schedule, 'outcome', v_outcome);
  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_core_cron_jobs(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_core_cron_jobs(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.core_cron_job_status()
RETURNS TABLE(name text, schedule text, active boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions, cron
AS $$
  SELECT jobname::text, schedule::text, active
  FROM cron.job
  WHERE jobname LIKE 'core\_%';
$$;

REVOKE ALL ON FUNCTION public.core_cron_job_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.core_cron_job_status() TO authenticated, service_role;