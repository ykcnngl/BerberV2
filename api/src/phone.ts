import { BusinessError } from "./errors";

// Veritabanındaki standart format: "05554443322", "+90 555...", "5554443322" -> "0555 444 3322"
export function normalizePhone(phone: unknown): string {
  const digits = toDigits(phone);
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

// SMS sağlayıcıları için uluslararası format: "0555 444 3322" -> "905554443322"
export function toInternational(phone: string): string {
  return "9" + toDigits(phone);
}

function toDigits(phone: unknown): string {
  if (typeof phone !== "string") {
    throw new BusinessError("Telefon numarası zorunludur.");
  }
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length === 12) {
    digits = "0" + digits.slice(2);
  } else if (digits.startsWith("5") && digits.length === 10) {
    digits = "0" + digits;
  }
  if (!/^05\d{9}$/.test(digits)) {
    throw new BusinessError("Geçerli bir cep telefonu numarası girin (05XX XXX XXXX).");
  }
  return digits;
}
