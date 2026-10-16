const encoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Sabit sürede karşılaştırma: iki metnin özetleri karşılaştırılır (uzunluk farkı da sızmaz)
export async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

// 000000-999999 arası, eşit olasılıklı 6 haneli kod
export function randomCode(): string {
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

// 32 baytlık rastgele oturum anahtarı (base64url)
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
