-- 20260807200000 added a new trailing _settled_only param to
-- dashboard_operational_report via CREATE OR REPLACE FUNCTION. Postgres
-- treats a different parameter list as a different function identity, so
-- that migration did not replace the original 3-argument function — it
-- created a second overload alongside it. The app calls this RPC with only
-- the original 3 named arguments (_from, _to, _brand_id), which now matches
-- BOTH overloads (the 4th parameter has a default), so Postgres can no
-- longer pick one and raises an ambiguous-function error on every call.
-- Drop the stale 3-argument overload so only the 4-argument version remains.
DROP FUNCTION IF EXISTS public.dashboard_operational_report(timestamp with time zone, timestamp with time zone, uuid);

-- accounting_profit_report's own _settled_only migration (20260807070000) has
-- the identical latent issue: it left the original 4-argument overload in
-- place alongside the new 5-argument one. It hasn't caused a live error
-- because the sole caller (accounting-read-model.server.ts) always passes
-- _settled_only explicitly, which already disambiguates the call — but any
-- future caller that omits it would hit the same ambiguous-function error
-- this migration just fixed for the dashboard. Drop the stale overload
-- preemptively rather than wait for it to bite.
DROP FUNCTION IF EXISTS public.accounting_profit_report(date, date, uuid, uuid[]);
