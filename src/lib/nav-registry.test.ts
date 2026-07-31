// @ts-nocheck
import { describe, it, expect } from "bun:test";
import {
  HUBS,
  MAIN_NAV_GROUPS,
  NAV_PAGES,
  canEditPage,
  canSeePage,
  pageAccessLevel,
  pagesForHub,
  type RoleCtx,
  type NavPage,
} from "./nav-registry";

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
  fulfillment_manager: ["/order-pipeline", "/my-prep", "/orders", "/fulfillment"],
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

  it("uses page grants for visibility and roles for write access", () => {
    const page = pageByRoute("/orders");
    const hidden = mkCtx({ sections: new Set(["deny:/orders"]) });
    const read = mkCtx({ sections: new Set(["page:/orders"]) });
    const legacyWriteGrant = mkCtx({ sections: new Set(["write:/orders"]) });
    const roleWriter = mkCtx({ canWrite: true, sections: new Set(["page:/orders"]) });

    expect(pageAccessLevel(page, hidden)).toBe("hidden");
    expect(pageAccessLevel(page, read)).toBe("read");
    expect(pageAccessLevel(page, legacyWriteGrant)).toBe("read");
    expect(pageAccessLevel(page, roleWriter)).toBe("write");
    expect(canSeePage(page, read)).toBe(true);
    expect(canEditPage(page, read)).toBe(false);
    expect(canEditPage(page, roleWriter)).toBe(true);
  });

  it("lets an explicit deny override a role grant", () => {
    const ctx = mkCtx({
      canWrite: true,
      roles: ["operation_manager"],
      sections: new Set(["deny:/orders"]),
    });
    expect(pageAccessLevel(pageByRoute("/orders"), ctx)).toBe("hidden");
  });
});

describe("nav-registry: invoice-print lives under Offline Stores hub", () => {
  it("/invoice-print hub === 'offline'", () => {
    expect(pageByRoute("/invoice-print").hub).toBe("offline");
  });
});

describe("nav-registry: main sections", () => {
  it("groups every hub into executive, operations, management, or system", () => {
    const groups = new Set(MAIN_NAV_GROUPS.map((group) => group.key));
    expect(HUBS.every((hub) => groups.has(hub.group))).toBe(true);
    expect(HUBS.find((hub) => hub.key === "overview")?.group).toBe("executive");
    expect(HUBS.find((hub) => hub.key === "settings")?.group).toBe("system");
  });
});

describe("nav-registry: orders and tasks placement", () => {
  it("shows the couriers dashboard in both CEO Dashboard and Orders", () => {
    expect(pagesForHub("overview").some((page) => page.to === "/reports/couriers")).toBe(true);
    expect(pagesForHub("sales").some((page) => page.to === "/reports/couriers")).toBe(true);
  });

  it("moves fulfillment from Orders to Tasks & Missions", () => {
    expect(pagesForHub("missions").some((page) => page.to === "/fulfillment")).toBe(true);
    expect(pagesForHub("sales").some((page) => page.to === "/fulfillment")).toBe(false);
  });
});
