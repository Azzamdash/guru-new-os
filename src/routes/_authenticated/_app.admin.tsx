import { tr } from "@/lib/i18n";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  listUsers,
  createUser,
  updateUserPassword,
  setUserBanned,
  setUserRole,
  deleteUser,
  getMyRole,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Ban, CheckCircle2, KeyRound, Trash2, UserPlus, ShieldCheck, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { getUserAccess, setUserAccess, ALL_SECTIONS } from "@/lib/permissions.functions";
import { listBrands } from "@/lib/internal.functions";
import { HUBS, pagesForHub } from "@/lib/nav-registry";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: tr("إدارة المستخدمين | e-GURUS") },
      { name: "description", content: "لوحة تحكم المشرف لإدارة المستخدمين والأدوار وكلمات المرور" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AdminPage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const getMyRoleFn = useServerFn(getMyRole);
  const listUsersFn = useServerFn(listUsers);

  const roleQuery = useQuery({ queryKey: ["my-role"], queryFn: () => getMyRoleFn() });

  useEffect(() => {
    if (roleQuery.data && !roleQuery.data.isAdmin) {
      toast.error(lang === "ar" ? "هذه الصفحة للمشرفين فقط" : "This page is for admins only");
      navigate({ to: "/dashboard" });
    }
  }, [roleQuery.data, navigate, lang]);

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listUsersFn(),
    enabled: !!roleQuery.data?.isAdmin,
  });

  if (roleQuery.isLoading || !roleQuery.data?.isAdmin) {
    return (
      <div className="p-8 text-muted-foreground">
        {lang === "ar" ? "جاري التحقق من الصلاحيات..." : "Checking permissions..."}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary" />
            {lang === "ar" ? "إدارة المستخدمين" : "User Management"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {lang === "ar"
              ? "إنشاء المستخدمين، تعيين الأدوار، إعادة تعيين كلمات المرور وإيقاف الحسابات"
              : "Create users, assign roles, reset passwords and ban accounts"}
          </p>
        </div>
        <CreateUserDialog />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">
                {lang === "ar" ? "البريد الإلكتروني" : "Email"}
              </TableHead>
              <TableHead className="text-right">{lang === "ar" ? "الدور" : "Role"}</TableHead>
              <TableHead className="text-right">{lang === "ar" ? "الحالة" : "Status"}</TableHead>
              <TableHead className="text-right">
                {lang === "ar" ? "آخر دخول" : "Last Login"}
              </TableHead>
              <TableHead className="text-right">{lang === "ar" ? "إجراءات" : "Actions"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {lang === "ar" ? "جاري التحميل..." : "Loading..."}
                </TableCell>
              </TableRow>
            )}
            {usersQuery.data?.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type Role = "admin" | "member";
const ROLE_OPTIONS: { v: Role; ar: string; en: string }[] = [
  { v: "admin", ar: "مشرف (Admin)", en: "Admin" },
  { v: "member", ar: "مستخدم (User)", en: "User" },
];
const roleLabel = (v: string, lang: "ar" | "en" = "ar") =>
  lang === "ar"
    ? (ROLE_OPTIONS.find((r) => r.v === v)?.ar ?? (v === "admin" ? "مشرف" : "مستخدم"))
    : (ROLE_OPTIONS.find((r) => r.v === v)?.en ?? (v === "admin" ? "Admin" : "User"));

type UserRow = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null | undefined;
  banned_until: string | null | undefined;
  roles: string[];
};

function UserRow({ user }: { user: UserRow }) {
  const { lang } = useLang();
  const qc = useQueryClient();
  const setRoleFn = useServerFn(setUserRole);
  const setBannedFn = useServerFn(setUserBanned);
  const deleteFn = useServerFn(deleteUser);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const currentRole: Role = user.roles.includes("admin") ? "admin" : "member";
  const isBanned = !!user.banned_until && new Date(user.banned_until) > new Date();

  const roleMut = useMutation({
    mutationFn: (role: Role) => setRoleFn({ data: { userId: user.id, role } }),
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم تحديث الدور" : "Role updated");
      invalidate();
    },
    onError: (e: any) =>
      toast.error(e.message ?? (lang === "ar" ? "فشل التحديث" : "Update failed")),
  });

  const banMut = useMutation({
    mutationFn: () => setBannedFn({ data: { userId: user.id, banned: !isBanned } }),
    onSuccess: () => {
      toast.success(
        isBanned
          ? lang === "ar"
            ? "تم تفعيل الحساب"
            : "Account activated"
          : lang === "ar"
            ? "تم إيقاف الحساب"
            : "Account suspended",
      );
      invalidate();
    },
    onError: (e: any) =>
      toast.error(e.message ?? (lang === "ar" ? "فشل التحديث" : "Update failed")),
  });

  const delMut = useMutation({
    mutationFn: () => deleteFn({ data: { userId: user.id } }),
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم حذف المستخدم" : "User deleted");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? (lang === "ar" ? "فشل الحذف" : "Delete failed")),
  });

  return (
    <TableRow>
      <TableCell className="font-mono text-sm" dir="ltr">
        {user.email}
      </TableCell>
      <TableCell>
        <Select value={currentRole} onValueChange={(v) => roleMut.mutate(v as Role)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r.v} value={r.v}>
                {lang === "ar" ? r.ar : r.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {isBanned ? (
          <Badge variant="destructive">{lang === "ar" ? "موقوف" : "Suspended"}</Badge>
        ) : (
          <Badge variant="secondary" className="bg-green-500/15 text-green-500">
            {lang === "ar" ? "نشط" : "Active"}
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString("en-US") : "—"}
      </TableCell>
      <TableCell>
        <div className="flex gap-2 flex-wrap">
          <PermissionsDialog userId={user.id} email={user.email} />
          <ResetPasswordDialog userId={user.id} email={user.email} />
          <Button
            size="sm"
            variant={isBanned ? "outline" : "secondary"}
            onClick={() => banMut.mutate()}
            disabled={banMut.isPending}
          >
            {isBanned ? <CheckCircle2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (
                confirm(
                  lang === "ar" ? `حذف المستخدم ${user.email}؟` : `Delete user ${user.email}?`,
                )
              )
                delMut.mutate();
            }}
            disabled={delMut.isPending}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ResetPasswordDialog({ userId, email }: { userId: string; email: string }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const updateFn = useServerFn(updateUserPassword);
  const mut = useMutation({
    mutationFn: () => updateFn({ data: { userId, password } }),
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم تحديث كلمة المرور" : "Password updated");
      setOpen(false);
      setPassword("");
    },
    onError: (e: any) =>
      toast.error(e.message ?? (lang === "ar" ? "فشل التحديث" : "Update failed")),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <KeyRound className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lang === "ar" ? "تغيير كلمة المرور" : "Change Password"}</DialogTitle>
          <DialogDescription dir="ltr" className="text-right">
            {email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="pw">{lang === "ar" ? "كلمة المرور الجديدة" : "New Password"}</Label>
          <Input
            id="pw"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={lang === "ar" ? "6 أحرف على الأقل" : "At least 6 characters"}
            dir="ltr"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || password.length < 6}>
            {lang === "ar" ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateUserDialog() {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("member");
  const qc = useQueryClient();
  const createFn = useServerFn(createUser);
  const mut = useMutation({
    mutationFn: () => createFn({ data: { email, password, role } }),
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم إنشاء المستخدم" : "User created");
      setOpen(false);
      setEmail("");
      setPassword("");
      setRole("member");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: any) =>
      toast.error(e.message ?? (lang === "ar" ? "فشل الإنشاء" : "Creation failed")),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="w-4 h-4 ml-2" />
          {lang === "ar" ? "مستخدم جديد" : "New User"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lang === "ar" ? "إنشاء مستخدم جديد" : "Create New User"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{lang === "ar" ? "البريد الإلكتروني" : "Email"}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="npw">{lang === "ar" ? "كلمة المرور" : "Password"}</Label>
            <Input
              id="npw"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              placeholder={lang === "ar" ? "6 أحرف على الأقل" : "At least 6 characters"}
            />
          </div>
          <div className="space-y-2">
            <Label>{lang === "ar" ? "الدور" : "Role"}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.v} value={r.v}>
                    {lang === "ar" ? r.ar : r.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "مشرف: صلاحيات كاملة على كل شيء · مستخدم: يفتح فقط الصفحات التي تسمح له بها، وأنت تحدد إن كان يستطيع إدخال بيانات أم مشاهدة فقط."
                : "Admin: full permissions on everything · User: only opens pages you grant, and you decide whether they can enter data or just view."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !email || password.length < 6}
          >
            {lang === "ar" ? "إنشاء" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// used in table header row (kept exported for reference)
export { roleLabel };

const SECTION_LABELS: Record<string, { ar: string; en: string }> = {
  dashboard: { ar: "لوحة التحكم", en: "Dashboard" },
  data_entry: { ar: "إدخال البيانات", en: "Data Entry" },
  expenses: { ar: "المصروفات", en: "Expenses" },
  sales: { ar: "فواتير المبيعات", en: "Sales Invoices" },
  production: { ar: "الإنتاج والمخزون", en: "Production & Inventory" },
  couriers: { ar: "الشحن والمناديب", en: "Shipping & Couriers" },
  fulfillment: { ar: "تحضير الأوردرات", en: "Order Prep" },
  suppliers: { ar: "الموردين", en: "Suppliers" },
  catalog: { ar: "الكتالوج", en: "Catalog" },
  marketing: { ar: "التسويق", en: "Marketing" },
  reports_marketing: { ar: "تقارير التسويق", en: "Marketing Reports" },
  reports_production: { ar: "تقارير الإنتاج", en: "Production Reports" },
  reports_sales: { ar: "تقارير المبيعات", en: "Sales Reports" },
  reports_fulfillment: { ar: "تقارير Fulfillment", en: "Fulfillment Reports" },
  reports_attendance: { ar: "تقارير انتظام الموظفين", en: "Attendance Reports" },
  tasks: { ar: "المهام", en: "Tasks" },
};

function PermissionsDialog({ userId, email }: { userId: string; email: string }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const getAccessFn = useServerFn(getUserAccess);
  const setAccessFn = useServerFn(setUserAccess);
  const brandsFn = useServerFn(listBrands);
  const qc = useQueryClient();
  const accessQ = useQuery({
    queryKey: ["user-access", userId],
    queryFn: () => getAccessFn({ data: { userId } }),
    enabled: open,
  });

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn(), enabled: open });
  const [sections, setSections] = useState<string[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);

  useEffect(() => {
    if (accessQ.data) {
      setSections(accessQ.data.sections);
      setBrandIds(accessQ.data.brandIds);
    }
  }, [accessQ.data]);
  const mut = useMutation({
    mutationFn: async () => {
      await setAccessFn({ data: { userId, sections, brandIds } });
    },
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم حفظ الصلاحيات" : "Permissions saved");
      qc.invalidateQueries({ queryKey: ["user-access", userId] });

      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = (list: string[], setList: (v: string[]) => void, val: string) =>
    setList(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);

  // Group nav pages by hub for a full view of every screen the user can be granted.
  const pagesByHub = HUBS.map((h) => ({ hub: h, pages: pagesForHub(h.key) }));
  const allPages = pagesByHub.flatMap(({ pages }) => pages);
  type PageLevel = "none" | "read" | "write";
  const pageLevel = (page: (typeof allPages)[number]): PageLevel => {
    if (sections.includes(`write:${page.to}`)) return "write";
    if (sections.includes(`page:${page.to}`)) return "read";
    return "none";
  };
  const clearPageKeys = (keys: string[], route: string) =>
    keys.filter(
      (key) => key !== `deny:${route}` && key !== `page:${route}` && key !== `write:${route}`,
    );
  const setPageLevel = (page: (typeof allPages)[number], level: PageLevel) => {
    const next = clearPageKeys(sections, page.to);
    if (level === "read") next.push(`page:${page.to}`);
    else if (level === "write") next.push(`write:${page.to}`);
    else next.push(`deny:${page.to}`);
    setSections(Array.from(new Set(next)));
  };
  const setPagesLevel = (pages: typeof allPages, level: PageLevel) => {
    const routes = new Set(pages.map((page) => page.to));
    const next = sections.filter((key) => {
      if (key.startsWith("deny:") || key.startsWith("page:") || key.startsWith("write:")) {
        return !routes.has(key.slice(key.indexOf(":") + 1));
      }
      return true;
    });
    const prefix = level === "write" ? "write" : level === "read" ? "page" : "deny";
    next.push(...pages.map((page) => `${prefix}:${page.to}`));
    setSections(Array.from(new Set(next)));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" title={lang === "ar" ? "صلاحيات" : "Permissions"}>
          <Lock className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {lang === "ar" ? "الصلاحيات" : "Permissions"} — <span dir="ltr">{email}</span>
          </DialogTitle>
          <DialogDescription>
            {lang === "ar"
              ? "المستخدم لا يرى أي صفحة إلا ما تحدده هنا صراحةً، ولكل صفحة تختار: مخفي / مشاهدة فقط / تعديل."
              : "The user sees no page except what you explicitly grant here. For each page you choose: Hidden / View only / Edit."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            {lang === "ar"
              ? "لا توجد صلاحيات افتراضية: أي صفحة غير محددة تكون مخفية. «مشاهدة فقط» تمنع الإضافة والتعديل والحذف على مستوى السيرفر."
              : 'There are no default permissions: any page not specified stays hidden. "View only" blocks adding, editing and deleting at the server level.'}
          </div>

          <div className="space-y-4">
            <div className="text-sm font-semibold">
              {lang === "ar" ? "صلاحيات الصفحات" : "Page Permissions"}
            </div>
            {pagesByHub.map(({ hub, pages }) => {
              return (
                <div key={hub.key} className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <hub.icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="text-sm font-semibold">{lang === "ar" ? hub.ar : hub.en}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7"
                        onClick={() => setPagesLevel(pages, "none")}
                      >
                        {lang === "ar" ? "إخفاء الكل" : "Hide All"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7"
                        onClick={() => setPagesLevel(pages, "read")}
                      >
                        {lang === "ar" ? "مشاهدة الكل" : "View All"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7"
                        onClick={() => setPagesLevel(pages, "write")}
                      >
                        {lang === "ar" ? "تعديل الكل" : "Edit All"}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {pages.map((p) => {
                      const level = pageLevel(p);
                      const opts: { key: "none" | "read" | "write"; label: string }[] = [
                        { key: "none", label: lang === "ar" ? "مخفي" : "Hidden" },
                        { key: "read", label: lang === "ar" ? "مشاهدة" : "View" },
                        { key: "write", label: lang === "ar" ? "تعديل" : "Edit" },
                      ];
                      return (
                        <div
                          key={p.to}
                          className="flex items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2 py-1.5 text-xs"
                        >
                          <p.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate flex-1">{lang === "ar" ? p.ar : p.en}</span>
                          <div className="flex rounded-md border border-border/60 overflow-hidden shrink-0">
                            {opts.map((o) => (
                              <button
                                key={o.key}
                                type="button"
                                onClick={() => setPageLevel(p, o.key)}
                                className={
                                  "px-2 py-0.5 text-[11px] transition-colors " +
                                  (level === o.key
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-muted text-muted-foreground")
                                }
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Extra generic sections not covered by any page */}
            {(() => {
              const usedSecs = new Set(
                HUBS.flatMap(
                  (h) =>
                    pagesForHub(h.key)
                      .map((p) => p.section)
                      .filter(Boolean) as string[],
                ),
              );
              const extra = (ALL_SECTIONS as readonly string[]).filter((s) => !usedSecs.has(s));
              if (extra.length === 0) return null;
              return (
                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <div className="text-sm font-semibold mb-2">
                    {lang === "ar" ? "أقسام عامة إضافية" : "Additional General Sections"}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {extra.map((s) => (
                      <label
                        key={s}
                        className="flex items-center gap-2 text-sm cursor-pointer bg-background/40 rounded-md px-2 py-1.5 border border-border/40"
                      >
                        <Checkbox
                          checked={sections.includes(s)}
                          onCheckedChange={() => toggle(sections, setSections, s)}
                        />
                        <span>
                          {lang === "ar"
                            ? (SECTION_LABELS[s]?.ar ?? s)
                            : (SECTION_LABELS[s]?.en ?? s)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Brand access */}
          <div>
            <div className="font-semibold text-sm mb-2">
              {lang === "ar" ? "البراندات المسموحة" : "Allowed Brands"}
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {lang === "ar"
                ? "لا تحدد أي براند = وصول لكل البراندات."
                : "Select no brand = access to all brands."}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
              {(brandsQ.data ?? []).map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={brandIds.includes(b.id)}
                    onCheckedChange={() => toggle(brandIds, setBrandIds, b.id)}
                  />
                  {b.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {lang === "ar" ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
