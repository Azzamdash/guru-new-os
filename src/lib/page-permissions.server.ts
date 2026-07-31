type PermissionContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
};

const PRIVILEGED_ROLES = ["admin", "manager"] as const;
const LEGACY_WRITE_ROLES = ["data_entry", "accountant"] as const;

async function hasAnyRole(context: PermissionContext, roles: readonly string[]): Promise<boolean> {
  for (const role of roles) {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: role,
    });
    if (data) return true;
  }
  return false;
}

/**
 * Enforces an explicit per-page write grant on server mutations.
 *
 * Explicit deny/read grants override legacy writer roles. Admin and manager
 * remain break-glass privileged roles. Users without an explicit page grant
 * keep the old role-based behavior until an administrator saves the new
 * permission matrix for that user.
 */
export async function assertPageWrite(
  context: PermissionContext,
  route: string,
  legacyWriteRoles: readonly string[] = LEGACY_WRITE_ROLES,
): Promise<void> {
  if (await hasAnyRole(context, PRIVILEGED_ROLES)) return;

  const keys = [`deny:${route}`, `page:${route}`, `write:${route}`];
  const { data, error } = await context.supabase
    .from("user_section_access")
    .select("section")
    .eq("user_id", context.userId)
    .in("section", keys);
  if (error) throw error;

  const sections = new Set((data ?? []).map((row: { section: string }) => row.section));
  if (sections.has(`deny:${route}`)) {
    throw new Error("Forbidden: this page is read-only");
  }
  if (sections.has(`write:${route}`)) return;

  if (await hasAnyRole(context, legacyWriteRoles)) return;
  if (sections.has(`page:${route}`)) {
    throw new Error("Forbidden: this page is read-only");
  }
  throw new Error("Forbidden");
}
