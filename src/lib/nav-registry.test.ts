// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { NAV_PAGES, canSeePage, type RoleCtx, type NavPage } from "./nav-registry";

/**
 * Role-access test suite.
 * Verifies that each role can open every page explicitly granted to it via
 * `extraRoles`, `investor`, `adminOnly`, or `privilegedOnly` in NAV_PAGES,
 * and that unrelated roles are blocked from role-restricted pages.
 */

function mkCtx(overrides: Partial<RoleCtx> = {}): RoleCtx {
  return {
    isAdmin: false,
    isPrivileged: false,
    canWrite: false,
    isInvestor: false,
    roles: [],
    sections: new Set<string>(),
    ...overrides,
  };
}

function pageByRoute(to: string): NavPage {
  const p = NAV_PAGES.find((x) => x.to === to);
  if (!p) throw new Error(`Missing nav page: ${to}`);
  return p;
}

// ---------- Expected allow-lists ----------
// Each role should be able to open at least these routes.
const ROLE_ALLOWED: Record<string, string[]> = {
  branch_manager: [
    "/pos",
    "/branch-stock",
    "/reports/branches",
    "/reports/offline-invoices",
    "/invoice-print",
    "/customers",
  ],
  operation_manager: [
    "/order-pipeline",
    "/fulfillment",
    "/orders",
    "/branch-stock",
    "/production",
    "/operations",
    "/reports/production",
  ],
  fulfillment_manager: [
    "/order-pipeline",
    "/my-prep",
    "/orders",
    "/fulfillment",
  ],
  sales_man: ["/pos", "/invoice-print", "/customers"],
  customer_service: ["/orders", "/invoice-print", "/customers", "/pos"],
  production_manager: ["/production-tasks", "/production", "/reports/production"],
  team_leader: ["/production"],
  production_worker: ["/production"],
  order_prep: ["/order-pipeline", "/my-prep"],
  project_manager: ["/services-dashboard"],
  hr: ["/hr/attendance", "/reports/attendance"],
};

describe("canSeePage: role → allowed pages", () => {
  for (const [role, routes] of Object.entries(ROLE_ALLOWED)) {
    describe(role, () => {
      const ctx = mkCtx({ roles: [role] });
      for (const to of routes) {
        it(`can open ${to}`, () => {
          expect(canSeePage(pageByRoute(to), ctx)).toBe(true);
        });
      }
    });
  }
});

describe("canSeePage: role-restricted pages block unrelated roles", () => {
  const unrelated = mkCtx({ roles: ["team_leader"] }); // narrow, no admin/write/sections
  const restrictedRoutes = [
    "/branch-stock",
    "/reports/branches",
    "/reports/offline-invoices",
    "/order-pipeline",
    "/my-prep",
    "/production-tasks",
    "/hr/attendance",
    "/reports/attendance",
    "/services-dashboard",
    "/pos",
    "/invoice-print",
  ];
  for (const to of restrictedRoutes) {
    it(`team_leader cannot open ${to}`, () => {
      expect(canSeePage(pageByRoute(to), unrelated)).toBe(false);
    });
  }
});

describe("canSeePage: privileged & admin", () => {
  const admin = mkCtx({ isAdmin: true, isPrivileged: true, canWrite: true, roles: ["admin"] });
  const manager = mkCtx({ isPrivileged: true, canWrite: true, roles: ["manager"] });
  const investor = mkCtx({ isInvestor: true, roles: ["investor"] });

  it("admin sees every page", () => {
    for (const p of NAV_PAGES) {
      expect(canSeePage(p, admin)).toBe(true);
    }
  });

  it("manager sees every non-admin-only page", () => {
    for (const p of NAV_PAGES) {
      if (p.adminOnly) {
        expect(canSeePage(p, manager)).toBe(false);
      } else {
        expect(canSeePage(p, manager)).toBe(true);
      }
    }
  });

  it("investor sees investor-flagged pages", () => {
    expect(canSeePage(pageByRoute("/my-investments"), investor)).toBe(true);
    expect(canSeePage(pageByRoute("/reports/investors-audit"), investor)).toBe(true);
  });

  it("investor cannot see admin-only pages", () => {
    expect(canSeePage(pageByRoute("/investors"), investor)).toBe(false);
    expect(canSeePage(pageByRoute("/admin"), investor)).toBe(false);
  });
});

describe("canSeePage: per-page manual grants", () => {
  it("grants access via sections page:<route> even without role", () => {
    const ctx = mkCtx({ sections: new Set(["page:/reports/executive"]) });
    expect(canSeePage(pageByRoute("/reports/executive"), ctx)).toBe(true);
  });

  it("does not leak access to other pages", () => {
    const ctx = mkCtx({ sections: new Set(["page:/reports/executive"]) });
    expect(canSeePage(pageByRoute("/admin"), ctx)).toBe(false);
    expect(canSeePage(pageByRoute("/reports/audit"), ctx)).toBe(false);
  });
});

describe("nav-registry: invoice-print lives under Offline Stores hub", () => {
  it("/invoice-print hub === 'offline'", () => {
    expect(pageByRoute("/invoice-print").hub).toBe("offline");
  });
});
