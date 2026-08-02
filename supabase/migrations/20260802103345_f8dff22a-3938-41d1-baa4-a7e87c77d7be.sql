-- Secure pg_cron HTTP jobs: no hardcoded API key/URL in job definitions.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- 1) Store endpoint base URL + publishable key in Vault (idempotent).
DO $$
DECLARE
  v_base text := 'https://project--d944a9f4-51ff-41a9-b533-bd734294c13b.lovable.app';
  v_key  text := 'sb_publishable_3yJ7RDrAbwi8q8G9Hv0vXA_759Mwag2';
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'app_public_base_url';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_base, 'app_public_base_url', 'Base URL for public hook endpoints');
  ELSE
    PERFORM vault.update_secret(v_id, v_base, 'app_public_base_url', 'Base URL for public hook endpoints');
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = 'app_public_api_key';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_key, 'app_public_api_key', 'API key used by scheduled jobs calling public hooks');
  ELSE
    PERFORM vault.update_secret(v_id, v_key, 'app_public_api_key', 'API key used by scheduled jobs calling public hooks');
  END IF;
END
$$;

-- 2) Helper that reads secrets at execution time.
CREATE OR REPLACE FUNCTION public.invoke_public_hook(_path text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_base text;
  v_key text;
  v_request_id bigint;
BEGIN
  IF _path !~ '^/api/public/' THEN
    RAISE EXCEPTION 'invoke_public_hook: only /api/public/* paths are allowed';
  END IF;

  SELECT decrypted_secret INTO v_base FROM vault.decrypted_secrets WHERE name = 'app_public_base_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'app_public_api_key';

  IF v_base IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'invoke_public_hook: missing vault secrets app_public_base_url/app_public_api_key';
  END IF;

  SELECT net.http_post(
    url := v_base || _path,
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key),
    body := COALESCE(_body, '{}'::jsonb)
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_public_hook(text, jsonb) FROM PUBLIC, anon, authenticated;

-- 3) Rewrite every existing cron job that hardcodes a public hook call.
DO $$
DECLARE
  j record;
  v_path text;
BEGIN
  FOR j IN
    SELECT jobid, jobname, schedule, command
    FROM cron.job
    WHERE command ILIKE '%net.http_post%'
      AND command ILIKE '%/api/public/%'
      AND command NOT ILIKE '%invoke_public_hook%'
  LOOP
    v_path := (regexp_match(j.command, '(/api/public/[A-Za-z0-9_\-/\.]+)'))[1];
    IF v_path IS NULL THEN
      CONTINUE;
    END IF;
    PERFORM cron.alter_job(
      job_id  := j.jobid,
      command := format('SELECT public.invoke_public_hook(%L);', v_path)
    );
  END LOOP;
END
$$;