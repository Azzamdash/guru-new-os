-- Core secret seeding mechanism: values are supplied by the application from .env, never stored in migrations.

CREATE OR REPLACE FUNCTION public.sync_core_vault_secret(_name text, _value text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_id uuid;
  v_current text;
BEGIN
  IF _name IS NULL OR _name !~ '^core_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'sync_core_vault_secret: name must match ^core_[a-z0-9_]+$, got %', _name;
  END IF;
  IF _value IS NULL OR length(_value) = 0 THEN
    RAISE EXCEPTION 'sync_core_vault_secret: empty value for %', _name;
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = _name;

  IF v_id IS NULL THEN
    PERFORM vault.create_secret(_value, _name, 'Core application secret synced from environment');
    RETURN 'created';
  END IF;

  SELECT decrypted_secret INTO v_current FROM vault.decrypted_secrets WHERE id = v_id;
  IF v_current IS DISTINCT FROM _value THEN
    PERFORM vault.update_secret(v_id, _value, _name, 'Core application secret synced from environment');
    RETURN 'updated';
  END IF;

  RETURN 'unchanged';
END;
$$;

REVOKE ALL ON FUNCTION public.sync_core_vault_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_core_vault_secret(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.core_vault_secret_status()
RETURNS TABLE(name text, present boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
  SELECT n.name, EXISTS (SELECT 1 FROM vault.secrets s WHERE s.name = n.name)
  FROM (VALUES
    ('core_public_base_url'),
    ('core_cron_token_shopify_sync'),
    ('core_cron_token_bosta_recall')
  ) AS n(name);
$$;

REVOKE ALL ON FUNCTION public.core_vault_secret_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.core_vault_secret_status() TO authenticated, service_role;

-- Re-point existing scheduled jobs to the core_* secret names (no-op on a fresh project).
DO $$
DECLARE
  j record;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  FOR j IN SELECT jobid FROM cron.job WHERE command ILIKE '%/api/public/hooks/shopify-sync%'
  LOOP
    PERFORM cron.alter_job(
      job_id := j.jobid,
      command := $cmd$SELECT public.invoke_public_hook('/api/public/hooks/shopify-sync', '{}'::jsonb, NULL, 'core_cron_token_shopify_sync');$cmd$
    );
  END LOOP;

  FOR j IN SELECT jobid FROM cron.job WHERE command ILIKE '%/api/public/hooks/bosta-recall%'
  LOOP
    PERFORM cron.alter_job(
      job_id := j.jobid,
      command := $cmd$SELECT public.invoke_public_hook('/api/public/hooks/bosta-recall', '{}'::jsonb, 'core_cron_token_bosta_recall', NULL);$cmd$
    );
  END LOOP;
END
$$;

-- invoke_public_hook: base URL now comes from core_public_base_url; an explicit hook token is required.
CREATE OR REPLACE FUNCTION public.invoke_public_hook(
  _path text,
  _body jsonb DEFAULT '{}'::jsonb,
  _secret_name text DEFAULT NULL::text,
  _apikey_secret_name text DEFAULT NULL::text
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

  SELECT decrypted_secret INTO v_base FROM vault.decrypted_secrets WHERE name = 'core_public_base_url';
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'invoke_public_hook: missing vault secret core_public_base_url';
  END IF;

  v_headers := jsonb_build_object('Content-Type', 'application/json');

  IF _apikey_secret_name IS NOT NULL THEN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = _apikey_secret_name;
    IF v_key IS NULL THEN
      RAISE EXCEPTION 'invoke_public_hook: missing vault secret %', _apikey_secret_name;
    END IF;
    v_headers := v_headers || jsonb_build_object('apikey', v_key);
  END IF;

  IF _secret_name IS NOT NULL THEN
    SELECT decrypted_secret INTO v_hook_secret FROM vault.decrypted_secrets WHERE name = _secret_name;
    IF v_hook_secret IS NULL THEN
      RAISE EXCEPTION 'invoke_public_hook: missing vault secret %', _secret_name;
    END IF;
    v_headers := v_headers || jsonb_build_object('x-webhook-secret', v_hook_secret);
  END IF;

  IF _apikey_secret_name IS NULL AND _secret_name IS NULL THEN
    RAISE EXCEPTION 'invoke_public_hook: an explicit core token name is required';
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