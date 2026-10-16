// toISOString() UTC'ye çevirdiği için Türkiye'de gece 00:00-03:00 arası dünü verir; yerel tarihi kullan
export const toLocalDateStr = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const getLocalDateStr = () => toLocalDateStr(new Date());

// "05551112233" -> "0555 111 2233" (yazarken de kademeli biçimlendirir)
export const formatPhoneNumber = (value) => {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, "");
  if (phoneNumber.length < 5) return phoneNumber;
  if (phoneNumber.length < 8)
    return `${phoneNumber.slice(0, 4)} ${phoneNumber.slice(4)}`;
  return `${phoneNumber.slice(0, 4)} ${phoneNumber.slice(4, 7)} ${phoneNumber.slice(7, 11)}`;
};

// Backend (Java DayOfWeek) gün adları, Pazartesi'den başlayarak
export const DAYS = [
  { value: "MONDAY", label: "Pazartesi", short: "Pzt" },
  { value: "TUESDAY", label: "Salı", short: "Sal" },
  { value: "WEDNESDAY", label: "Çarşamba", short: "Çar" },
  { value: "THURSDAY", label: "Perşembe", short: "Per" },
  { value: "FRIDAY", label: "Cuma", short: "Cum" },
  { value: "SATURDAY", label: "Cumartesi", short: "Cmt" },
  { value: "SUNDAY", label: "Pazar", short: "Paz" },
];

export const dayLabel = (value) => DAYS.find((d) => d.value === value)?.label || value;

// "2026-10-13" -> "MONDAY" gibi backend gün adı (JS getDay(): 0 = Pazar)
export const dayOfWeekOf = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][
    new Date(y, m - 1, d).getDay()
  ];
};

// 1250.5 -> "₺1.250,50"
export const formatMoney = (value) =>
  Number(value || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 2 });

// "2026-10-13" -> "13.10.2026"
export const formatDate = (dateStr) => dateStr.split("-").reverse().join(".");

// Ödeme yöntemleri (backend: CASH, CARD, TRANSFER)
export const PAYMENT_METHODS = [
  { value: "CASH", label: "Nakit" },
  { value: "CARD", label: "Kart" },
  { value: "TRANSFER", label: "IBAN" },
];

export const paymentLabel = (value) => PAYMENT_METHODS.find((p) => p.value === value)?.label || "Belirtilmemiş";

// Gider kategorileri (backend: expenses.ts CATEGORIES ile aynı)
export const EXPENSE_CATEGORIES = [
  { value: "RENT", label: "Kira / Aidat" },
  { value: "BILLS", label: "Faturalar" },
  { value: "SUPPLIES", label: "Malzeme" },
  { value: "PRODUCT", label: "Ürün alımı" },
  { value: "SALARY", label: "Maaş / Personel" },
  { value: "TAX", label: "Vergi / SGK" },
  { value: "OTHER", label: "Diğer" },
];

export const categoryLabel = (value) => EXPENSE_CATEGORIES.find((c) => c.value === value)?.label || "Diğer";

