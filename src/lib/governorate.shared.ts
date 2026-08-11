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
