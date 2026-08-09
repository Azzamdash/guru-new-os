import { createFileRoute } from "@tanstack/react-router";
import { Palette, Check, Sun, Moon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";
import { useAppTheme } from "@/components/ThemeProvider";
import type { AppTheme } from "@/lib/theme-storage";

export const Route = createFileRoute("/_authenticated/_app/themes")({
  head: () => ({
    meta: [
      { title: "الثيمات — e-GURUS" },
      { name: "description", content: "اختيار هوية الألوان ووضع الإضاءة للنظام كله." },
    ],
  }),
  component: ThemesPage,
});

const THEMES: Array<{
  id: AppTheme;
  nameAr: string;
  nameEn: string;
  tagAr: string;
  tagEn: string;
  noteAr: string;
  noteEn: string;
}> = [
  {
    id: "emerald",
    nameAr: "زمردي",
    nameEn: "Emerald",
    tagAr: "الافتراضي",
    tagEn: "Default",
    noteAr: "الشكل الحالي بالظبط — الاختيار الآمن اللي محدش هيتفاجئ بيه.",
    noteEn: "The exact current look — the safe default nobody gets surprised by.",
  },
  {
    id: "violet",
    nameAr: "بنفسجي",
    nameEn: "Violet",
    tagAr: "إبداعي",
    tagEn: "Creative",
    noteAr: "بنفسجي جريء بلمسة وردية — حس مميز ومختلف عن الشكل المالي التقليدي.",
    noteEn: "A confident purple with a magenta pop — expressive, not clinical.",
  },
  {
    id: "midnight",
    nameAr: "ميدنايت",
    nameEn: "Midnight",
    tagAr: "تِك",
    tagEn: "Tech",
    noteAr: "أسود تقريبًا مع أزرق كهربائي — الأهدأ من الأربعة، مناسب لشاشة طول اليوم.",
    noteEn: "Near-black with an electric blue accent — the calmest of the four.",
  },
  {
    id: "amber",
    nameAr: "أورانج",
    nameEn: "Amber",
    tagAr: "إبداعي",
    tagEn: "Creative",
    noteAr: "دافئ وحيوي — أقل شبهًا بلوحة تحكم مالية، وده مقصود.",
    noteEn: "Warm and energetic — the one that feels least like a finance dashboard, on purpose.",
  },
  {
    id: "lime",
    nameAr: "لايم",
    nameEn: "Lime",
    tagAr: "مرح",
    tagEn: "Playful",
    noteAr: "أخضر مائل للأصفر بحيوية عالية — الأكثر جرأة من بين الكل.",
    noteEn: "High-energy yellow-green — the boldest of the bunch.",
  },
  {
    id: "cyan",
    nameAr: "سماوي",
    nameEn: "Cyan",
    tagAr: "تِك نضِر",
    tagEn: "Fresh Tech",
    noteAr: "فيروزي منعش مع لمسة ماجنتا — تقني وخفيف في نفس الوقت.",
    noteEn: "A refreshing turquoise with a magenta pop — technical without feeling heavy.",
  },
  {
    id: "gold",
    nameAr: "ذهبي",
    nameEn: "Gold",
    tagAr: "فاخر",
    tagEn: "Luxury",
    noteAr: "ذهبي دافئ فخم — إحساس مختلف عن أي لوحة تحكم معتادة.",
    noteEn: "A warm, premium gold — feels distinct from the usual dashboard palette.",
  },
  {
    id: "slate",
    nameAr: "رمادي أردوازي",
    nameEn: "Slate",
    tagAr: "بسيط ومؤسسي",
    tagEn: "Minimal · Corporate",
    noteAr: "رمادي مزرق هادئ ومحايد — الأقل صخبًا من بين الكل، مناسب لبيئة عمل جادة.",
    noteEn: "A calm, neutral blue-grey — the quietest of the set, built for a serious workspace.",
  },
  {
    id: "graphite",
    nameAr: "جرافيت",
    nameEn: "Graphite",
    tagAr: "رمادي محايد",
    tagEn: "Neutral Grey",
    noteAr: "رمادي محايد تمامًا بلا أي ميل للون — الأكثر حيادية من بين كل الثيمات.",
    noteEn: "Pure neutral grey with no color lean at all — the most neutral theme in the set.",
  },
  {
    id: "forest",
    nameAr: "غابي",
    nameEn: "Forest",
    tagAr: "طبيعي",
    tagEn: "Natural",
    noteAr: "أخضر عميق طبيعي — مختلف عن الزمردي الفاتح، أقرب لألوان الطبيعة.",
    noteEn: "A deep, natural green — distinct from Emerald's lighter teal, closer to nature's own tones.",
  },
  {
    id: "sapphire",
    nameAr: "ياقوتي أزرق",
    nameEn: "Sapphire",
    tagAr: "تِك",
    tagEn: "Tech",
    noteAr: "أزرق غني بلمسة بنفسجية — أكثر ثراءً من الميدنايت وأقل قتامة.",
    noteEn: "A rich blue with a violet edge — richer and less stark than Midnight.",
  },
  {
    id: "rose",
    nameAr: "وردي",
    nameEn: "Rose",
    tagAr: "دافئ وإبداعي",
    tagEn: "Warm · Creative",
    noteAr: "وردي جريء بلمسة برتقالية — تعبيري ودافئ.",
    noteEn: "A confident pink-red with a warm orange pop — expressive and warm.",
  },
  {
    id: "coral",
    nameAr: "مرجاني",
    nameEn: "Coral",
    tagAr: "حيوي",
    tagEn: "Energetic",
    noteAr: "مرجاني دافئ وحيوي بلمسة سماوية باردة تعمل كتباين — أكثر حيوية من الأورانج.",
    noteEn: "A warm, energetic coral balanced by a cool cyan pop — livelier than Amber.",
  },
];

function ThemesPage() {
  const { lang } = useLang();
  const AR = lang === "ar";
  const { theme, mode, setTheme, setMode } = useAppTheme();

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Palette className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{AR ? "الثيمات" : "Themes"}</h1>
          <p className="text-sm text-muted-foreground">
            {AR
              ? "اختر هوية الألوان ووضع الإضاءة. التغيير فوري ومحفوظ على هذا الجهاز."
              : "Pick a color identity and light/dark mode. Changes apply instantly and are saved on this device."}
          </p>
        </div>
      </div>

      {/* Appearance (light/dark) */}
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-sm">{AR ? "الإضاءة" : "Appearance"}</div>
          <p className="text-xs text-muted-foreground">
            {AR ? "يطبَّق على أي ثيم تختاره." : "Applies to whichever theme you pick."}
          </p>
        </div>
        <div className="inline-flex rounded-full border border-border bg-muted/40 p-1">
          <Button
            type="button"
            size="sm"
            variant={mode === "dark" ? "default" : "ghost"}
            className="rounded-full gap-1.5"
            onClick={() => setMode("dark")}
          >
            <Moon className="w-3.5 h-3.5" />
            {AR ? "غامق" : "Dark"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "light" ? "default" : "ghost"}
            className="rounded-full gap-1.5"
            onClick={() => setMode("light")}
          >
            <Sun className="w-3.5 h-3.5" />
            {AR ? "فاتح" : "Light"}
          </Button>
        </div>
      </Card>

      {/* Theme picker */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={`text-start rounded-2xl border-2 transition-all overflow-hidden ${
                active
                  ? "border-primary shadow-lg shadow-primary/10"
                  : "border-transparent hover:border-border"
              }`}
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div>
                  <div className="font-bold text-sm flex items-center gap-1.5">
                    {AR ? t.nameAr : t.nameEn}
                    {active && <Check className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    {AR ? t.tagAr : t.tagEn}
                  </div>
                </div>
              </div>
              <p className="px-4 pb-3 text-xs text-muted-foreground leading-relaxed">
                {AR ? t.noteAr : t.noteEn}
              </p>

              {/* Live preview, scoped to this theme's real CSS variables */}
              <div className={`theme-${t.id} mode-${mode} p-4`} style={{ background: "var(--background)" }}>
                <div className="flex gap-1.5 mb-3">
                  {["var(--background)", "var(--card)", "var(--primary)", "var(--accent)", "var(--success)"].map(
                    (c, i) => (
                      <div
                        key={i}
                        className="flex-1 h-4 rounded"
                        style={{ background: c, border: "1px solid var(--card-gradient-border)" }}
                      />
                    ),
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { l: AR ? "الإيراد" : "Revenue", v: "86.4K" },
                    { l: AR ? "الأوردرات" : "Orders", v: "312" },
                    { l: AR ? "التسليم" : "Delivery", v: "91.2%" },
                  ].map((k) => (
                    <div
                      key={k.l}
                      className="rounded-lg p-2"
                      style={{
                        background: "var(--card)",
                        border: "1px solid var(--card-gradient-border)",
                        color: "var(--card-foreground)",
                      }}
                    >
                      <div
                        className="text-[9px] font-semibold mb-1"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {k.l}
                      </div>
                      <div className="num text-sm font-bold">{k.v}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[11px] font-bold px-3 py-1.5 rounded-md"
                    style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                  >
                    {AR ? "حفظ" : "Save"}
                  </span>
                  <span
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-md"
                    style={{
                      background: "transparent",
                      color: "var(--foreground)",
                      border: "1px solid var(--card-gradient-border)",
                    }}
                  >
                    {AR ? "تصدير" : "Export"}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
