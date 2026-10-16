// Telefon numarasının sahibine ait olduğunu SMS koduyla doğrular ve kısa süreli oturum açar
import type { Env } from "./env";
import { BusinessError, Unauthorized } from "./errors";
import { normalizePhone, toInternational } from "./phone";
import { randomCode, randomToken, sha256Hex, timingSafeEqualStrings } from "./crypto";
import { smsSender } from "./sms";
import { nowLocal, plusMinutes } from "./time";

const CODE_VALID_MINUTES = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_CODES_PER_HOUR = 5;
// Aynı yerden (IP) farklı numaralara çok sayıda kod istenip SMS bakiyesinin harcanmasını önler
const MAX_CODES_PER_IP_PER_HOUR = 10;
const MAX_ATTEMPTS_PER_CODE = 5;
const SESSION_VALID_MINUTES = 30;

const TOO_MANY_CODES = "Çok fazla kod istendi. Lütfen bir saat sonra tekrar deneyin.";

interface VerificationRow {
  id: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  used: number;
  created_at: string;
}

const latestVerification = (env: Env, phone: string) =>
  env.DB.prepare("SELECT * FROM phone_verifications WHERE phone = ? ORDER BY created_at DESC LIMIT 1")
    .bind(phone)
    .first<VerificationRow>();

const secondsBetween = (from: string, to: string) =>
  Math.floor((Date.parse(to + "Z") - Date.parse(from + "Z")) / 1000);

export async function requestCode(env: Env, rawPhone: unknown, ip: string | null) {
  const phone = normalizePhone(rawPhone);
  const now = nowLocal();
  const hourAgo = plusMinutes(now, -60);
  // Süresi 1 saatten eski kodlar saatlik limit için de gerekmez, silinebilir
  await env.DB.prepare("DELETE FROM phone_verifications WHERE created_at < ?").bind(hourAgo).run();

  const last = await latestVerification(env, phone);
  if (last) {
    const waited = secondsBetween(last.created_at, now);
    if (waited < RESEND_COOLDOWN_SECONDS) {
      throw new BusinessError(`Yeni kod istemek için ${RESEND_COOLDOWN_SECONDS - waited} saniye bekleyin.`);
    }
  }
  const [byPhone, byIp] = await env.DB.batch<{ n: number }>([
    env.DB.prepare("SELECT COUNT(*) AS n FROM phone_verifications WHERE phone = ? AND created_at > ?").bind(phone, hourAgo),
    env.DB.prepare("SELECT COUNT(*) AS n FROM phone_verifications WHERE ip = ? AND created_at > ?").bind(ip, hourAgo),
  ]);
  if (byPhone.results[0].n >= MAX_CODES_PER_HOUR || (ip && byIp.results[0].n >= MAX_CODES_PER_IP_PER_HOUR)) {
    throw new BusinessError(TOO_MANY_CODES);
  }

  const code = randomCode();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO phone_verifications (id, phone, ip, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, phone, ip, await sha256Hex(code), plusMinutes(now, CODE_VALID_MINUTES), now)
    .run();

  try {
    // Netgsm OTP mesajlarında Türkçe karakter kullanılamaz
    await smsSender(env).sendOtp(
      toInternational(phone),
      `Randevu dogrulama kodunuz: ${code} (${CODE_VALID_MINUTES} dk gecerlidir)`,
    );
  } catch (e) {
    // Kod gitmediyse kayıt da kalmasın (bekleme süresi ve limitlere sayılmasın)
    await env.DB.prepare("DELETE FROM phone_verifications WHERE id = ?").bind(id).run();
    throw e;
  }
}

export async function verifyCode(env: Env, rawPhone: unknown, code: unknown) {
  const phone = normalizePhone(rawPhone);
  const now = nowLocal();

  const verification = await latestVerification(env, phone);
  if (!verification || verification.used === 1 || verification.expires_at <= now) {
    throw new BusinessError("Geçerli bir kod bulunamadı. Lütfen yeni kod isteyin.");
  }

  // Deneme sayacı koşullu artırılır: aynı anda gelen isteklerle sınır aşılamaz
  const counted = await env.DB.prepare(
    "UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = ? AND attempts < ?",
  )
    .bind(verification.id, MAX_ATTEMPTS_PER_CODE)
    .run();
  if (counted.meta.changes === 0) {
    throw new BusinessError("Çok fazla hatalı deneme. Lütfen yeni kod isteyin.");
  }
  const attempts = verification.attempts + 1;

  const correct = typeof code === "string" && (await timingSafeEqualStrings(await sha256Hex(code.trim()), verification.code_hash));
  if (!correct) {
    const left = MAX_ATTEMPTS_PER_CODE - attempts;
    throw new BusinessError(left > 0 ? `Kod hatalı. Kalan deneme hakkı: ${left}` : "Çok fazla hatalı deneme. Lütfen yeni kod isteyin.");
  }
  const marked = await env.DB.prepare("UPDATE phone_verifications SET used = 1 WHERE id = ? AND used = 0")
    .bind(verification.id)
    .run();
  if (marked.meta.changes === 0) {
    throw new BusinessError("Geçerli bir kod bulunamadı. Lütfen yeni kod isteyin.");
  }

  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM customer_sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("INSERT INTO customer_sessions (id, token_hash, phone, expires_at) VALUES (?, ?, ?, ?)").bind(
      crypto.randomUUID(),
      await sha256Hex(token),
      phone,
      plusMinutes(now, SESSION_VALID_MINUTES),
    ),
  ]);
  return { token, expiresInMinutes: SESSION_VALID_MINUTES };
}

// Oturum anahtarına ait telefon numarasını döner; geçersiz veya süresi dolmuşsa 401
export async function getVerifiedPhone(env: Env, token: string | undefined): Promise<string> {
  if (!token || !token.trim()) {
    throw new Unauthorized("Lütfen telefon numaranızı doğrulayın.");
  }
  const session = await env.DB.prepare("SELECT phone FROM customer_sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(await sha256Hex(token), nowLocal())
    .first<{ phone: string }>();
  if (!session) {
    throw new Unauthorized("Oturumunuzun süresi doldu. Lütfen tekrar doğrulayın.");
  }
  return session.phone;
}

// --- Yönetici şifresi ---
const MIN_ADMIN_PASSWORD_LENGTH = 12;

export async function verifyAdminPassword(env: Env, password: unknown) {
  const expected = env.ADMIN_PASSWORD ?? "";
  // Zayıf veya eksik şifreyle panelin açılmasına izin verme
  if (expected.length < MIN_ADMIN_PASSWORD_LENGTH || expected === "emin123") {
    throw new Error(`ADMIN_PASSWORD tanımlı değil veya ${MIN_ADMIN_PASSWORD_LENGTH} karakterden kısa ("npx wrangler secret put ADMIN_PASSWORD").`);
  }
  if (typeof password !== "string" || !(await timingSafeEqualStrings(password, expected))) {
    throw new Unauthorized("Hatalı yönetici şifresi.");
  }
}
