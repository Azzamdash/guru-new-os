export type PageRequest = {
  page?: number | null;
  pageSize?: number | null;
  search?: string | null;
};

export function normalizePageRequest(input: PageRequest) {
  const page = Math.max(1, Math.trunc(Number(input.page) || 1));
  const pageSize = Math.min(100, Math.max(10, Math.trunc(Number(input.pageSize) || 50)));
  const search = input.search?.trim() || null;
  return { page, pageSize, search, offset: (page - 1) * pageSize };
}
