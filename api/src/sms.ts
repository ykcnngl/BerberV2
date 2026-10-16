import type { Env } from "./env";
import { SmsError } from "./errors";
import { toInternational } from "./phone";
import { formatForSms } from "./time";

// SMS sağlayıcısı. phone: uluslararası format, örn. "905554443322"
export interface SmsSender {
  // Doğrulama kodu (OTP). Mesajda Türkçe karakter kullanılmamalı.
  sendOtp(phone: string, message: string): Promise<void>;
  // Bilgilendirme mesajı (randevu onayı/iptali). Tek parça gitmesi için Türkçe karaktersiz, en fazla 160 karakter.
  sendNotification(phone: string, message: string): Promise<void>;
}

export function smsSender(env: Env): SmsSender {
  return env.SMS_PROVIDER === "netgsm" ? new NetgsmSmsSender(env) : logSmsSender;
}

// GELİŞTİRME İÇİN: SMS göndermez, mesajı loga yazar. Canlıda SMS_PROVIDER "netgsm" olmalı.
const logSmsSender: SmsSender = {
  async sendOtp(phone, message) {
    console.log(`[SMS -> ${phone}] ${message}`);
  },
  async sendNotification(phone, message) {
    console.log(`[SMS -> ${phone}] ${message}`);
  },
};

// Netgsm entegrasyonu. Hesapta onaylı gönderici başlığı olmalıdır.
// - OTP (doğrulama kodu): "OTP SMS Paketi" gerekir, mesajda Türkçe karakter kullanılamaz.
// - Bilgilendirme (randevu onayı/iptali): normal SMS paketi. Tek parça (160 karakter) gitmesi için
//   mesajlar Türkçe karaktersiz yazılır (bkz. smsAscii).
const OTP_URL = "https://api.netgsm.com.tr/sms/send/otp";
const SMS_URL = "https://api.netgsm.com.tr/sms/send/xml";

const OTP_ERRORS: Record<string, string> = {
  "20": "Mesaj metni veya uzunluğu hatalı",
  "30": "Geçersiz kullanıcı adı/şifre, API erişim izni yok veya IP kısıtlaması",
  "40": "Gönderici başlığı tanımlı değil",
  "41": "Gönderici başlığı tanımlı değil",
  "50": "Gönderilen numara hatalı",
  "60": "Hesapta OTP SMS paketi tanımlı değil",
  "70": "Eksik veya hatalı parametre",
  "80": "Gönderim sınırı aşıldı (dakikada 100)",
  "100": "Netgsm sistem hatası",
};

// Normal SMS yanıtı "00 <görev id>" biçimindedir; 00/01/02 başarılıdır
const SMS_SUCCESS = new Set(["00", "01", "02"]);
const SMS_ERRORS: Record<string, string> = {
  "20": "Mesaj metni veya uzunluğu hatalı",
  "30": "Geçersiz kullanıcı adı/şifre, API erişim izni yok veya IP kısıtlaması",
  "40": "Gönderici başlığı tanımlı değil",
  "50": "Abone hesabıyla İYS kontrollü gönderim yapılamıyor",
  "51": "Aboneliğe tanımlı İYS marka bilgisi yok",
  "70": "Eksik veya hatalı parametre",
  "80": "Gönderim sınırı aşıldı",
  "85": "Aynı numaraya 1 dakikada 20'den fazla gönderim",
};

class NetgsmSmsSender implements SmsSender {
  private readonly usercode: string;
  private readonly password: string;
  private readonly header: string;

  constructor(env: Env) {
    this.usercode = env.NETGSM_USERCODE ?? "";
    this.password = env.NETGSM_PASSWORD ?? "";
    this.header = env.NETGSM_HEADER ?? "";
    if (!this.usercode || !this.password || !this.header) {
      fail("ayar", "NETGSM_USERCODE, NETGSM_PASSWORD (secret) ve NETGSM_HEADER tanımlanmalı");
    }
  }

  async sendOtp(phone: string, message: string) {
    const xml =
      '<?xml version="1.0"?>' +
      "<mainbody>" +
      "<header>" +
      `<usercode>${escape(this.usercode)}</usercode>` +
      `<password>${escape(this.password)}</password>` +
      `<msgheader>${escape(this.header)}</msgheader>` +
      "</header>" +
      "<body>" +
      `<msg>${escape(message)}</msg>` +
      `<no>${escape(toNetgsmNumber(phone))}</no>` +
      "</body>" +
      "</mainbody>";
    const body = await post(OTP_URL, xml);
    const code = /<code>\s*(\d+)\s*<\/code>/.exec(body)?.[1];
    if (!code || code in OTP_ERRORS) {
      fail("OTP", code ? `${OTP_ERRORS[code]} (kod ${code})` : `Beklenmeyen yanıt: ${body}`);
    }
    console.log(`Netgsm OTP gönderildi -> ${toNetgsmNumber(phone)} (kod ${code})`);
  }

  async sendNotification(phone: string, message: string) {
    // filter=0: ticari olmayan bilgilendirme mesajı (İYS kontrolü uygulanmaz)
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      "<mainbody>" +
      "<header>" +
      "<company>Netgsm</company>" +
      `<usercode>${escape(this.usercode)}</usercode>` +
      `<password>${escape(this.password)}</password>` +
      "<type>1:n</type>" +
      `<msgheader>${escape(this.header)}</msgheader>` +
      "<filter>0</filter>" +
      "</header>" +
      "<body>" +
      `<msg>${escape(message)}</msg>` +
      `<no>${escape(toNetgsmNumber(phone))}</no>` +
      "</body>" +
      "</mainbody>";
    const body = (await post(SMS_URL, xml)).trim();
    const code = body.split(/\s+/)[0] ?? "";
    if (!SMS_SUCCESS.has(code)) {
      fail("SMS", `${SMS_ERRORS[code] ?? `Beklenmeyen yanıt: ${body}`} (kod ${code})`);
    }
    console.log(`Netgsm SMS gönderildi -> ${toNetgsmNumber(phone)} (yanıt ${body})`);
  }
}

// Netgsm numarayı başında 0 olmadan 10 hane bekler: 905554443322 -> 5554443322
const toNetgsmNumber = (phone: string) => (phone.startsWith("90") ? phone.slice(2) : phone);

async function post(url: string, xml: string): Promise<string> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=UTF-8" },
      body: xml,
      signal: AbortSignal.timeout(15_000),
    });
    return await response.text();
  } catch (e) {
    fail("bağlantı", `Netgsm'e bağlanılamadı: ${e}`);
  }
}

function fail(type: string, reason: string): never {
  console.error(`Netgsm ${type} gönderilemedi: ${reason}`);
  throw new SmsError(`Netgsm ${type} gönderilemedi: ${reason}`);
}

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// --- Mesaj metinleri ---
// Türkçe karakterli SMS'ler 70 karakterde bölünür ve her parça ayrı ücretlendirilir; Türkçe karaktersiz
// (GSM 7-bit) bir SMS ise 160 karaktere kadar tek parçadır.
const SINGLE_PART_LENGTH = 160;

// "Saç Kesimi" -> "Sac Kesimi". GSM temel alfabesinde tek karakter sayılmayanlar atılır.
export function smsAscii(text: string | null | undefined): string {
  if (!text) return "";
  const map: Record<string, string> = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U" };
  return text
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => map[ch])
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9 .,:;!?'"()/@&%+*#=_-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Zorunlu metnin sonuna ek parçaları sırayla, toplam 160 karakteri aşmadıkça ekler
export function smsFit(required: string, ...optional: (string | null)[]): string {
  let text = required.slice(0, SINGLE_PART_LENGTH);
  for (const part of optional) {
    if (part !== null && text.length + part.length <= SINGLE_PART_LENGTH) {
      text += part;
    }
  }
  return text;
}

export interface AppointmentSmsInfo {
  customerPhone: string;
  serviceName: string;
  employeeName: string;
  startTime: string;
}

// Birden fazla hizmette ad uzayabilir; mesajın tek parça kalması için kısaltılır
const MAX_SERVICE_TEXT = 60;
const serviceText = (name: string) => {
  const text = smsAscii(name);
  return text.length > MAX_SERVICE_TEXT ? text.slice(0, MAX_SERVICE_TEXT - 3).trimEnd() + "..." : text;
};

const businessNamePart = (env: Env) => (env.BUSINESS_NAME ? ". " + smsAscii(env.BUSINESS_NAME) : ".");

// Örnek: "Randevunuz onaylandi: 14.10.2026 15:30, Sac Kesimi - Emin Ak. Arif Tuzunalp Tel: 0507 593 18 66.
//         Iptal: sitemizdeki Randevularim bolumu"
export const appointmentCreatedSms = (env: Env, a: AppointmentSmsInfo) =>
  smsFit(
    `Randevunuz onaylandi: ${formatForSms(a.startTime)}, ${serviceText(a.serviceName)}`,
    " - " + smsAscii(a.employeeName),
    businessNamePart(env),
    env.BUSINESS_PHONE ? " Tel: " + smsAscii(env.BUSINESS_PHONE) : null,
    ". Iptal: sitemizdeki Randevularim bolumu",
  );

// Örnek: "Randevunuz iptal edildi: 14.10.2026 15:30, Sac Kesimi - Emin Ak. Arif Tuzunalp
//         Bilgi ve yeni randevu: 0507 593 18 66"
export const appointmentCancelledSms = (env: Env, a: AppointmentSmsInfo) =>
  smsFit(
    `Randevunuz iptal edildi: ${formatForSms(a.startTime)}, ${serviceText(a.serviceName)}`,
    " - " + smsAscii(a.employeeName),
    businessNamePart(env),
    env.BUSINESS_PHONE ? " Bilgi ve yeni randevu: " + smsAscii(env.BUSINESS_PHONE) : null,
  );

// Randevu kaydedildikten sonra arka planda gönderilir; SMS hatası randevuyu geri almaz, sadece loglanır
export async function sendNotificationQuietly(env: Env, phone: string, message: string, type: string) {
  try {
    await smsSender(env).sendNotification(toInternational(phone), message);
  } catch (e) {
    console.error(`${type} SMS'i gönderilemedi (${phone}): ${e instanceof SmsError ? e.detail : e}`);
  }
}
