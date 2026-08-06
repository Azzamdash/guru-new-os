import { describe, expect, it } from "bun:test";

const read = (path: string) => Bun.file(path).text();
const scalable = await read("supabase/migrations_archive/20260731130000_scalable_read_models.sql");
const archival = await read("supabase/migrations_archive/20260731140000_hot_payload_archival.sql");
const hotBackfill = await read("supabase/migrations_archive/20260731141000_hot_payload_backfill.sql");
const followup = await read("supabase/migrations_archive/20260731150000_preserve_legacy_courier_returns.sql");
const shopifySync = await read("src/server/shopifySync.server.ts");
const integrations = await read("src/lib/integrations.functions.ts");
const bostaRecall = await read("src/server/bostaRecall.server.ts");
const couriers = await read("src/lib/couriers.functions.ts");

function functionDefinition(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 4);
}

describe("scalable read RPC authorization", () => {
  for (const name of ["orders_page", "orders_summary", "orders_filter_summary"]) {
    it(`${name} requires /orders page access`, () => {
      expect(functionDefinition(scalable, name)).toContain("public.require_page_read('/orders')");
    });
  }
  for (const name of ["customers_page", "customers_summary", "customers_filter_summary"]) {
    it(`${name} requires /customers page access`, () => {
      expect(functionDefinition(scalable, name)).toContain("public.require_page_read('/customers')");
    });
  }
});

describe("payload archival safety", () => {
  it("upserts Shopify orders and archives payloads in one RPC transaction", () => {
    const definition = functionDefinition(archival, "upsert_shopify_order_with_archive");
    expect(definition).toContain("public.upsert_order_with_items");
    expect(definition).toContain("public.archive_order_source_payload");
    expect(definition).toContain("jsonb_set(_order_patch, '{raw}', '{}'::jsonb, true)");
    expect(archival).toContain("extensions.digest(_payload::text, 'sha256')");
    expect(definition).toContain("pg_advisory_xact_lock");
    expect(definition).toContain("external_id = identity_external_id");
    expect(definition).not.toContain("UPDATE public.orders");
    expect(shopifySync).toContain('"upsert_shopify_order_with_archive"');
    expect(shopifySync).not.toContain('"archive_order_source_payload"');
  });

  it("archives stale Bosta payloads before compare-and-set rejection", () => {
    const definition = functionDefinition(archival, "apply_bosta_lifecycle");
    expect(definition.indexOf("PERFORM public.archive_order_source_payload")).toBeLessThan(
      definition.indexOf("_provider_event_at < current_order.bosta_event_at"),
    );
    expect(definition).toContain("_provider_event_at = current_order.bosta_event_at");
    expect(definition).toContain(
      "apply_shipment := incoming_rank > current_rank",
    );
    expect(definition).toContain("apply_collection := incoming_collection_rank > current_collection_rank");
    expect(definition).toContain(
      "collection_status = CASE WHEN apply_collection THEN _collection_status ELSE collection_status END",
    );
    expect(definition).toContain(
      "shipment_outcome = CASE WHEN apply_shipment THEN _shipment_outcome ELSE shipment_outcome END",
    );
    expect(definition).toContain(
      "incoming_collection_rank < current_collection_rank THEN apply_collection := false",
    );
    expect(definition).toContain("collection_status, ''))) = 'paid' THEN 30");
    expect(definition).not.toContain("~ 'paid|collected");
  });

  it("does not grant update/delete privileges on the append-only archive", () => {
    expect(archival).not.toContain("GRANT ALL ON public.order_source_payloads TO service_role");
    expect(archival).toContain("GRANT SELECT, INSERT ON public.order_source_payloads TO service_role");
  });

  it("uses a consistent legacy backfill while keeping ordinary reads available", () => {
    expect(archival).not.toContain("LOCK TABLE public.orders IN ACCESS EXCLUSIVE MODE");
    expect(hotBackfill).toContain("LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE");
    expect(hotBackfill.indexOf("LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE")).toBeLessThan(
      hotBackfill.indexOf("INSERT INTO public.order_source_payloads"),
    );
    expect(hotBackfill).toContain("raw->>'bosta_last_pull_at'");
    expect(hotBackfill).toContain("bosta_tracking = COALESCE(bosta_tracking");
    expect(hotBackfill).toContain("GREATEST(bosta_event_at");
    expect(hotBackfill).toContain("orders_user_trigger_state");
  });

  it("archives authenticated Bosta pull payloads before any terminal return", () => {
    expect(integrations.indexOf('rpc("archive_order_source_payload"')).toBeLessThan(
      integrations.indexOf("notFoundOnBosta &&"),
    );
    expect(integrations).not.toContain("shouldIgnoreStaleBostaLifecycle(");
    expect(integrations).toContain("!hadNetworkFailure &&");
  });
});

describe("historical courier return safety", () => {
  it("keeps legacy_return rows out of automatic rate refresh", () => {
    expect(followup).toContain("c.charge_type = 'legacy_return'");
    expect(functionDefinition(followup, "persist_order_courier_charge")).toContain(
      "public.courier_charges.charge_type <> 'legacy_return'",
    );
    expect(functionDefinition(followup, "accrue_order_courier_charge")).toContain(
      "existing_charge_type = 'legacy_return'",
    );
    expect(followup).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.courier_charges FROM authenticated",
    );
  });

  it("maps confirmed Bosta deletion through a cancelled lifecycle state", () => {
    expect(bostaRecall).toContain('const effectiveState = notFoundOnBosta ? "cancelled" : stateValue');
    expect(bostaRecall).toContain("mapBostaLifecycle(effectiveState, collectionValue)");
  });

  it("finalizes generic dispatch only through a claim-token CAS", () => {
    const definition = functionDefinition(archival, "finalize_generic_order_dispatch");
    expect(definition).toContain("dispatch_claim_token IS DISTINCT FROM _claim_token");
    expect(definition).toContain("Cannot finalize dispatch for a terminal order");
    expect(couriers).toContain('"finalize_generic_order_dispatch"');
    expect(couriers).not.toContain('.from("orders")\n      .update({');
  });
});
