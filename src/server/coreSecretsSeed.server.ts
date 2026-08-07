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

export type CoreCronJob = {
  /** cron.job name — must start with core_ */
  name: string;
  schedule: string;
  path: string;
  /** core secret sent as the x-webhook-secret header */
  secret_name?: string;
  /** core secret sent as the apikey header */
  apikey_name?: string;
};

export type CoreCronResult = {
  name: string;
  schedule: string;
  outcome: "created" | "updated" | "unchanged" | "missing" | "error";
  error?: string;
};

/** Scheduled jobs owned by the application. Seeded at boot, never by a migration. */
export const CORE_CRON_JOBS: CoreCronJob[] = [
  {
    name: "core_shopify_sync",
    schedule: "*/15 * * * *",
    path: "/api/public/hooks/shopify-sync",
    apikey_name: "core_cron_token_shopify_sync",
  },
  {
    name: "core_bosta_recall",
    schedule: "*/30 * * * *",
    path: "/api/public/hooks/bosta-recall",
    secret_name: "core_cron_token_bosta_recall",
  },
];

export async function syncCoreCronJobs(
  secretResults: CoreSecretResult[],
): Promise<CoreCronResult[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const available = new Set(
    secretResults.filter((r) => r.outcome !== "missing" && r.outcome !== "error").map((r) => r.name),
  );

  const results: CoreCronResult[] = [];
  const schedulable: CoreCronJob[] = [];

  for (const job of CORE_CRON_JOBS) {
    const needed = [job.secret_name, job.apikey_name].filter(Boolean) as string[];
    const missing = needed.filter((n) => !available.has(n));
    if (missing.length > 0 || !available.has("core_public_base_url")) {
      results.push({ name: job.name, schedule: job.schedule, outcome: "missing" });
      continue;
    }
    schedulable.push(job);
  }

  if (schedulable.length === 0) return results;

  const { data, error } = await supabaseAdmin.rpc("sync_core_cron_jobs", {
    _jobs: schedulable as unknown as never,
  });
  if (error) {
    for (const job of schedulable) {
      results.push({ name: job.name, schedule: job.schedule, outcome: "error", error: error.message });
    }
    return results;
  }

  const applied = (data as unknown as CoreCronResult[]) ?? [];
  return [...results, ...applied];
}

export type CoreSeedReport = {
  secrets: CoreSecretResult[];
  cron: CoreCronResult[];
};

export async function seedCoreConfiguration(): Promise<CoreSeedReport> {
  const secrets = await syncCoreSecretsToVault();
  const cron = await syncCoreCronJobs(secrets);
  return { secrets, cron };
}

let bootPromise: Promise<void> | undefined;

/** Runs the sync at most once per container; never throws. */
export function ensureCoreSecretsSynced(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      try {
        const { secrets, cron } = await seedCoreConfiguration();
        const summary = secrets.map((r) => `${r.name}=${r.outcome}`).join(", ");
        const jobs = cron.map((r) => `${r.name}=${r.outcome}`).join(", ");
        console.log(`[core-secrets] ${summary}`);
        console.log(`[core-cron] ${jobs || "none"}`);
      } catch (e) {
        console.warn(`[core-secrets] sync skipped: ${(e as Error).message}`);
      }
    })();
  }
  return bootPromise;
}

