// Yönetici paneli: giderler ve her ay otomatik eklenen sabit giderler (kira, aidat...)
import type { Env } from "./env";
import { BadRequest, BusinessError, NotFound } from "./errors";
import { findEmployee, parseRate, priceToCents } from "./booking";
import { nowLocal, parseDate, todayLocal } from "./time";

const MAX_DESCRIPTION = 120;

// Gider kategorileri (bu sırayla raporda gösterilir). Maaş gibi giderler bir çalışana bağlanabilir (hakediş).
export const CATEGORIES = {
  RENT: "Kira / Aidat",
  BILLS: "Faturalar",
  SUPPLIES: "Malzeme",
  PRODUCT: "Ürün alımı",
  SALARY: "Maaş / Personel",
  TAX: "Vergi / SGK",
  OTHER: "Diğer",
} as const;
export type Category = keyof typeof CATEGORIES;

export interface ExpenseRow {
  id: string;
  expense_date: string;
  description: string;
  amount_cents: number;
  recurring_id: string | null;
  category: Category;
  employee_id: string | null;
  created_at: string;
}

interface RecurringRow {
  id: string;
  description: string;
  amount_cents: number;
  category: Category;
  employee_id: string | null;
  day_of_month: number;
  withholding_rate: number | null; // kira stopajı yüzdesi; doluysa amount_cents brüt kiradır
  is_active: number;
  last_generated_month: string | null;
  created_at: string;
}

const toExpense = (e: ExpenseRow) => ({
  id: e.id,
  date: e.expense_date,
  description: e.description,
  amount: e.amount_cents / 100,
  category: e.category,
  employeeId: e.employee_id,
  recurring: e.recurring_id !== null,
});

const toRecurring = (r: RecurringRow) => ({
  id: r.id,
  description: r.description,
  amount: r.amount_cents / 100,
  category: r.category,
  employeeId: r.employee_id,
  dayOfMonth: r.day_of_month,
  withholdingRate: r.withholding_rate ?? 0,
  active: r.is_active === 1,
});

// Brüt kira -> ev sahibine ödenen net kira + vergi dairesine ödenen stopaj (toplamı brüte eşit)
export function splitWithholding(grossCents: number, rate: number) {
  const withholding = Math.round((grossCents * rate) / 100);
  return { net: grossCents - withholding, withholding };
}

function parseDescription(value: unknown): string {
  const description = typeof value === "string" ? value.trim() : "";
  if (!description) {
    throw new BusinessError("Gider açıklaması zorunludur.");
  }
  if (description.length > MAX_DESCRIPTION) {
    throw new BusinessError(`Açıklama en fazla ${MAX_DESCRIPTION} karakter olabilir.`);
  }
  return description;
}

function parseAmount(value: unknown): number {
  const cents = priceToCents(value);
  if (cents === null || cents === 0) {
    throw new BusinessError("Geçerli bir tutar girin.");
  }
  return cents;
}

function parseCategory(value: unknown): Category {
  if (value === null || value === undefined || value === "") return "OTHER";
  if (typeof value !== "string" || !Object.hasOwn(CATEGORIES, value)) throw new BadRequest();
  return value as Category;
}

// Maaş, avans gibi bir çalışana ait gider; bağlıysa hakediş raporunda o çalışanın altında görünür
async function parseEmployeeId(env: Env, value: unknown): Promise<string | null> {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new BadRequest();
  return (await findEmployee(env, value, "Çalışan bulunamadı.")).id;
}

function parseDayOfMonth(value: unknown): number {
  const day = typeof value === "string" ? Number(value) : value;
  if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31) {
    throw new BusinessError("Ayın günü 1 ile 31 arasında olmalıdır.");
  }
  return day;
}

// "2026-02" ayının 31'i -> "2026-02-28" (kısa aylarda ayın son günü)
function dateInMonth(month: string, day: number): string {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

// Sabit giderlerin bu ayki kaydını, günü geldiyse ekler. Her gün zamanlanmış görevle (index.ts "scheduled")
// ve gider/rapor ekranı açıldığında çalışır; bir ay için yalnızca bir kez ekler.
export async function generateRecurringExpenses(env: Env) {
  const today = todayLocal();
  const month = today.slice(0, 7);
  const { results } = await env.DB.prepare(
    "SELECT * FROM recurring_expenses WHERE is_active = 1 AND (last_generated_month IS NULL OR last_generated_month < ?)",
  )
    .bind(month)
    .all<RecurringRow>();
  for (const r of results) {
    const date = dateInMonth(month, r.day_of_month);
    if (date > today) continue;
    // Önce ay işaretlenir (koşullu): aynı anda çalışan iki görevden yalnızca biri kaydı ekler
    const claimed = await env.DB.prepare(
      "UPDATE recurring_expenses SET last_generated_month = ? WHERE id = ? AND (last_generated_month IS NULL OR last_generated_month < ?)",
    )
      .bind(month, r.id, month)
      .run();
    if (claimed.meta.changes === 0) continue;
    const rate = r.withholding_rate ?? 0;
    const { net, withholding } = splitWithholding(r.amount_cents, rate);
    await insertExpense(env, {
      date,
      description: rate > 0 ? `${r.description} (net)` : r.description,
      amountCents: net,
      category: r.category,
      employeeId: r.employee_id,
      recurringId: r.id,
    });
    if (withholding > 0) {
      await insertExpense(env, {
        date,
        description: `Stopaj (%${String(rate).replace(".", ",")}): ${r.description}`,
        amountCents: withholding,
        category: "TAX",
        employeeId: null,
        recurringId: r.id,
      });
    }
  }
}

interface NewExpense {
  date: string;
  description: string;
  amountCents: number;
  category: Category;
  employeeId: string | null;
  recurringId?: string;
}

// Diğer modüller de kullanır (örn. stok alımında "Ürün alımı" gideri)
export async function insertExpense(env: Env, e: NewExpense): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO expenses (id, expense_date, description, amount_cents, category, employee_id, recurring_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, e.date, e.description, e.amountCents, e.category, e.employeeId, e.recurringId ?? null, nowLocal())
    .run();
  return id;
}

// --- GİDERLER ---

export async function listExpenses(env: Env, from: string, to: string) {
  await generateRecurringExpenses(env);
  const { results } = await env.DB.prepare(
    "SELECT * FROM expenses WHERE expense_date BETWEEN ? AND ? ORDER BY expense_date DESC, created_at DESC",
  )
    .bind(from, to)
    .all<ExpenseRow>();
  return results.map(toExpense);
}

// Rapor ve dışa aktarma için: tarih aralığındaki giderler (kategori ve çalışan bilgisiyle)
export async function expenseRows(env: Env, from: string, to: string): Promise<ExpenseRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM expenses WHERE expense_date BETWEEN ? AND ? ORDER BY expense_date, created_at",
  )
    .bind(from, to)
    .all<ExpenseRow>();
  return results;
}

interface ExpenseRequest {
  date?: unknown;
  description?: unknown;
  amount?: unknown;
  category?: unknown;
  employeeId?: unknown;
}

export async function saveExpense(env: Env, id: string | null, request: ExpenseRequest) {
  const date = parseDate(request.date);
  const description = parseDescription(request.description);
  const amount = parseAmount(request.amount);
  const category = parseCategory(request.category);
  const employeeId = await parseEmployeeId(env, request.employeeId);
  if (id) {
    const result = await env.DB.prepare(
      "UPDATE expenses SET expense_date = ?, description = ?, amount_cents = ?, category = ?, employee_id = ? WHERE id = ?",
    )
      .bind(date, description, amount, category, employeeId, id)
      .run();
    if (result.meta.changes === 0) throw new NotFound("Gider bulunamadı.");
  } else {
    id = await insertExpense(env, { date, description, amountCents: amount, category, employeeId });
  }
  return toExpense((await env.DB.prepare("SELECT * FROM expenses WHERE id = ?").bind(id).first<ExpenseRow>())!);
}

export async function deleteExpense(env: Env, id: string) {
  const result = await env.DB.prepare("DELETE FROM expenses WHERE id = ?").bind(id).run();
  if (result.meta.changes === 0) throw new NotFound("Gider bulunamadı.");
}

// --- SABİT AYLIK GİDERLER ---

export async function listRecurring(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM recurring_expenses ORDER BY is_active DESC, day_of_month, description",
  ).all<RecurringRow>();
  return results.map(toRecurring);
}

interface RecurringRequest {
  description?: unknown;
  amount?: unknown;
  category?: unknown;
  employeeId?: unknown;
  dayOfMonth?: unknown;
  withholdingRate?: unknown; // kira stopajı yüzdesi (boş = yok)
}

// Tutar değişikliği sonraki aylardan itibaren geçerlidir; eklenmiş kayıtlar ayrıca düzenlenebilir.
// Yeni eklenen sabit giderin günü bu ay geçtiyse bu ayın kaydı da hemen eklenir.
export async function saveRecurring(env: Env, id: string | null, request: RecurringRequest) {
  const description = parseDescription(request.description);
  const amount = parseAmount(request.amount);
  const day = parseDayOfMonth(request.dayOfMonth);
  const category = parseCategory(request.category);
  const employeeId = await parseEmployeeId(env, request.employeeId);
  const withholding = parseRate(request.withholdingRate, "Stopaj oranı") || null;
  if (id) {
    const result = await env.DB.prepare(
      `UPDATE recurring_expenses SET description = ?, amount_cents = ?, category = ?, employee_id = ?, day_of_month = ?,
       withholding_rate = ? WHERE id = ?`,
    )
      .bind(description, amount, category, employeeId, day, withholding, id)
      .run();
    if (result.meta.changes === 0) throw new NotFound("Sabit gider bulunamadı.");
  } else {
    id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO recurring_expenses (id, description, amount_cents, category, employee_id, day_of_month, withholding_rate,
                                       is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
      .bind(id, description, amount, category, employeeId, day, withholding, nowLocal())
      .run();
    await generateRecurringExpenses(env);
  }
  return toRecurring((await env.DB.prepare("SELECT * FROM recurring_expenses WHERE id = ?").bind(id).first<RecurringRow>())!);
}

export async function setRecurringActive(env: Env, id: string, active: boolean) {
  const result = await env.DB.prepare("UPDATE recurring_expenses SET is_active = ? WHERE id = ?").bind(active ? 1 : 0, id).run();
  if (result.meta.changes === 0) throw new NotFound("Sabit gider bulunamadı.");
  if (active) await generateRecurringExpenses(env);
  return toRecurring((await env.DB.prepare("SELECT * FROM recurring_expenses WHERE id = ?").bind(id).first<RecurringRow>())!);
}

// Sabit gider silinir; daha önce eklenmiş aylık kayıtlar giderlerde kalır
export async function deleteRecurring(env: Env, id: string) {
  const result = await env.DB.prepare("DELETE FROM recurring_expenses WHERE id = ?").bind(id).run();
  if (result.meta.changes === 0) throw new NotFound("Sabit gider bulunamadı.");
}

