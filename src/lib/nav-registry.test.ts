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

describe("canSeePage: nothing is implied by job roles", () => {
  const roles = [
    "branch_manager",
    "operation_manager",
    "fulfillment_manager",
    "sales_man",
    "customer_service",
    "production_manager",
    "team_leader",
    "production_worker",
    "order_prep",
    "project_manager",
    "hr",
  ];
  for (const role of roles) {
    it(`${role} sees nothing without explicit page grants`, () => {
      const ctx = mkCtx({ roles: [role] });
      for (const p of NAV_PAGES) {
        expect(canSeePage(p, ctx)).toBe(false);
      }
    });
  }

  it("an explicit grant opens exactly that page", () => {
    const ctx = mkCtx({ roles: ["team_leader"], sections: new Set(["page:/production"]) });
    expect(canSeePage(pageByRoute("/production"), ctx)).toBe(true);
    expect(canSeePage(pageByRoute("/order-returns"), ctx)).toBe(false);
  });
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

  it("investor sees investor-flagged pages only when granted", () => {
    expect(canSeePage(pageByRoute("/my-investments"), investor)).toBe(false);
    const granted = mkCtx({
      isInvestor: true,
      roles: ["investor"],
      sections: new Set(["page:/my-investments"]),
    });
    expect(canSeePage(pageByRoute("/my-investments"), granted)).toBe(true);
  });

  it("investor cannot see admin-only pages", () => {
    expect(canSeePage(pageByRoute("/investors"), investor)).toBe(false);
    expect(canSeePage(pageByRoute("/admin"), investor)).toBe(false);
  });
});

describe("canSeePage: per-page manual grants", () => {
  it("grants access via sections page:<route> even without role", () => {
    const ctx = mkCtx({ sections: new Set(["page:/order-returns"]) });
    expect(canSeePage(pageByRoute("/order-returns"), ctx)).toBe(true);
  });

  it("does not leak access to other pages", () => {
    const ctx = mkCtx({ sections: new Set(["page:/order-returns"]) });
    expect(canSeePage(pageByRoute("/admin"), ctx)).toBe(false);
    expect(canSeePage(pageByRoute("/reports/audit"), ctx)).toBe(false);
  });

  it("uses page grants for visibility and roles for write access", () => {
    const page = pageByRoute("/order-returns");
    const hidden = mkCtx({ sections: new Set(["deny:/order-returns"]) });
    const read = mkCtx({ sections: new Set(["page:/order-returns"]) });
    const writeGrant = mkCtx({ sections: new Set(["write:/order-returns"]) });
    const roleWriter = mkCtx({ canWrite: true, sections: new Set(["page:/order-returns"]) });

    expect(pageAccessLevel(page, hidden)).toBe("hidden");
    expect(pageAccessLevel(page, read)).toBe("read");
    expect(pageAccessLevel(page, writeGrant)).toBe("write");
    expect(pageAccessLevel(page, roleWriter)).toBe("read");
    expect(canSeePage(page, read)).toBe(true);
    expect(canEditPage(page, read)).toBe(false);
    expect(canEditPage(page, writeGrant)).toBe(true);
  });

  it("lets an explicit deny override a role grant", () => {
    const ctx = mkCtx({
      canWrite: true,
      roles: ["operation_manager"],
      sections: new Set(["deny:/order-returns"]),
    });
    expect(pageAccessLevel(pageByRoute("/order-returns"), ctx)).toBe("hidden");
  });
});

describe("canSeePage: privilegedOnly is a hard floor", () => {
  it("no page:/write: grant opens a privilegedOnly page for a non-privileged user", () => {
    const page = pageByRoute("/reports/executive");
    expect(page.privilegedOnly).toBe(true);
    const pageGrant = mkCtx({ sections: new Set(["page:/reports/executive"]) });
    const writeGrant = mkCtx({ sections: new Set(["write:/reports/executive"]) });
    const roleGrant = mkCtx({
      canWrite: true,
      roles: ["operation_manager"],
      sections: new Set(["page:/reports/executive"]),
    });
    expect(canSeePage(page, pageGrant)).toBe(false);
    expect(canSeePage(page, writeGrant)).toBe(false);
    expect(canSeePage(page, roleGrant)).toBe(false);
  });

  it("admin/manager still see privilegedOnly pages with no grant needed", () => {
    const page = pageByRoute("/reports/executive");
    const admin = mkCtx({ isAdmin: true, isPrivileged: true, roles: ["admin"] });
    const manager = mkCtx({ isPrivileged: true, roles: ["manager"] });
    expect(canSeePage(page, admin)).toBe(true);
    expect(canSeePage(page, manager)).toBe(true);
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
  it("shows the couriers dashboard only in the Fulfillment hub", () => {
    expect(pagesForHub("fulfillment").some((page) => page.to === "/reports/couriers")).toBe(true);
    expect(pagesForHub("overview").some((page) => page.to === "/reports/couriers")).toBe(false);
    expect(pagesForHub("sales").some((page) => page.to === "/reports/couriers")).toBe(false);
  });

  it("moves fulfillment from Orders to Tasks & Missions", () => {
    expect(pagesForHub("missions").some((page) => page.to === "/fulfillment")).toBe(true);
    expect(pagesForHub("sales").some((page) => page.to === "/fulfillment")).toBe(false);
  });
});
