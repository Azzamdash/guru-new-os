-- Store the Bosta recall shared secret in Vault and send it from scheduled jobs.
DO $$
DECLARE
  v_secret text := '172afdc163141c44eca491bed7d413396a0e8c105db98432de9f889d4798d9f8';
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'bosta_recall_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_secret, 'bosta_recall_secret', 'Shared secret header for /api/public/hooks/bosta-recall');
  ELSE
    PERFORM vault.update_secret(v_id, v_secret, 'bosta_recall_secret', 'Shared secret header for /api/public/hooks/bosta-recall');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.invoke_public_hook(
  _path text,
  _body jsonb DEFAULT '{}'::jsonb,
  _secret_name text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_base text;
  v_key text;
  v_hook_secret text;
  v_headers jsonb;
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

  v_headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key);

  IF _secret_name IS NOT NULL THEN
    SELECT decrypted_secret INTO v_hook_secret FROM vault.decrypted_secrets WHERE name = _secret_name;
    IF v_hook_secret IS NULL THEN
      RAISE EXCEPTION 'invoke_public_hook: missing vault secret %', _secret_name;
    END IF;
    v_headers := v_headers || jsonb_build_object('x-webhook-secret', v_hook_secret);
  END IF;

  SELECT net.http_post(
    url := v_base || _path,
    headers := v_headers,
    body := COALESCE(_body, '{}'::jsonb)
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_public_hook(text, jsonb, text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid FROM cron.job WHERE command ILIKE '%/api/public/hooks/bosta-recall%'
  LOOP
    PERFORM cron.alter_job(
      job_id := j.jobid,
      command := $cmd$SELECT public.invoke_public_hook('/api/public/hooks/bosta-recall', '{}'::jsonb, 'bosta_recall_secret');$cmd$
    );
  END LOOP;
END
$$;