// Tüm tarih/saatler Türkiye yerel saatiyle, saat dilimi bilgisi olmadan metin olarak işlenir:
// tarih "2026-10-14", saat "15:30", tarih-saat "2026-10-14T15:30:00".
// Cloudflare sunucuları UTC'de çalışır; Türkiye 2016'dan beri yaz saati uygulamadan UTC+3'tür.
import { BadRequest } from "./errors";

const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000;

export const DAYS_OF_WEEK = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

// Yerel tarih-saati, hesap yapabilmek için UTC'deymiş gibi Date'e çevirir (saat dilimi kayması olmaz)
const toDate = (dateTime: string) => new Date(dateTime + "Z");
const fromDate = (d: Date) => d.toISOString().slice(0, 19);

export const nowLocal = (): string => fromDate(new Date(Date.now() + TURKEY_OFFSET_MS));
export const todayLocal = (): string => nowLocal().slice(0, 10);

export const plusMinutes = (dateTime: string, minutes: number): string =>
  fromDate(new Date(toDate(dateTime).getTime() + minutes * 60_000));

export const plusDays = (date: string, days: number): string =>
  plusMinutes(date + "T00:00:00", days * 24 * 60).slice(0, 10);

export const daysBetween = (from: string, to: string): number =>
  Math.round((toDate(to + "T00:00:00").getTime() - toDate(from + "T00:00:00").getTime()) / 86_400_000);

export const dayOfWeek = (date: string): DayOfWeek =>
  DAYS_OF_WEEK[(toDate(date + "T00:00:00").getUTCDay() + 6) % 7];

export const startOfDay = (date: string) => `${date}T00:00:00`;
export const endOfDay = (date: string) => `${date}T23:59:59`;

// "2026-10-14T15:30:00" -> "14.10.2026 15:30"
export const formatForSms = (dateTime: string): string => {
  const [date, time] = dateTime.split("T");
  return `${date.split("-").reverse().join(".")} ${time.slice(0, 5)}`;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const isRealDate = (date: string) => DATE_RE.test(date) && fromDate(toDate(date + "T00:00:00")).startsWith(date);

// İstekten gelen değerleri doğrular; hatalıysa Java'daki gibi 400 döner
export function parseDate(value: unknown): string {
  if (typeof value !== "string" || !isRealDate(value)) throw new BadRequest();
  return value;
}

export function parseOptionalDate(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : parseDate(value);
}

// "13:00" veya "13:00:00" -> "13:00"
export function parseTime(value: unknown): string {
  if (typeof value !== "string" || !TIME_RE.test(value)) throw new BadRequest();
  return value.slice(0, 5);
}

// "2026-10-14T15:30" veya "2026-10-14T15:30:00" -> "2026-10-14T15:30:00"
export function parseDateTime(value: unknown): string {
  if (typeof value !== "string") throw new BadRequest();
  const [date, time] = value.split("T");
  if (!date || !time || !isRealDate(date) || !TIME_RE.test(time)) throw new BadRequest();
  return `${date}T${time.length === 5 ? time + ":00" : time}`;
}

export function parseDayOfWeek(value: unknown): DayOfWeek {
  if (!DAYS_OF_WEEK.includes(value as DayOfWeek)) throw new BadRequest();
  return value as DayOfWeek;
}

export const sortDays = (days: DayOfWeek[]): DayOfWeek[] =>
  [...days].sort((a, b) => DAYS_OF_WEEK.indexOf(a) - DAYS_OF_WEEK.indexOf(b));
