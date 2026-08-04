
CREATE TABLE IF NOT EXISTS public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO authenticated;
GRANT ALL ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

-- Users can only see WHETHER they have a connection (not the ciphertext, but RLS is on columns via app code)
DROP POLICY IF EXISTS "Users can view own connection status" ON public.app_user_connections;
CREATE POLICY "Users can view own connection status"
  ON public.app_user_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own connection" ON public.app_user_connections;
CREATE POLICY "Users can delete own connection"
  ON public.app_user_connections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.user_sheet_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  spreadsheet_id text NOT NULL,
  spreadsheet_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sheet_config TO authenticated;
GRANT ALL ON public.user_sheet_config TO service_role;
ALTER TABLE public.user_sheet_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own sheet config" ON public.user_sheet_config;
CREATE POLICY "Users manage own sheet config"
  ON public.user_sheet_config FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_app_user_connections_updated_at
  BEFORE UPDATE ON public.app_user_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_sheet_config_updated_at
  BEFORE UPDATE ON public.user_sheet_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
