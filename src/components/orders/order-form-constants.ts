export const FF: Array<{
  v: string;
  k: string;
  tone: "default" | "success" | "destructive" | "muted";
}> = [
  { v: "unfulfilled", k: "ff_unfulfilled", tone: "muted" },
  { v: "processing", k: "ff_processing", tone: "default" },
  { v: "shipped", k: "ff_shipped", tone: "default" },
  { v: "delivered", k: "ff_delivered", tone: "success" },
  { v: "returned", k: "ff_returned", tone: "destructive" },
  { v: "cancelled", k: "ff_cancelled", tone: "muted" },
];
export const FIN: Array<{ v: string; k: string }> = [
  { v: "pending", k: "fin_pending" },
  { v: "paid", k: "fin_paid" },
  { v: "refunded", k: "fin_refunded" },
  { v: "voided", k: "fin_voided" },
];
export const CONFIRM: Array<{
  v: string;
  labelAr: string;
  labelEn: string;
  tone: "muted" | "success" | "destructive";
}> = [
  { v: "pending", labelAr: "بانتظار التأكيد", labelEn: "Pending", tone: "muted" },
  { v: "confirmed", labelAr: "مؤكد", labelEn: "Confirmed", tone: "success" },
  { v: "cancelled", labelAr: "ملغي", labelEn: "Cancelled", tone: "destructive" },
];
export const EG_GOVERNORATES: Array<{ ar: string; en: string }> = [
  { ar: "القاهرة", en: "Cairo" },
  { ar: "الجيزة", en: "Giza" },
  { ar: "الإسكندرية", en: "Alexandria" },
  { ar: "القليوبية", en: "Qalyubia" },
  { ar: "الشرقية", en: "Sharqia" },
  { ar: "الدقهلية", en: "Dakahlia" },
  { ar: "المنوفية", en: "Monufia" },
  { ar: "الغربية", en: "Gharbia" },
  { ar: "كفر الشيخ", en: "Kafr El Sheikh" },
  { ar: "دمياط", en: "Damietta" },
  { ar: "بورسعيد", en: "Port Said" },
  { ar: "الإسماعيلية", en: "Ismailia" },
  { ar: "السويس", en: "Suez" },
  { ar: "شمال سيناء", en: "North Sinai" },
  { ar: "جنوب سيناء", en: "South Sinai" },
  { ar: "البحيرة", en: "Beheira" },
  { ar: "مطروح", en: "Matrouh" },
  { ar: "الفيوم", en: "Fayoum" },
  { ar: "بني سويف", en: "Beni Suef" },
  { ar: "المنيا", en: "Minya" },
  { ar: "أسيوط", en: "Assiut" },
  { ar: "سوهاج", en: "Sohag" },
  { ar: "قنا", en: "Qena" },
  { ar: "الأقصر", en: "Luxor" },
  { ar: "أسوان", en: "Aswan" },
  { ar: "البحر الأحمر", en: "Red Sea" },
  { ar: "الوادي الجديد", en: "New Valley" },
];
