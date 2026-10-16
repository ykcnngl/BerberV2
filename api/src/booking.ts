import type { Env } from "./env";
import { BadRequest, BusinessError, NotFound, Unauthorized } from "./errors";
import { normalizePhone } from "./phone";
import { appointmentCancelledSms, appointmentCreatedSms, sendNotificationQuietly } from "./sms";
import {
  type DayOfWeek,
  dayOfWeek,
  endOfDay,
  nowLocal,
  parseDateTime,
  plusMinutes,
  sortDays,
  startOfDay,
  todayLocal,
} from "./time";

// Arka planda iş (SMS) başlatmak için c.executionCtx
type WaitUntil = { waitUntil(promise: Promise<unknown>): void };

const SHOP_OPEN_TIME = "09:00";
const SHOP_CLOSE_TIME = "20:00";
const SLOT_STEP_MINUTES = 30;
const CUSTOMER_HISTORY_DAYS = 7;
const MAX_SERVICES_PER_APPOINTMENT = 6;

// Saati dolu tutan randevular: iptal edilen ve "gelmedi" işaretlenen randevuların saati yeniden alınabilir
export const OCCUPIES_SLOT = "status NOT IN ('CANCELLED', 'NO_SHOW')";

// --- Ortak kayıt tipleri ve sorgular ---

export interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: number;
  weekly_off_days: string;
  commission_rate: number | null;
}

export interface ServiceRow {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  price_cents: number | null;
  is_active: number;
}

export interface PackageRow {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  is_active: number;
  created_at: string;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  active: boolean;
  serviceIds: string[];
  weeklyOffDays: DayOfWeek[];
  commissionRate: number; // hizmet cirosundan prim yüzdesi (0 = prim yok)
}

export async function loadEmployees(env: Env, id?: string): Promise<Employee[]> {
  const where = id ? " WHERE id = ?" : "";
  const [employees, links] = await env.DB.batch<any>([
    env.DB.prepare(`SELECT * FROM employees${where} ORDER BY first_name, last_name`).bind(...(id ? [id] : [])),
    env.DB.prepare(`SELECT employee_id, service_id FROM employee_services${id ? " WHERE employee_id = ?" : ""}`).bind(
      ...(id ? [id] : []),
    ),
  ]);
  return (employees.results as EmployeeRow[]).map((e) => ({
    id: e.id,
    firstName: e.first_name,
    lastName: e.last_name,
    phone: e.phone,
    active: e.is_active === 1,
    serviceIds: (links.results as { employee_id: string; service_id: string }[])
      .filter((l) => l.employee_id === e.id)
      .map((l) => l.service_id),
    weeklyOffDays: sortDays(JSON.parse(e.weekly_off_days)),
    commissionRate: e.commission_rate ?? 0,
  }));
}

export async function findEmployee(env: Env, id: string, message = "Ekip üyesi bulunamadı."): Promise<Employee> {
  const [employee] = await loadEmployees(env, id);
  if (!employee) throw new NotFound(message);
  return employee;
}

export async function findService(env: Env, id: string): Promise<ServiceRow> {
  const service = await env.DB.prepare("SELECT * FROM services WHERE id = ?").bind(id).first<ServiceRow>();
  if (!service) throw new NotFound("Hizmet bulunamadı.");
  return service;
}

// Verilen sırayla hizmetler; biri yoksa 404
export async function findServices(env: Env, ids: string[]): Promise<ServiceRow[]> {
  const { results } = await env.DB.prepare("SELECT * FROM services WHERE id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ids))
    .all<ServiceRow>();
  if (results.length !== ids.length) throw new NotFound("Seçilen hizmetlerden biri bulunamadı.");
  return ids.map((id) => results.find((s) => s.id === id)!);
}

// Paketlerin hizmetleri (paket içindeki sırayla)
export async function packageServiceIds(env: Env, packageIds?: string[]): Promise<Map<string, string[]>> {
  const { results } = await (packageIds
    ? env.DB.prepare(
        "SELECT package_id, service_id FROM package_services WHERE package_id IN (SELECT value FROM json_each(?)) ORDER BY position",
      ).bind(JSON.stringify(packageIds))
    : env.DB.prepare("SELECT package_id, service_id FROM package_services ORDER BY position")
  ).all<{ package_id: string; service_id: string }>();
  const map = new Map<string, string[]>();
  for (const r of results) map.set(r.package_id, [...(map.get(r.package_id) ?? []), r.service_id]);
  return map;
}

export const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

// Sitede Türkçe alfabe sırası
export const trCollator = new Intl.Collator("tr-TR");

// Büyük/küçük harf ve I/ı/İ/i farkı gözetmeden isim karşılaştırma ("VIP Bakım" = "vip bakım")
export const sameName = (a: string, b: string) => {
  const fold = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
  return fold(a) === fold(b);
};

export const centsToPrice =(cents: number | null) => (cents === null ? null : cents / 100);

// "450,5" / 450.5 -> 45050 kuruş; geçersizse null
export function priceToCents(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value.replace(",", ".")) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

// "2,5" / 2.5 -> 2.5 (yüzde, 0-100); boş = 0
export function parseRate(value: unknown, label: string): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100) {
    throw new BusinessError(`${label} 0 ile 100 arasında olmalıdır.`);
  }
  return Math.round(n * 100) / 100;
}

// --- Randevu verisi ---

const APPOINTMENT_SELECT = `
  SELECT a.id, a.start_time, a.end_time, a.status, a.price_cents, a.list_price_cents, a.price_note, a.package_name,
         a.payment_method,
         c.full_name AS customer_full_name, c.phone AS customer_phone,
         e.id AS employee_id, e.first_name || ' ' || e.last_name AS employee_name
  FROM appointments a
  JOIN customers c ON c.id = a.customer_id
  JOIN employees e ON e.id = a.employee_id`;

export interface AppointmentLine {
  service_name: string;
  price_cents: number | null;
}

export interface AppointmentRow {
  id: string;
  start_time: string;
  end_time: string;
  status: "CONFIRMED" | "CANCELLED" | "NO_SHOW" | "PENDING" | "COMPLETED";
  price_cents: number | null;
  list_price_cents: number | null;
  price_note: string | null;
  package_name: string | null;
  payment_method: "CASH" | "CARD" | "TRANSFER" | null;
  customer_full_name: string;
  customer_phone: string;
  employee_id: string;
  employee_name: string;
  lines: AppointmentLine[]; // alınan hizmetler
}

export async function queryAppointments(env: Env, where: string, ...params: unknown[]): Promise<AppointmentRow[]> {
  const { results } = await env.DB.prepare(`${APPOINTMENT_SELECT} ${where}`).bind(...params).all<AppointmentRow>();
  if (!results.length) return [];
  const { results: lines } = await env.DB.prepare(
    `SELECT appointment_id, service_name, price_cents FROM appointment_services
     WHERE appointment_id IN (SELECT value FROM json_each(?)) ORDER BY position`,
  )
    .bind(JSON.stringify(results.map((a) => a.id)))
    .all<AppointmentLine & { appointment_id: string }>();
  return results.map((a) => ({ ...a, lines: lines.filter((l) => l.appointment_id === a.id) }));
}

// "Saç Kesimi + Sakal Tasarımı" ya da paket adı
export const serviceLabel = (a: Pick<AppointmentRow, "package_name" | "lines">) =>
  a.package_name ?? a.lines.map((l) => l.service_name).join(" + ");

// Müşteriye dönülen randevu (fiyat bilgisi içermez)
export const toAppointmentResponse = (a: AppointmentRow) => ({
  id: a.id,
  startTime: a.start_time,
  endTime: a.end_time,
  status: a.status,
  customerFullName: a.customer_full_name,
  customerPhone: a.customer_phone,
  employeeName: a.employee_name,
  serviceName: serviceLabel(a),
  services: a.lines.map((l) => l.service_name),
  packageName: a.package_name,
});

// Yöneticiye dönülen randevu: tahsil edilen fiyat, liste fiyatı, indirim notu ve ödeme yöntemi dahil
export const toAdminAppointmentResponse = (a: AppointmentRow) => ({
  ...toAppointmentResponse(a),
  price: centsToPrice(a.price_cents),
  listPrice: centsToPrice(a.list_price_cents),
  priceNote: a.price_note,
  paymentMethod: a.payment_method,
});

// --- Müşterinin seçimi: bir veya birkaç hizmet ya da bir paket ---

interface Selection {
  services: ServiceRow[];
  pkg: PackageRow | null;
  // Hizmet süreleri toplamı + bir kez temizlik/tampon süresi (seçilenlerin en uzunu)
  totalMinutes: number;
  // Paket fiyatı ya da hizmet fiyatları toplamı (fiyatı girilmemiş hizmetler 0 sayılır; hiçbirinde yoksa null)
  listPriceCents: number | null;
  label: string;
}

export interface SelectionInput {
  serviceIds?: unknown;
  serviceId?: unknown;
  packageId?: unknown;
}

export const hasSelection = (input: SelectionInput) =>
  Boolean(input.packageId) || Boolean(input.serviceId) || (Array.isArray(input.serviceIds) && input.serviceIds.length > 0);

export async function resolveSelection(env: Env, input: SelectionInput): Promise<Selection> {
  if (input.packageId) {
    if (typeof input.packageId !== "string") throw new BadRequest();
    const pkg = await env.DB.prepare("SELECT * FROM packages WHERE id = ?").bind(input.packageId).first<PackageRow>();
    if (!pkg) throw new NotFound("Paket bulunamadı.");
    const services = await findServices(env, (await packageServiceIds(env, [pkg.id])).get(pkg.id) ?? []);
    if (pkg.is_active !== 1 || !services.length || services.some((s) => s.is_active !== 1)) {
      throw new BusinessError("Bu paket şu anda sunulmuyor.");
    }
    return { services, pkg, totalMinutes: totalMinutes(services), listPriceCents: pkg.price_cents, label: pkg.name };
  }

  const raw = Array.isArray(input.serviceIds) ? input.serviceIds : input.serviceId ? [input.serviceId] : [];
  if (raw.some((id) => typeof id !== "string" || !id)) throw new BadRequest();
  const ids = [...new Set(raw as string[])];
  if (!ids.length) {
    throw new BusinessError("Lütfen en az bir hizmet seçin.");
  }
  if (ids.length > MAX_SERVICES_PER_APPOINTMENT) {
    throw new BusinessError(`Tek randevuda en fazla ${MAX_SERVICES_PER_APPOINTMENT} hizmet seçilebilir.`);
  }
  const services = await findServices(env, ids);
  if (services.some((s) => s.is_active !== 1)) {
    throw new BusinessError("Bu hizmet şu anda verilmiyor.");
  }
  const prices = services.map((s) => s.price_cents).filter((p): p is number => p !== null);
  return {
    services,
    pkg: null,
    totalMinutes: totalMinutes(services),
    listPriceCents: prices.length ? prices.reduce((a, b) => a + b, 0) : null,
    label: services.map((s) => s.name).join(" + "),
  };
}

const totalMinutes = (services: ServiceRow[]) =>
  services.reduce((sum, s) => sum + s.duration_minutes, 0) + Math.max(0, ...services.map((s) => s.buffer_minutes));

function ensureEmployeeProvides(employee: Employee, selection: Selection) {
  if (!employee.active) {
    throw new BusinessError("Seçilen ekip üyesi şu anda randevu kabul etmiyor.");
  }
  if (selection.services.some((s) => !employee.serviceIds.includes(s.id))) {
    throw new BusinessError(
      selection.services.length > 1
        ? "Seçilen ekip üyesi seçtiğiniz hizmetlerin hepsini vermiyor."
        : "Seçilen ekip üyesi bu hizmeti vermiyor.",
    );
  }
}

// --- Müşteri tarafı ---

// Müşteriye açık ekip üyesi bilgisi (telefon gibi kişisel bilgiler içermez)
export async function getActiveEmployees(env: Env) {
  return (await loadEmployees(env))
    .filter((e) => e.active)
    .map((e) => ({ id: e.id, name: fullName(e), serviceIds: e.serviceIds, weeklyOffDays: e.weeklyOffDays }));
}

// Sitede hizmet fiyatı gösterilmez
export async function getActiveServices(env: Env) {
  const { results } = await env.DB.prepare("SELECT * FROM services WHERE is_active = 1").all<ServiceRow>();
  return results
    .sort((a, b) => trCollator.compare(a.name, b.name))
    .map((s) => ({ id: s.id, name: s.name, durationMinutes: s.duration_minutes }));
}

// Aktif paketler (içindeki hizmetlerin hepsi aktifse). Paket fiyatı sitede gösterilir.
export async function getActivePackages(env: Env) {
  const [{ results: packages }, { results: services }, links] = await Promise.all([
    env.DB.prepare("SELECT * FROM packages WHERE is_active = 1").all<PackageRow>(),
    env.DB.prepare("SELECT * FROM services").all<ServiceRow>(),
    packageServiceIds(env),
  ]);
  return packages
    .map((p) => ({ p, svcs: (links.get(p.id) ?? []).map((id) => services.find((s) => s.id === id)!).filter(Boolean) }))
    .filter(({ svcs }) => svcs.length > 0 && svcs.every((s) => s.is_active === 1))
    .sort((a, b) => trCollator.compare(a.p.name, b.p.name))
    .map(({ p, svcs }) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: centsToPrice(p.price_cents),
      serviceIds: svcs.map((s) => s.id),
      serviceNames: svcs.map((s) => s.name),
      durationMinutes: svcs.reduce((sum, s) => sum + s.duration_minutes, 0),
    }));
}

interface BreakRow {
  start_time: string;
  end_time: string;
}

// Çalışanın o gün geçerli olan molaları: o tarihe özel + haftanın o günü + her gün
async function applicableBreaks(env: Env, employeeId: string, date: string): Promise<BreakRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT start_time, end_time FROM employee_breaks
     WHERE employee_id = ?
       AND (break_date = ? OR (break_date IS NULL AND (day_of_week IS NULL OR day_of_week = ?)))`,
  )
    .bind(employeeId, date, dayOfWeek(date))
    .all<BreakRow>();
  return results;
}

async function activeAppointmentsOn(env: Env, employeeId: string, date: string) {
  const { results } = await env.DB.prepare(
    `SELECT start_time, end_time FROM appointments
     WHERE employee_id = ? AND ${OCCUPIES_SLOT} AND start_time BETWEEN ? AND ?`,
  )
    .bind(employeeId, startOfDay(date), endOfDay(date))
    .all<{ start_time: string; end_time: string }>();
  return results;
}

// Haftalık izin günü veya izinli olduğu tarih
async function isEmployeeOff(env: Env, employee: Employee, date: string): Promise<boolean> {
  if (employee.weeklyOffDays.includes(dayOfWeek(date))) return true;
  const leave = await env.DB.prepare(
    "SELECT 1 FROM employee_leaves WHERE employee_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1",
  )
    .bind(employee.id, date, date)
    .first();
  return leave !== null;
}

function overlapsBreak(start: string, end: string, breaks: BreakRow[]): boolean {
  // Tekrarlayan molalarda tarih yoktur; randevunun günü esas alınır
  const date = start.slice(0, 10);
  return breaks.some((b) => start < `${date}T${b.end_time}:00` && end > `${date}T${b.start_time}:00`);
}

export async function getAvailableSlots(env: Env, employeeId: string, input: SelectionInput, date: string) {
  // 1. GÜVENLİK: Eğer istenilen gün dünden kalmaysa, direkt boş liste dön.
  if (date < todayLocal()) return [];

  const [employee, selection] = await Promise.all([findEmployee(env, employeeId), resolveSelection(env, input)]);
  ensureEmployeeProvides(employee, selection);

  // Haftalık izin günü veya izinli olduğu tarih: hiç saat gösterme
  if (await isEmployeeOff(env, employee, date)) return [];

  const [appointments, breaks] = await Promise.all([
    activeAppointmentsOn(env, employeeId, date),
    applicableBreaks(env, employeeId, date),
  ]);

  const now = nowLocal();
  const closing = `${date}T${SHOP_CLOSE_TIME}:00`;
  const slots: string[] = [];
  for (
    let start = `${date}T${SHOP_OPEN_TIME}:00`;
    plusMinutes(start, selection.totalMinutes) <= closing;
    start = plusMinutes(start, SLOT_STEP_MINUTES)
  ) {
    // 2. GÜVENLİK: Randevu günü bugünse, geçmiş saatleri listeye koyma
    if (start < now) continue;
    const end = plusMinutes(start, selection.totalMinutes);
    const busy = appointments.some((a) => start < a.end_time && end > a.start_time) || overlapsBreak(start, end, breaks);
    if (!busy) slots.push(start.slice(11, 16));
  }
  return slots;
}

interface AppointmentRequest extends SelectionInput {
  customerFullName?: unknown;
  customerPhone?: unknown;
  employeeId?: unknown;
  startTime?: unknown;
}

// verifiedPhone: SMS koduyla doğrulanmış numara (bkz. verification.ts)
export async function createAppointment(env: Env, ctx: WaitUntil, request: AppointmentRequest, verifiedPhone: string) {
  if (!request.employeeId || !hasSelection(request) || !request.startTime) {
    throw new BusinessError("Ekip üyesi, hizmet ve saat seçimi zorunludur.");
  }
  if (typeof request.employeeId !== "string") throw new BadRequest();
  const customerName = typeof request.customerFullName === "string" ? request.customerFullName.trim() : "";
  if (customerName.length < 2) {
    throw new BusinessError("Lütfen adınızı ve soyadınızı girin.");
  }
  const phone = normalizePhone(verifiedPhone);
  if (typeof request.customerPhone === "string" && request.customerPhone.trim() !== ""
      && normalizePhone(request.customerPhone) !== phone) {
    throw new Unauthorized("Randevu yalnızca doğrulanan telefon numarasıyla alınabilir.");
  }

  const startTime = parseDateTime(request.startTime);
  // 3. GÜVENLİK: API üzerinden zorla geçmişe kayıt atılmaya çalışılırsa reddet
  if (startTime < nowLocal()) {
    throw new BusinessError("Geçmiş bir tarihe veya saate randevu alamazsınız.");
  }

  const [employee, selection] = await Promise.all([findEmployee(env, request.employeeId), resolveSelection(env, request)]);
  ensureEmployeeProvides(employee, selection);

  const endTime = plusMinutes(startTime, selection.totalMinutes);
  const date = startTime.slice(0, 10);

  // 4. GÜVENLİK: Çalışma saatleri dışına randevu atılmasını engelle
  if (startTime.slice(11, 16) < SHOP_OPEN_TIME || endTime.slice(0, 10) !== date || endTime.slice(11, 16) > SHOP_CLOSE_TIME) {
    throw new BusinessError("Seçilen saat çalışma saatleri dışında.");
  }
  if (await isEmployeeOff(env, employee, date)) {
    throw new BusinessError("Seçilen ekip üyesi bu tarihte izinli.");
  }
  const taken = "Üzgünüz, bu saat dilimi az önce başka bir müşteri tarafından alındı.";
  if (overlapsBreak(startTime, endTime, await applicableBreaks(env, employee.id, date))) {
    throw new BusinessError(taken);
  }

  // Çakışma kontrolü ve kayıt tek işlemde (batch = transaction): aynı saate aynı anda gelen iki istekten
  // yalnızca biri kaydedilir. Müşteri ilk randevusunda oluşturulur; varsa adı değiştirilmez.
  const noOverlap = `NOT EXISTS (SELECT 1 FROM appointments
      WHERE employee_id = ? AND ${OCCUPIES_SLOT} AND start_time < ? AND end_time > ?)`;
  const overlapParams = [employee.id, endTime, startTime];
  const appointmentId = crypto.randomUUID();
  const { services, pkg } = selection;
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO customers (id, full_name, phone) SELECT ?, ?, ? WHERE ${noOverlap} ON CONFLICT(phone) DO NOTHING`,
    ).bind(crypto.randomUUID(), customerName, phone, ...overlapParams),
    env.DB.prepare(
      `INSERT INTO appointments (id, customer_id, employee_id, service_id, start_time, end_time,
                                 price_cents, list_price_cents, package_id, package_name, status, created_at)
       SELECT ?, c.id, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ? FROM customers c WHERE c.phone = ? AND ${noOverlap}`,
    ).bind(
      appointmentId, employee.id, services[0].id, startTime, endTime,
      selection.listPriceCents, selection.listPriceCents, pkg?.id ?? null, pkg?.name ?? null, nowLocal(),
      phone, ...overlapParams,
    ),
    // Hizmet satırları yalnızca randevu kaydedildiyse eklenir
    ...services.map((s, i) =>
      env.DB.prepare(
        `INSERT INTO appointment_services (appointment_id, service_id, service_name, duration_minutes, price_cents, position)
         SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM appointments WHERE id = ?)`,
      ).bind(appointmentId, s.id, s.name, s.duration_minutes, s.price_cents, i, appointmentId),
    ),
  ]);
  if (results[1].meta.changes === 0) {
    throw new BusinessError(taken);
  }

  ctx.waitUntil(
    sendNotificationQuietly(
      env,
      phone,
      appointmentCreatedSms(env, { customerPhone: phone, serviceName: selection.label, employeeName: fullName(employee), startTime }),
      "Onay",
    ),
  );
}

// Müşteri, üzerinden bir haftadan fazla geçmiş randevularını görmez (kayıtlar silinmez, raporda kalır)
export async function getCustomerAppointments(env: Env, phone: string) {
  const from = plusMinutes(nowLocal(), -CUSTOMER_HISTORY_DAYS * 24 * 60);
  const rows = await queryAppointments(env, "WHERE c.phone = ? AND a.start_time >= ? ORDER BY a.start_time DESC", normalizePhone(phone), from);
  return rows.map(toAppointmentResponse);
}

export async function getEmployeeAppointments(env: Env, employeeId: string, date: string) {
  const rows = await queryAppointments(
    env,
    "WHERE a.employee_id = ? AND a.start_time BETWEEN ? AND ? ORDER BY a.start_time ASC",
    employeeId,
    startOfDay(date),
    endOfDay(date),
  );
  return rows.map(toAdminAppointmentResponse);
}

export async function findAppointment(env: Env, id: string): Promise<AppointmentRow> {
  const [appointment] = await queryAppointments(env, "WHERE a.id = ?", id);
  if (!appointment) throw new NotFound("Randevu bulunamadı.");
  return appointment;
}

async function cancel(env: Env, appointment: AppointmentRow) {
  if (appointment.status === "CANCELLED") {
    throw new BusinessError("Bu randevu zaten iptal edilmiş.");
  }
  if (appointment.start_time < nowLocal()) {
    throw new BusinessError("Geçmiş randevular iptal edilemez.");
  }
  const result = await env.DB.prepare("UPDATE appointments SET status = 'CANCELLED' WHERE id = ? AND status <> 'CANCELLED'")
    .bind(appointment.id)
    .run();
  if (result.meta.changes === 0) {
    throw new BusinessError("Bu randevu zaten iptal edilmiş.");
  }
}

// Müşteri iptali: randevu, SMS ile doğrulanmış telefon numarasına ait olmalı
export async function cancelAppointmentAsCustomer(env: Env, appointmentId: string, phone: string) {
  const appointment = await findAppointment(env, appointmentId);
  if (appointment.customer_phone !== normalizePhone(phone)) {
    throw new Unauthorized("Bu randevu size ait değil.");
  }
  await cancel(env, appointment);
}

// Yönetici iptali: sahiplik kontrolü yok (yetki index.ts'de doğrulanır). Müşteriye SMS ile bildirilir.
export async function cancelAppointmentAsAdmin(env: Env, ctx: WaitUntil, appointmentId: string) {
  const appointment = await findAppointment(env, appointmentId);
  await cancel(env, appointment);
  ctx.waitUntil(
    sendNotificationQuietly(
      env,
      appointment.customer_phone,
      appointmentCancelledSms(env, {
        customerPhone: appointment.customer_phone,
        serviceName: serviceLabel(appointment),
        employeeName: appointment.employee_name,
        startTime: appointment.start_time,
      }),
      "İptal",
    ),
  );
}

// Yönetici, saati geçmiş randevuyu "gelmedi" olarak işaretler (veya geri alır); bu randevular ciroya sayılmaz
export async function setNoShow(env: Env, appointmentId: string, noShow: boolean) {
  const appointment = await findAppointment(env, appointmentId);
  if (appointment.status === "CANCELLED") {
    throw new BusinessError("İptal edilmiş randevu işaretlenemez.");
  }
  if (appointment.start_time >= nowLocal()) {
    throw new BusinessError('Saati gelmemiş randevu "gelmedi" olarak işaretlenemez.');
  }
  if (noShow) {
    await env.DB.prepare("UPDATE appointments SET status = 'NO_SHOW' WHERE id = ?").bind(appointmentId).run();
    return toAdminAppointmentResponse({ ...appointment, status: "NO_SHOW" });
  }
  // Geri alma ("geldi"): "gelmedi" işaretlenince boşalan saate bu arada başka randevu alındıysa çakışma olmasın
  const result = await env.DB.prepare(
    `UPDATE appointments SET status = 'CONFIRMED' WHERE id = ? AND NOT EXISTS (
       SELECT 1 FROM appointments WHERE employee_id = ? AND id <> ? AND ${OCCUPIES_SLOT} AND start_time < ? AND end_time > ?)`,
  )
    .bind(appointmentId, appointment.employee_id, appointmentId, appointment.end_time, appointment.start_time)
    .run();
  if (result.meta.changes === 0) {
    throw new BusinessError("Bu saate başka bir randevu alınmış, geri alınamaz.");
  }
  return toAdminAppointmentResponse({ ...appointment, status: "CONFIRMED" });
}

const MAX_PRICE_NOTE = 120;

// Yönetici tahsil edilen tutarı düzenler (indirim vb.); ciro raporu bu tutarı kullanır.
// price boş gönderilirse liste fiyatına dönülür.
export async function setAppointmentPrice(env: Env, appointmentId: string, price: unknown, note: unknown) {
  const appointment = await findAppointment(env, appointmentId);
  const { price_cents, price_note } = parseAppointmentPrice(appointment, price, note);
  await env.DB.prepare("UPDATE appointments SET price_cents = ?, price_note = ? WHERE id = ?")
    .bind(price_cents, price_note, appointmentId)
    .run();
  return toAdminAppointmentResponse({ ...appointment, price_cents, price_note });
}

// Düzenlenen tutarı doğrular (ödeme anında indirimde de kullanılır). price boşsa liste fiyatına dönülür.
export function parseAppointmentPrice(appointment: AppointmentRow, price: unknown, note: unknown) {
  if (appointment.status === "CANCELLED") {
    throw new BusinessError("İptal edilmiş randevunun fiyatı düzenlenemez.");
  }
  const reset = price === null || price === undefined || price === "";
  const cents = reset ? appointment.list_price_cents : priceToCents(price);
  if (!reset && cents === null) {
    throw new BusinessError("Geçerli bir tutar girin.");
  }
  const cleanNote = reset ? null : typeof note === "string" && note.trim() ? note.trim() : null;
  if (cleanNote && cleanNote.length > MAX_PRICE_NOTE) {
    throw new BusinessError(`Not en fazla ${MAX_PRICE_NOTE} karakter olabilir.`);
  }
  return { price_cents: cents, price_note: cleanNote };
}
