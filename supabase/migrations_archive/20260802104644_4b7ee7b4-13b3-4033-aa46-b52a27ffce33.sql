-- 1) Store the new Shopify sync hook secret in Vault
DO $$
DECLARE
  v_secret text := '86ad4a7e2830e4072d6afb52b1440efdf7ae87d35c43c3e0cba85b5906c3f8ad';
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'shopify_sync_hook_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_secret, 'shopify_sync_hook_secret', 'apikey header for /api/public/hooks/shopify-sync');
  ELSE
    PERFORM vault.update_secret(v_id, v_secret, 'shopify_sync_hook_secret', 'apikey header for /api/public/hooks/shopify-sync');
  END IF;
END
$$;

-- 2) Allow overriding the apikey header with a dedicated per-hook secret
CREATE OR REPLACE FUNCTION public.invoke_public_hook(
  _path text,
  _body jsonb DEFAULT '{}'::jsonb,
  _secret_name text DEFAULT NULL,
  _apikey_secret_name text DEFAULT NULL
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

  IF _apikey_secret_name IS NOT NULL THEN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = _apikey_secret_name;
  ELSE
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'app_public_api_key';
  END IF;

  IF v_base IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'invoke_public_hook: missing vault secrets (base url / apikey)';
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

REVOKE ALL ON FUNCTION public.invoke_public_hook(text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.invoke_public_hook(text, jsonb, text);

-- 3) Point the Shopify sync cron jobs at the new dedicated key
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid FROM cron.job WHERE command ILIKE '%/api/public/hooks/shopify-sync%'
  LOOP
    PERFORM cron.alter_job(
      job_id := j.jobid,
      command := $cmd$SELECT public.invoke_public_hook('/api/public/hooks/shopify-sync', '{}'::jsonb, NULL, 'shopify_sync_hook_secret');$cmd$
    );
  END LOOP;
END
$$;