/**
 * Folds the spellings of an Egyptian governorate onto one comparison key.
 *
 * Rates are entered in Arabic from the couriers page; orders synced from
 * Shopify carry addr.province, which is English. Matching them raw means a
 * courier fee never resolves for a synced order, so anything that looks up a
 * rate outside the database has to fold the two the same way the database
 * does.
 *
 * This is the mirror of public.normalize_governorate (20260810230000) and must
 * stay in step with it: same order of operations, same alias table.
 */
const ALIASES: Record<string, string> = {
  cairo: "قاهره",
  giza: "جيزه",
  alexandria: "اسكندريه",
  qalyubia: "قليوبيه",
  qaliobia: "قليوبيه",
  qalubia: "قليوبيه",
  kalyoubia: "قليوبيه",
  qalyubiyah: "قليوبيه",
  sharqia: "شرقيه",
  sharkia: "شرقيه",
  sharqiya: "شرقيه",
  dakahlia: "دقهليه",
  dakahleya: "دقهليه",
  dakahliya: "دقهليه",
  menofia: "منوفيه",
  monufia: "منوفيه",
  menoufia: "منوفيه",
  minufiya: "منوفيه",
  gharbia: "غربيه",
  gharbiya: "غربيه",
  "kafr sheikh": "كفر الشيخ",
  "kafr el sheikh": "كفر الشيخ",
  "kafr al sheikh": "كفر الشيخ",
  kafrelsheikh: "كفر الشيخ",
  "kafr elsheikh": "كفر الشيخ",
  damietta: "دمياط",
  dumyat: "دمياط",
  "port said": "بورسعيد",
  portsaid: "بورسعيد",
  ismailia: "اسماعيليه",
  ismailiya: "اسماعيليه",
  suez: "سويس",
  "north sinai": "شمال سيناء",
  "south sinai": "جنوب سيناء",
  beheira: "بحيره",
  behira: "بحيره",
  buhayrah: "بحيره",
  beheria: "بحيره",
  matrouh: "مطروح",
  matruh: "مطروح",
  "marsa matrouh": "مطروح",
  fayoum: "فيوم",
  faiyum: "فيوم",
  fayyum: "فيوم",
  "beni suef": "بني سويف",
  "bani suef": "بني سويف",
  "beni sweif": "بني سويف",
  minya: "منيا",
  menia: "منيا",
  minia: "منيا",
  assiut: "اسيوط",
  asyut: "اسيوط",
  assiout: "اسيوط",
  sohag: "سوهاج",
  suhag: "سوهاج",
  qena: "قنا",
  kena: "قنا",
  luxor: "اقصر",
  aswan: "اسوان",
  "red sea": "بحر الاحمر",
  "new valley": "وادي الجديد",
};

export function normalizeGovernorate(name: string | null | undefined): string {
  let s = (name ?? "").toLowerCase().trim();
  if (!s) return "";
  s = s.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  // Arabic orthographic variants that are the same governorate.
  s = s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  // Leading definite article, either script.
  s = s
    .replace(/^ال/, "")
    .replace(/^(al|el) /, "")
    .trim();
  return ALIASES[s] ?? s;
}

/**
 * The one spelling a governorate is stored as.
 *
 * normalizeGovernorate produces a comparison key, not something to show a
 * human — it strips the article and flattens letters. This maps that key back
 * to the proper Arabic name, so every write path can agree on a single stored
 * value instead of each recording whatever its own source happened to say:
 * Shopify's English province, or the order form's Arabic or English depending
 * on which language the UI was in when the order was typed.
 *
 * A name with no known canonical form is returned trimmed but otherwise as
 * given. Rewriting something unrecognised would lose information, and the
 * normalised match already handles it.
 */
const CANONICAL: Record<string, string> = {
  قاهره: "القاهرة",
  جيزه: "الجيزة",
  اسكندريه: "الإسكندرية",
  قليوبيه: "القليوبية",
  شرقيه: "الشرقية",
  دقهليه: "الدقهلية",
  منوفيه: "المنوفية",
  غربيه: "الغربية",
  "كفر الشيخ": "كفر الشيخ",
  دمياط: "دمياط",
  بورسعيد: "بورسعيد",
  اسماعيليه: "الإسماعيلية",
  سويس: "السويس",
  "شمال سيناء": "شمال سيناء",
  "جنوب سيناء": "جنوب سيناء",
  بحيره: "البحيرة",
  مطروح: "مطروح",
  فيوم: "الفيوم",
  "بني سويف": "بني سويف",
  منيا: "المنيا",
  اسيوط: "أسيوط",
  سوهاج: "سوهاج",
  قنا: "قنا",
  اقصر: "الأقصر",
  اسوان: "أسوان",
  "بحر الاحمر": "البحر الأحمر",
  "وادي الجديد": "الوادي الجديد",
};

export function canonicalGovernorate(name: string | null | undefined): string | null {
  const raw = (name ?? "").trim();
  if (!raw) return null;
  return CANONICAL[normalizeGovernorate(raw)] ?? raw;
}
