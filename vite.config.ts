// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Outside Lovable (e.g. DigitalOcean App Platform / Droplet) set NITRO_PRESET=node-server
// to produce a plain Node server at .output/server/index.mjs.
const nitroPreset = process.env["NITRO_PRESET"];

// Publishable (non-secret) backend config. Used as a build-time fallback so a
// deploy environment missing the VITE_* vars still ships a working client.
const SUPABASE_URL_FALLBACK = "https://moxhzeyrqbcmoswqrxdy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY_FALLBACK = "sb_publishable_3yJ7RDrAbwi8q8G9Hv0vXA_759Mwag2";

const defineFallbacks: Record<string, string> = {};
if (!process.env["VITE_SUPABASE_URL"]) {
  defineFallbacks["import.meta.env.VITE_SUPABASE_URL"] = JSON.stringify(SUPABASE_URL_FALLBACK);
}
if (!process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]) {
  defineFallbacks["import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY"] = JSON.stringify(
    SUPABASE_PUBLISHABLE_KEY_FALLBACK,
  );
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  ...(nitroPreset ? { nitro: { preset: nitroPreset } } : {}),
  vite: {
    plugins: [mcpPlugin()],
    define: defineFallbacks,
  },
});

