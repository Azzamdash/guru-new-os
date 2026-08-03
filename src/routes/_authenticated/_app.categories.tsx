import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listCategories, upsertCategory, deleteCategory } from "@/lib/internal.functions";
import { getMyRole } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Lock, Pencil } from "lucide-react";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/categories")({
  head: () => ({ meta: [{ title: tr("بنود المصروفات — e-GURUS") }] }),
  component: CategoriesPage,
});

type Cat = { id: string; name: string; slug: string; active: boolean; sort_order: number };

function CategoriesPage() {
  const { lang } = useLang();
  const qc = useQueryClient();
  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: useServerFn(getMyRole) });
  const catsQ = useQuery({ queryKey: ["categories"], queryFn: useServerFn(listCategories) });
  const upsertFn = useServerFn(upsertCategory);
  const delFn = useServerFn(deleteCategory);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
  };
  const [editing, setEditing] = useState<Cat | null>(null);

  const canManage = !!(roleQ.data?.isAdmin || roleQ.data?.isManager || roleQ.data?.canWrite);
  if (!canManage) {
    return (
      <div className="p-10 max-w-2xl mx-auto">
        <Card className="p-8 text-center card-gradient">
          <Lock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-xl font-bold">
            {lang === "ar" ? "لا تملك صلاحية الوصول" : "You do not have access"}
          </h2>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {lang === "ar" ? "بنود المصروفات" : "Expense Categories"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {lang === "ar"
              ? "البنود المتاحة عند إدخال المصروفات."
              : "Categories available when entering expenses."}
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => setEditing({ id: "", name: "", slug: "", active: true, sort_order: 0 })}
        >
          <Plus className="w-4 h-4" /> {lang === "ar" ? "بند جديد" : "New Category"}
        </Button>
      </div>

      <Card className="card-gradient overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-right border-b border-border">
              <th className="p-3">{lang === "ar" ? "الاسم" : "Name"}</th>
              <th className="p-3">{lang === "ar" ? "الرمز" : "Slug"}</th>
              <th className="p-3">{lang === "ar" ? "الترتيب" : "Order"}</th>
              <th className="p-3">{lang === "ar" ? "الحالة" : "Status"}</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(catsQ.data ?? []).map((c) => (
              <tr key={c.id} className="border-b border-border/50">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 text-muted-foreground" dir="ltr">
                  {c.slug}
                </td>
                <td className="p-3 num">{c.sort_order}</td>
                <td className="p-3">
                  {c.active ? (
                    <Badge>{lang === "ar" ? "مفعّل" : "Active"}</Badge>
                  ) : (
                    <Badge variant="secondary">{lang === "ar" ? "موقوف" : "Inactive"}</Badge>
                  )}
                </td>
                <td className="p-3 text-left">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(lang === "ar" ? "حذف البند؟" : "Delete this category?"))
                        delFn({ data: { id: c.id } })
                          .then(() => {
                            toast.success(lang === "ar" ? "حُذف" : "Deleted");
                            invalidate();
                          })
                          .catch((e: unknown) =>
                            toast.error(
                              e instanceof Error
                                ? e.message
                                : lang === "ar"
                                  ? "لا يمكن الحذف — البند مستخدم"
                                  : "Cannot delete — category in use",
                            ),
                          );
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {editing && (
        <CategoryDialog
          editing={editing}
          onClose={() => setEditing(null)}
          save={upsertFn}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}

function CategoryDialog({
  editing,
  onClose,
  save,
  onSaved,
}: {
  editing: Cat;
  onClose: () => void;
  save: ReturnType<typeof useServerFn>;
  onSaved: () => void;
}) {
  const { lang } = useLang();
  const [form, setForm] = useState<Cat>(editing);
  const submit = () => {
    if (!form.name.trim() || !form.slug.trim())
      return toast.error(lang === "ar" ? "الاسم والرمز مطلوبان" : "Name and slug are required");
    const payload: Partial<Cat> = {
      name: form.name,
      slug: form.slug,
      active: form.active,
      sort_order: form.sort_order,
    };
    if (form.id) payload.id = form.id;
    save({ data: payload })
      .then(() => {
        toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
        onSaved();
        onClose();
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : lang === "ar" ? "فشل" : "Failed"),
      );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {form.id
              ? lang === "ar"
                ? "تعديل بند"
                : "Edit Category"
              : lang === "ar"
                ? "بند جديد"
                : "New Category"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{lang === "ar" ? "الاسم" : "Name"}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>{lang === "ar" ? "الرمز (slug)" : "Slug"}</Label>
            <Input
              value={form.slug}
              dir="ltr"
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
          </div>
          <div>
            <Label>{lang === "ar" ? "الترتيب" : "Order"}</Label>
            <Input
              type="number"
              dir="ltr"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>{lang === "ar" ? "مفعّل" : "Active"}</Label>
            <Switch
              checked={form.active}
              onCheckedChange={(v) => setForm({ ...form, active: v })}
            />
          </div>
          <Button onClick={submit} className="w-full">
            {lang === "ar" ? "حفظ" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
