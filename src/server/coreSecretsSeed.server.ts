// Pushes core (instance-level) configuration values from the environment into the
// database secret store, so a fresh database + a filled .env is enough to run.
// Values are never logged — only names and outcomes.

export type CoreSecretOutcome = "created" | "updated" | "unchanged" | "missing" | "error";

export type CoreSecretResult = {
  name: string;
  env: string;
  outcome: CoreSecretOutcome;
  error?: string;
};

/** Vault name -> environment variable that supplies its value. */
export const CORE_SECRET_MAP: Array<{ name: string; env: string }> = [
  { name: "core_public_base_url", env: "PUBLIC_SITE_URL" },
  { name: "core_cron_token_shopify_sync", env: "CRON_TOKEN_SHOPIFY_SYNC" },
  { name: "core_cron_token_bosta_recall", env: "CRON_TOKEN_BOSTA_RECALL" },
];

export async function syncCoreSecretsToVault(): Promise<CoreSecretResult[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const results: CoreSecretResult[] = [];

  for (const entry of CORE_SECRET_MAP) {
    const value = process.env[entry.env];
    if (!value) {
      results.push({ ...entry, outcome: "missing" });
      continue;
    }
    const { data, error } = await supabaseAdmin.rpc("sync_core_vault_secret", {
      _name: entry.name,
      _value: value,
    });
    if (error) {
      results.push({ ...entry, outcome: "error", error: error.message });
      continue;
    }
    results.push({ ...entry, outcome: (data as CoreSecretOutcome) ?? "unchanged" });
  }

  return results;
}

let bootPromise: Promise<void> | undefined;

/** Runs the sync at most once per container; never throws. */
export function ensureCoreSecretsSynced(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      try {
        const results = await syncCoreSecretsToVault();
        const summary = results.map((r) => `${r.name}=${r.outcome}`).join(", ");
        console.log(`[core-secrets] ${summary}`);
      } catch (e) {
        console.warn(`[core-secrets] sync skipped: ${(e as Error).message}`);
      }
    })();
  }
  return bootPromise;
}
