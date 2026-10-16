import { afterEach, describe, expect, it, vi } from "vitest";
import { dayOfWeek, daysBetween, formatForSms, nowLocal, parseDateTime, parseTime, plusDays, plusMinutes } from "../src/time";
import { normalizePhone, toInternational } from "../src/phone";
import { appointmentCreatedSms, smsAscii, smsFit } from "../src/sms";
import { randomCode } from "../src/crypto";
import { priceToCents, sameName } from "../src/booking";

describe("time", () => {
  afterEach(() => vi.useRealTimers());

  it("Türkiye saatini UTC+3 olarak verir", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T22:30:00Z"));
    expect(nowLocal()).toBe("2026-10-15T01:30:00");
  });

  it("dakika ve gün ekler, ay/yıl geçişlerini doğru yapar", () => {
    expect(plusMinutes("2026-10-14T19:30:00", 70)).toBe("2026-10-14T20:40:00");
    expect(plusMinutes("2026-12-31T23:50:00", 20)).toBe("2027-01-01T00:10:00");
    expect(plusDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
  });

  it("haftanın gününü Java DayOfWeek adlarıyla verir", () => {
    expect(dayOfWeek("2026-10-12")).toBe("MONDAY");
    expect(dayOfWeek("2026-10-18")).toBe("SUNDAY");
  });

  it("geçersiz tarih ve saatleri reddeder", () => {
    expect(parseDateTime("2026-10-14T09:00")).toBe("2026-10-14T09:00:00");
    expect(parseTime("13:00:00")).toBe("13:00");
    expect(() => parseDateTime("2026-02-30T09:00")).toThrow();
    expect(() => parseTime("24:00")).toThrow();
    expect(() => parseDateTime("2026-10-14")).toThrow();
  });

  it("SMS tarih biçimi", () => {
    expect(formatForSms("2026-10-14T15:30:00")).toBe("14.10.2026 15:30");
  });
});

describe("phone", () => {
  it("farklı yazımları standart biçime çevirir", () => {
    for (const p of ["05554443322", "+90 555 444 33 22", "5554443322", "0555 444 3322"]) {
      expect(normalizePhone(p)).toBe("0555 444 3322");
    }
    expect(toInternational("0555 444 3322")).toBe("905554443322");
  });

  it("cep telefonu olmayan numaraları reddeder", () => {
    expect(() => normalizePhone("0232 444 3322")).toThrow("Geçerli bir cep telefonu");
    expect(() => normalizePhone(undefined)).toThrow("zorunludur");
  });
});

describe("sms", () => {
  it("Türkçe karakterleri ve GSM dışı işaretleri temizler", () => {
    expect(smsAscii("Manikür & Pedikür")).toBe("Manikur & Pedikur");
    expect(smsAscii("Ölçülü Kaş Alımı ✂️")).toBe("Olculu Kas Alimi");
    expect(smsAscii("İĞŞÇÖÜ ığşçöü")).toBe("IGSCOU igscou");
  });

  it("160 karakteri aşan ek parçaları atlar", () => {
    const required = "x".repeat(150);
    expect(smsFit(required, "1234567890", "abc")).toBe(required + "1234567890");
    expect(smsFit("y".repeat(200))).toHaveLength(160);
  });

  it("onay mesajı tek parça ve Türkçe karaktersiz", () => {
    const msg = appointmentCreatedSms(
      { BUSINESS_NAME: "Arif Tüzünalp", BUSINESS_PHONE: "0507 593 18 66" } as never,
      { customerPhone: "0555 444 3322", serviceName: "Saç Kesimi", employeeName: "Emin Ak", startTime: "2026-10-14T15:30:00" },
    );
    expect(msg).toBe(
      "Randevunuz onaylandi: 14.10.2026 15:30, Sac Kesimi - Emin Ak. Arif Tuzunalp Tel: 0507 593 18 66. Iptal: sitemizdeki Randevularim bolumu",
    );
    expect(msg.length).toBeLessThanOrEqual(160);
  });
});

describe("crypto", () => {
  it("6 haneli kod üretir", () => {
    for (let i = 0; i < 100; i++) expect(randomCode()).toMatch(/^\d{6}$/);
  });
});

describe("isim ve fiyat", () => {
  it("Türkçe büyük/küçük harf farkını yok sayar", () => {
    expect(sameName("VIP Bakım", "vip bakım")).toBe(true);
    expect(sameName("İNCE KESİM", "ince kesim")).toBe(true);
    expect(sameName("Saç Kesimi", "Sakal Tasarımı")).toBe(false);
  });

  it("fiyatı kuruşa çevirir", () => {
    expect(priceToCents("800,50")).toBe(80050);
    expect(priceToCents(450.5)).toBe(45050);
    expect(priceToCents("0")).toBe(0);
    expect(priceToCents(-1)).toBeNull();
    expect(priceToCents("abc")).toBeNull();
    expect(priceToCents("")).toBeNull();
  });
});
