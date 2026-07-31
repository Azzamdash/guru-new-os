import { describe, expect, it } from "bun:test";
import { normalizePageRequest } from "@/lib/scalable-pagination.shared";

describe("scalable pagination request", () => {
  it("caps page size and normalizes page/search", () => {
    expect(normalizePageRequest({ page: -4, pageSize: 10_000, search: "  Azzam  " })).toEqual({
      page: 1,
      pageSize: 100,
      search: "Azzam",
      offset: 0,
    });
  });

  it("computes a stable database offset", () => {
    expect(normalizePageRequest({ page: 3, pageSize: 50, search: "" })).toEqual({
      page: 3,
      pageSize: 50,
      search: null,
      offset: 100,
    });
  });
});
