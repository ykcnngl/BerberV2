// Yönetici paneli: kasa (randevusuz satış), ürünler ve stok, ödeme yöntemleri, genel ayarlar
import type { Env } from "./env";
import { BadRequest, BusinessError, NotFound } from "./errors";
import {
  centsToPrice,
  findAppointment,
  parseAppointmentPrice,
  findEmployee,
  findServices,
  parseRate,
  priceToCents,
  sameName,
  toAdminAppointmentResponse,
  trCollator,
} from "./booking";
import { insertExpense } from "./expenses";
import { endOfDay, nowLocal, parseDateTime, startOfDay, todayLocal } from "./time";

const MAX_NAME = 80;
const MAX_NOTE = 120;
const MAX_ITEMS = 20;
const MAX_QUANTITY = 999;

// --- ÖDEME YÖNTEMLERİ ---

export const PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function parsePaymentMethod(value: unknown): PaymentMethod {
  if (!PAYMENT_METHODS.includes(value as PaymentMethod)) {
    throw new BusinessError("Ödeme yöntemi seçin (nakit, kart veya IBAN).");
  }
  return value as PaymentMethod;
}

interface PaymentRequest {
  method?: unknown; // boşsa ödeme kaydı silinir
  price?: unknown; // gönderilirse ödeme anındaki indirim: tahsil edilen tutar (boş = liste fiyatı)
  note?: unknown;
}

// Randevunun ödemesi (gün sonu kasa ve POS komisyonu için). Ödeme anında indirim yapıldıysa tutar da
// aynı istekte düzenlenir; önce her şey doğrulanır, sonra tek sorguda kaydedilir.
export async function setAppointmentPayment(env: Env, appointmentId: string, request: PaymentRequest) {
  const appointment = await findAppointment(env, appointmentId);
  if (appointment.status === "CANCELLED" || appointment.status === "NO_SHOW") {
    throw new BusinessError("İptal edilen veya gelinmeyen randevuya ödeme girilemez.");
  }
  const method = request.method === null || request.method === undefined || request.method === ""
    ? null
    : parsePaymentMethod(request.method);
  const { price_cents, price_note } = "price" in request
    ? parseAppointmentPrice(appointment, request.price, request.note)
    : appointment;
  await env.DB.prepare("UPDATE appointments SET payment_method = ?, price_cents = ?, price_note = ? WHERE id = ?")
    .bind(method, price_cents, price_note, appointmentId)
    .run();
  return toAdminAppointmentResponse({ ...appointment, payment_method: method, price_cents, price_note });
}

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function parseNote(value: unknown): string | null {
  const note = trim(value);
  if (note.length > MAX_NOTE) throw new BusinessError(`Not en fazla ${MAX_NOTE} karakter olabilir.`);
  return note || null;
}

// --- AYARLAR ---

// Yüzde ayarları: istekteki ad -> settings anahtarı ve hata mesajındaki adı.
// vat_rate: KDV mükellefiyse alınan ücretlerin içindeki KDV oranı (0 = KDV yok, örn. basit usul)
const RATE_SETTINGS = {
  cardCommissionRate: { key: "card_commission_rate", label: "POS komisyon oranı" },
  vatRate: { key: "vat_rate", label: "KDV oranı" },
} as const;
type RateSetting = keyof typeof RATE_SETTINGS;

export async function getSettings(env: Env): Promise<Record<RateSetting, number>> {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const read = (name: RateSetting) => Number(results.find((r) => r.key === RATE_SETTINGS[name].key)?.value ?? 0);
  return { cardCommissionRate: read("cardCommissionRate"), vatRate: read("vatRate") };
}

// Yalnızca istekte gönderilen ayarlar değişir
export async function saveSettings(env: Env, request: Partial<Record<RateSetting, unknown>>) {
  const updates = (Object.keys(RATE_SETTINGS) as RateSetting[])
    .filter((name) => name in request)
    .map((name) => ({ key: RATE_SETTINGS[name].key, value: parseRate(request[name], RATE_SETTINGS[name].label) }));
  if (updates.length) {
    await env.DB.batch(
      updates.map((u) =>
        env.DB.prepare(
          "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        ).bind(u.key, String(u.value)),
      ),
    );
  }
  return getSettings(env);
}

// --- ÜRÜNLER ---

interface ProductRow {
  id: string;
  name: string;
  price_cents: number;
  cost_cents: number | null;
  stock: number;
  low_stock: number | null;
  is_active: number;
  created_at: string;
}

const toProduct = (p: ProductRow) => ({
  id: p.id,
  name: p.name,
  price: p.price_cents / 100,
  cost: centsToPrice(p.cost_cents),
  stock: p.stock,
  lowStock: p.low_stock,
  active: p.is_active === 1,
});

async function findProduct(env: Env, id: string): Promise<ProductRow> {
  const product = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<ProductRow>();
  if (!product) throw new NotFound("Ürün bulunamadı.");
  return product;
}

export async function listProducts(env: Env) {
  const { results } = await env.DB.prepare("SELECT * FROM products").all<ProductRow>();
  return results
    .sort((a, b) => b.is_active - a.is_active || trCollator.compare(a.name, b.name))
    .map(toProduct);
}

function parseCount(value: unknown, message: string, { min = 0, allowEmpty = false } = {}): number | null {
  if (allowEmpty && (value === null || value === undefined || value === "")) return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > 100_000) throw new BusinessError(message);
  return n;
}

interface ProductRequest {
  name?: unknown;
  price?: unknown;
  cost?: unknown;
  lowStock?: unknown;
}

// Stok buradan değişmez: yeni ürün 0 adetle başlar, stok "Stok ekle" ile artar, satışla azalır
export async function saveProduct(env: Env, id: string | null, request: ProductRequest) {
  if (id) await findProduct(env, id);
  const name = trim(request.name);
  if (!name) throw new BusinessError("Ürün adı zorunludur.");
  if (name.length > MAX_NAME) throw new BusinessError(`Ürün adı en fazla ${MAX_NAME} karakter olabilir.`);
  const price = priceToCents(request.price);
  if (price === null) throw new BusinessError("Geçerli bir satış fiyatı girin.");
  const cost = request.cost === null || request.cost === undefined || request.cost === "" ? null : priceToCents(request.cost);
  if (cost === null && request.cost != null && request.cost !== "") throw new BusinessError("Geçerli bir alış fiyatı girin.");
  const lowStock = parseCount(request.lowStock, "Uyarı adedi 0 veya daha büyük bir tam sayı olmalıdır.", { allowEmpty: true });

  const { results: all } = await env.DB.prepare("SELECT id, name FROM products").all<{ id: string; name: string }>();
  if (all.some((p) => p.id !== id && sameName(p.name, name))) {
    throw new BusinessError("Bu isimde bir ürün zaten var.");
  }
  const productId = id ?? crypto.randomUUID();
  if (id) {
    await env.DB.prepare("UPDATE products SET name = ?, price_cents = ?, cost_cents = ?, low_stock = ? WHERE id = ?")
      .bind(name, price, cost, lowStock, id)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO products (id, name, price_cents, cost_cents, stock, low_stock, is_active, created_at) VALUES (?, ?, ?, ?, 0, ?, 1, ?)",
    )
      .bind(productId, name, price, cost, lowStock, nowLocal())
      .run();
  }
  return toProduct(await findProduct(env, productId));
}

export async function setProductActive(env: Env, id: string, active: boolean) {
  await findProduct(env, id);
  await env.DB.prepare("UPDATE products SET is_active = ? WHERE id = ?").bind(active ? 1 : 0, id).run();
  return toProduct(await findProduct(env, id));
}

interface StockRequest {
  quantity?: unknown;
  totalCost?: unknown; // doluysa "Ürün alımı" gideri olarak eklenir
}

// Stok girişi (alım) veya düzeltme (sayım farkı: eksi adet). Alım tutarı girilirse gider olarak kaydedilir.
export async function addStock(env: Env, id: string, request: StockRequest) {
  const product = await findProduct(env, id);
  const quantity = typeof request.quantity === "string" ? Number(request.quantity) : request.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity === 0 || Math.abs(quantity) > 100_000) {
    throw new BusinessError("Adet sıfırdan farklı bir tam sayı olmalıdır.");
  }
  if (product.stock + quantity < 0) {
    throw new BusinessError(`Stokta ${product.stock} adet var; daha fazlası düşülemez.`);
  }
  const hasCost = request.totalCost !== null && request.totalCost !== undefined && request.totalCost !== "";
  const costCents = hasCost ? priceToCents(request.totalCost) : null;
  if (hasCost && !costCents) throw new BusinessError("Geçerli bir alım tutarı girin.");
  if (costCents && quantity < 0) throw new BusinessError("Stok düşerken alım tutarı girilmez.");

  await env.DB.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").bind(quantity, id).run();
  if (costCents) {
    await insertExpense(env, {
      date: todayLocal(),
      description: `Ürün alımı: ${product.name} (${quantity} adet)`,
      amountCents: costCents,
      category: "PRODUCT",
      employeeId: null,
    });
  }
  return toProduct(await findProduct(env, id));
}

// --- KASA: RANDEVUSUZ SATIŞ ---

interface SaleRow {
  id: string;
  sale_time: string;
  employee_id: string | null;
  employee_name: string | null;
  payment_method: PaymentMethod;
  total_cents: number;
  note: string | null;
}

export interface SaleItemRow {
  sale_id: string;
  kind: "SERVICE" | "PRODUCT";
  item_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

export interface Sale extends SaleRow {
  items: SaleItemRow[];
}

// Tarih aralığındaki satışlar (satırlarıyla)
export async function querySales(env: Env, fromTime: string, toTime: string): Promise<Sale[]> {
  const { results } = await env.DB.prepare(
    `SELECT s.*, e.first_name || ' ' || e.last_name AS employee_name
     FROM sales s LEFT JOIN employees e ON e.id = s.employee_id
     WHERE s.sale_time BETWEEN ? AND ? ORDER BY s.sale_time DESC`,
  )
    .bind(fromTime, toTime)
    .all<SaleRow>();
  if (!results.length) return [];
  const { results: items } = await env.DB.prepare(
    "SELECT * FROM sale_items WHERE sale_id IN (SELECT value FROM json_each(?)) ORDER BY position",
  )
    .bind(JSON.stringify(results.map((s) => s.id)))
    .all<SaleItemRow>();
  return results.map((s) => ({ ...s, items: items.filter((i) => i.sale_id === s.id) }));
}

const toSale = (s: Sale) => ({
  id: s.id,
  time: s.sale_time,
  employeeId: s.employee_id,
  employeeName: s.employee_name,
  paymentMethod: s.payment_method,
  total: s.total_cents / 100,
  note: s.note,
  items: s.items.map((i) => ({
    kind: i.kind,
    id: i.item_id,
    name: i.name,
    quantity: i.quantity,
    unitPrice: i.unit_price_cents / 100,
  })),
});

export async function listSales(env: Env, date: string) {
  return (await querySales(env, startOfDay(date), endOfDay(date))).map(toSale);
}

interface SaleItemRequest {
  kind?: unknown;
  id?: unknown;
  quantity?: unknown;
  price?: unknown; // birim fiyat; boşsa liste fiyatı (indirim için değiştirilebilir)
}

interface SaleRequest {
  employeeId?: unknown;
  time?: unknown; // boşsa şimdi
  paymentMethod?: unknown;
  note?: unknown;
  items?: unknown;
}

export async function createSale(env: Env, request: SaleRequest) {
  const paymentMethod = parsePaymentMethod(request.paymentMethod);
  const note = parseNote(request.note);
  const time = request.time ? parseDateTime(request.time) : nowLocal();
  if (time > nowLocal()) throw new BusinessError("İleri bir saate satış girilemez.");
  if (!Array.isArray(request.items) || request.items.length === 0) {
    throw new BusinessError("Satışa en az bir hizmet veya ürün ekleyin.");
  }
  if (request.items.length > MAX_ITEMS) throw new BusinessError(`Tek satışta en fazla ${MAX_ITEMS} kalem olabilir.`);
  const items = request.items as SaleItemRequest[];
  if (items.some((i) => !i || (i.kind !== "SERVICE" && i.kind !== "PRODUCT") || typeof i.id !== "string")) {
    throw new BadRequest();
  }

  const serviceIds = [...new Set(items.filter((i) => i.kind === "SERVICE").map((i) => i.id as string))];
  const productIds = [...new Set(items.filter((i) => i.kind === "PRODUCT").map((i) => i.id as string))];
  const services = serviceIds.length ? await findServices(env, serviceIds) : [];
  const { results: products } = productIds.length
    ? await env.DB.prepare("SELECT * FROM products WHERE id IN (SELECT value FROM json_each(?))")
        .bind(JSON.stringify(productIds))
        .all<ProductRow>()
    : { results: [] as ProductRow[] };
  if (products.length !== productIds.length) throw new NotFound("Seçilen ürünlerden biri bulunamadı.");

  // Hizmet satışında işlemi yapan çalışan zorunlu (ciro ve prim ona yazılır)
  let employeeId: string | null = null;
  if (request.employeeId) {
    if (typeof request.employeeId !== "string") throw new BadRequest();
    employeeId = (await findEmployee(env, request.employeeId)).id;
  } else if (services.length) {
    throw new BusinessError("Hizmeti yapan çalışanı seçin.");
  }

  const lines = items.map((item, position) => {
    const quantityError = `Adet 1 ile ${MAX_QUANTITY} arasında olmalıdır.`;
    const quantity = parseCount(item.quantity ?? 1, quantityError, { min: 1 })!;
    if (quantity > MAX_QUANTITY) throw new BusinessError(quantityError);
    const source: { name: string; price_cents: number | null } =
      item.kind === "SERVICE" ? services.find((s) => s.id === item.id)! : products.find((p) => p.id === item.id)!;
    const hasPrice = item.price !== null && item.price !== undefined && item.price !== "";
    const unitPrice = hasPrice ? priceToCents(item.price) : source.price_cents;
    if (unitPrice === null) {
      throw new BusinessError(hasPrice ? "Geçerli bir tutar girin." : `"${source.name}" için fiyat girin.`);
    }
    return { position, kind: item.kind as "SERVICE" | "PRODUCT", id: item.id as string, name: source.name, quantity, unitPrice };
  });

  // Stok kontrolü (aynı ürün birden fazla satırda olabilir)
  for (const p of products) {
    const wanted = lines.filter((l) => l.kind === "PRODUCT" && l.id === p.id).reduce((sum, l) => sum + l.quantity, 0);
    if (wanted > p.stock) {
      throw new BusinessError(`"${p.name}" için stokta ${p.stock} adet var.`);
    }
  }

  const saleId = crypto.randomUUID();
  const total = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO sales (id, sale_time, employee_id, payment_method, total_cents, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(saleId, time, employeeId, paymentMethod, total, note, nowLocal()),
    ...lines.map((l) =>
      env.DB.prepare(
        "INSERT INTO sale_items (sale_id, position, kind, item_id, name, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(saleId, l.position, l.kind, l.id, l.name, l.quantity, l.unitPrice),
    ),
    ...lines
      .filter((l) => l.kind === "PRODUCT")
      .map((l) => env.DB.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").bind(l.quantity, l.id)),
  ]);
  const sale = (await querySales(env, time, time)).find((s) => s.id === saleId)!;
  return toSale(sale);
}

// Yanlış girilen satış silinir; satılan ürünler stoğa geri eklenir
export async function deleteSale(env: Env, id: string) {
  const sale = await env.DB.prepare("SELECT id FROM sales WHERE id = ?").bind(id).first();
  if (!sale) throw new NotFound("Satış bulunamadı.");
  const { results: items } = await env.DB.prepare("SELECT * FROM sale_items WHERE sale_id = ? AND kind = 'PRODUCT'")
    .bind(id)
    .all<SaleItemRow>();
  await env.DB.batch([
    ...items.map((i) => env.DB.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").bind(i.quantity, i.item_id)),
    env.DB.prepare("DELETE FROM sale_items WHERE sale_id = ?").bind(id),
    env.DB.prepare("DELETE FROM sales WHERE id = ?").bind(id),
  ]);
}
