import { createCsrfMiddleware, createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Server-side env fallback: the generated Supabase server helpers
// (auth-middleware.ts / client.server.ts) are auto-generated and must not be
// edited, and they read SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY only.
// Self-hosted deployments often set only the VITE_* names, so mirror them here
// before any server handler runs.
if (typeof window === "undefined" && typeof process !== "undefined" && process.env) {
  process.env.SUPABASE_URL ||= process.env.VITE_SUPABASE_URL ?? "";
  process.env.SUPABASE_PUBLISHABLE_KEY ||= process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  process.env.SUPABASE_PROJECT_ID ||= process.env.VITE_SUPABASE_PROJECT_ID ?? "";
}


const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
