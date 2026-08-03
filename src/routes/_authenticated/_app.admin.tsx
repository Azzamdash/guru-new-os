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
  const getMyRoleFn = useServerFn(getMyRole);
  const listUsersFn = useServerFn(listUsers);

  const roleQuery = useQuery({ queryKey: ["my-role"], queryFn: () => getMyRoleFn() });

  useEffect(() => {
    if (roleQuery.data && !roleQuery.data.isAdmin) {
      toast.error(tr("هذه الصفحة للمشرفين فقط"));
      navigate({ to: "/dashboard" });
    }
  }, [roleQuery.data, navigate]);

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listUsersFn(),
    enabled: !!roleQuery.data?.isAdmin,
  });

  if (roleQuery.isLoading || !roleQuery.data?.isAdmin) {
    return <div className="p-8 text-muted-foreground">{tr("جاري التحقق من الصلاحيات...")}</div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary" />
            {tr("إدارة المستخدمين")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {tr("إنشاء المستخدمين، تعيين الأدوار، إعادة تعيين كلمات المرور وإيقاف الحسابات")}
          </p>
        </div>
        <CreateUserDialog />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">{tr("البريد الإلكتروني")}</TableHead>
              <TableHead className="text-right">{tr("الدور")}</TableHead>
              <TableHead className="text-right">{tr("الحالة")}</TableHead>
              <TableHead className="text-right">{tr("آخر دخول")}</TableHead>
              <TableHead className="text-right">{tr("إجراءات")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {tr("جاري التحميل...")}
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
const ROLE_OPTIONS: { v: Role; l: string }[] = [
  { v: "admin", l: "مشرف (Admin)" },
  { v: "member", l: "مستخدم (User)" },
];
const roleLabel = (v: string) =>
  ROLE_OPTIONS.find((r) => r.v === v)?.l ?? (v === "admin" ? "مشرف" : "مستخدم");

type UserRow = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null | undefined;
  banned_until: string | null | undefined;
  roles: string[];
};

function UserRow({ user }: { user: UserRow }) {
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
      toast.success(tr("تم تحديث الدور"));
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? tr("فشل التحديث")),
  });

  const banMut = useMutation({
    mutationFn: () => setBannedFn({ data: { userId: user.id, banned: !isBanned } }),
    onSuccess: () => {
      toast.success(isBanned ? tr("تم تفعيل الحساب") : tr("تم إيقاف الحساب"));
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? tr("فشل التحديث")),
  });

  const delMut = useMutation({
    mutationFn: () => deleteFn({ data: { userId: user.id } }),
    onSuccess: () => {
      toast.success(tr("تم حذف المستخدم"));
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? tr("فشل الحذف")),
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
                {r.l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {isBanned ? (
          <Badge variant="destructive">{tr("موقوف")}</Badge>
        ) : (
          <Badge variant="secondary" className="bg-green-500/15 text-green-500">
            {tr("نشط")}
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
              if (confirm(`حذف المستخدم ${user.email}؟`)) delMut.mutate();
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
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const updateFn = useServerFn(updateUserPassword);
  const mut = useMutation({
    mutationFn: () => updateFn({ data: { userId, password } }),
    onSuccess: () => {
      toast.success(tr("تم تحديث كلمة المرور"));
      setOpen(false);
      setPassword("");
    },
    onError: (e: any) => toast.error(e.message ?? tr("فشل التحديث")),
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
          <DialogTitle>{tr("تغيير كلمة المرور")}</DialogTitle>
          <DialogDescription dir="ltr" className="text-right">
            {email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="pw">{tr("كلمة المرور الجديدة")}</Label>
          <Input
            id="pw"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={tr("6 أحرف على الأقل")}
            dir="ltr"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tr("إلغاء")}
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || password.length < 6}>
            {tr("حفظ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("member");
  const qc = useQueryClient();
  const createFn = useServerFn(createUser);
  const mut = useMutation({
    mutationFn: () => createFn({ data: { email, password, role } }),
    onSuccess: () => {
      toast.success(tr("تم إنشاء المستخدم"));
      setOpen(false);
      setEmail("");
      setPassword("");
      setRole("member");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: any) => toast.error(e.message ?? tr("فشل الإنشاء")),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="w-4 h-4 ml-2" />
          {tr("مستخدم جديد")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr("إنشاء مستخدم جديد")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{tr("البريد الإلكتروني")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="npw">{tr("كلمة المرور")}</Label>
            <Input
              id="npw"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              placeholder={tr("6 أحرف على الأقل")}
            />
          </div>
          <div className="space-y-2">
            <Label>{tr("الدور")}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.v} value={r.v}>
                    {r.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {tr("مشرف: صلاحيات كاملة على كل شيء · مستخدم: يفتح فقط الصفحات التي تسمح له بها، وأنت تحدد\n              إن كان يستطيع إدخال بيانات أم مشاهدة فقط.")}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tr("إلغاء")}
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !email || password.length < 6}
          >
            {tr("إنشاء")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// used in table header row (kept exported for reference)
export { roleLabel };

const SECTION_LABELS: Record<string, string> = {
  dashboard: "لوحة التحكم",
  data_entry: "إدخال البيانات",
  expenses: "المصروفات",
  sales: "فواتير المبيعات",
  production: "الإنتاج والمخزون",
  couriers: "الشحن والمناديب",
  fulfillment: "تحضير الأوردرات",
  suppliers: "الموردين",
  catalog: "الكتالوج",
  marketing: "التسويق",
  reports_marketing: "تقارير التسويق",
  reports_production: "تقارير الإنتاج",
  reports_sales: "تقارير المبيعات",
  reports_fulfillment: "تقارير Fulfillment",
  reports_attendance: "تقارير انتظام الموظفين",
  tasks: "المهام",
};

function PermissionsDialog({ userId, email }: { userId: string; email: string }) {
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
      toast.success(tr("تم حفظ الصلاحيات"));
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
    let next = clearPageKeys(sections, page.to);
    if (level === "read") next.push(`page:${page.to}`);
    else if (level === "write") next.push(`write:${page.to}`);
    else next.push(`deny:${page.to}`);
    setSections(Array.from(new Set(next)));
  };
  const setPagesLevel = (pages: typeof allPages, level: PageLevel) => {
    const routes = new Set(pages.map((page) => page.to));
    let next = sections.filter((key) => {
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
        <Button size="sm" variant="outline" title={tr("صلاحيات")}>
          <Lock className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {tr("الصلاحيات —")} <span dir="ltr">{email}</span>
          </DialogTitle>
          <DialogDescription>
            {tr("المستخدم لا يرى أي صفحة إلا ما تحدده هنا صراحةً، ولكل صفحة تختار: مخفي / مشاهدة فقط /\n            تعديل.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            {tr("لا توجد صلاحيات افتراضية: أي صفحة غير محددة تكون مخفية. «مشاهدة فقط» تمنع الإضافة\n            والتعديل والحذف على مستوى السيرفر.")}
          </div>

          <div className="space-y-4">
            <div className="text-sm font-semibold">{tr("صلاحيات الصفحات")}</div>
            {pagesByHub.map(({ hub, pages }) => {
              return (
                <div key={hub.key} className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <hub.icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="text-sm font-semibold">{hub.ar}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7"
                        onClick={() => setPagesLevel(pages, "none")}
                      >
                        {tr("إخفاء الكل")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7"
                        onClick={() => setPagesLevel(pages, "read")}
                      >
                        {tr("مشاهدة الكل")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7"
                        onClick={() => setPagesLevel(pages, "write")}
                      >
                        {tr("تعديل الكل")}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {pages.map((p) => {
                      const level = pageLevel(p);
                      const opts: { key: "none" | "read" | "write"; label: string }[] = [
                        { key: "none", label: tr("مخفي") },
                        { key: "read", label: tr("مشاهدة") },
                        { key: "write", label: tr("تعديل") },
                      ];
                      return (
                        <div
                          key={p.to}
                          className="flex items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2 py-1.5 text-xs"
                        >
                          <p.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate flex-1">{p.ar}</span>
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
                  <div className="text-sm font-semibold mb-2">{tr("أقسام عامة إضافية")}</div>
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
                        <span>{SECTION_LABELS[s] ?? s}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Brand access */}
          <div>
            <div className="font-semibold text-sm mb-2">{tr("البراندات المسموحة")}</div>
            <p className="text-xs text-muted-foreground mb-2">
              {tr("لا تحدد أي براند = وصول لكل البراندات.")}
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
            {tr("إلغاء")}
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {tr("حفظ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
