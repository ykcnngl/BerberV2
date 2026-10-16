// Yönetici paneli: çalışan/hizmet yönetimi, mola ve izin tanımlama (rapor: report.ts)
import type { Env } from "./env";
import { BadRequest, BusinessError, NotFound } from "./errors";
import { normalizePhone } from "./phone";
import {
  type Employee,
  type ServiceRow,
  centsToPrice,
  parseRate,
  priceToCents,
  sameName,
  findEmployee,
  findService,
  loadEmployees,
  OCCUPIES_SLOT,
  trCollator,
} from "./booking";
import { endOfDay, parseDayOfWeek, parseOptionalDate, parseTime, startOfDay, todayLocal } from "./time";

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const trimToNull = (value: unknown) => trim(value) || null;

// --- ÇALIŞANLAR ---

// Yönetici paneli için tam çalışan bilgisi (pasif çalışanlar dahil)
const toAdminEmployee = (e: Employee) => ({
  id: e.id,
  firstName: e.firstName,
  lastName: e.lastName,
  phone: e.phone,
  active: e.active,
  serviceIds: e.serviceIds,
  weeklyOffDays: e.weeklyOffDays,
  commissionRate: e.commissionRate,
});

export async function listEmployees(env: Env) {
  return (await loadEmployees(env))
    .sort((a, b) => Number(b.active) - Number(a.active) || trCollator.compare(a.firstName, b.firstName))
    .map(toAdminEmployee);
}

interface EmployeeRequest {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  serviceIds?: unknown;
  weeklyOffDays?: unknown;
  commissionRate?: unknown;
}

export async function saveEmployee(env: Env, id: string | null, request: EmployeeRequest) {
  if (id) await findEmployee(env, id, "Çalışan bulunamadı.");
  const firstName = trim(request.firstName);
  const lastName = trim(request.lastName);
  if (!firstName || !lastName) {
    throw new BusinessError("Ad ve soyad zorunludur.");
  }
  if (!Array.isArray(request.serviceIds) || request.serviceIds.length === 0) {
    throw new BusinessError("Çalışana en az bir hizmet seçilmelidir.");
  }
  const serviceIds = [...new Set(request.serviceIds as unknown[])];
  if (serviceIds.some((s) => typeof s !== "string")) throw new BadRequest();
  const { results: found } = await env.DB.prepare(
    `SELECT id FROM services WHERE id IN (${serviceIds.map(() => "?").join(",")})`,
  )
    .bind(...serviceIds)
    .all();
  if (found.length !== serviceIds.length) {
    throw new NotFound("Seçilen hizmetlerden biri bulunamadı.");
  }
  if (request.weeklyOffDays != null && !Array.isArray(request.weeklyOffDays)) throw new BadRequest();
  const offDays = [...new Set(((request.weeklyOffDays as unknown[]) ?? []).map(parseDayOfWeek))];
  const phone = trim(request.phone) ? normalizePhone(request.phone) : null;
  const commissionRate = parseRate(request.commissionRate, "Prim oranı");

  const employeeId = id ?? crypto.randomUUID();
  await env.DB.batch([
    id
      ? env.DB.prepare(
          "UPDATE employees SET first_name = ?, last_name = ?, phone = ?, weekly_off_days = ?, commission_rate = ? WHERE id = ?",
        ).bind(firstName, lastName, phone, JSON.stringify(offDays), commissionRate, id)
      : env.DB.prepare(
          `INSERT INTO employees (id, first_name, last_name, phone, role, is_active, weekly_off_days, commission_rate)
           VALUES (?, ?, ?, ?, 'STAFF', 1, ?, ?)`,
        ).bind(employeeId, firstName, lastName, phone, JSON.stringify(offDays), commissionRate),
    env.DB.prepare("DELETE FROM employee_services WHERE employee_id = ?").bind(employeeId),
    ...serviceIds.map((serviceId) =>
      env.DB.prepare("INSERT INTO employee_services (employee_id, service_id) VALUES (?, ?)").bind(employeeId, serviceId),
    ),
  ]);
  return toAdminEmployee(await findEmployee(env, employeeId));
}

// Çalışan silinmez, pasife alınır: geçmiş randevular korunur, yeni randevu alınamaz
export async function setEmployeeActive(env: Env, id: string, active: boolean) {
  await findEmployee(env, id, "Çalışan bulunamadı.");
  await env.DB.prepare("UPDATE employees SET is_active = ? WHERE id = ?").bind(active ? 1 : 0, id).run();
  return toAdminEmployee(await findEmployee(env, id));
}

// --- HİZMETLER ---

// Yönetici paneli için hizmet bilgisi (pasif hizmetler dahil)
const toAdminService = (s: ServiceRow) => ({
  id: s.id,
  name: s.name,
  durationMinutes: s.duration_minutes,
  price: centsToPrice(s.price_cents),
  active: s.is_active === 1,
});

export async function listServices(env: Env) {
  const { results } = await env.DB.prepare("SELECT * FROM services").all<ServiceRow>();
  return results
    .sort((a, b) => b.is_active - a.is_active || trCollator.compare(a.name, b.name))
    .map(toAdminService);
}

interface ServiceRequest {
  name?: unknown;
  durationMinutes?: unknown;
  price?: unknown;
}

export async function saveService(env: Env, id: string | null, request: ServiceRequest) {
  if (id) await findService(env, id);
  const name = trim(request.name);
  if (!name) {
    throw new BusinessError("Hizmet adı zorunludur.");
  }
  const duration = request.durationMinutes;
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 5 || duration > 600) {
    throw new BusinessError("Süre 5 ile 600 dakika arasında olmalıdır.");
  }
  const priceCents = priceToCents(request.price);
  if (priceCents === null) {
    throw new BusinessError("Geçerli bir fiyat girin.");
  }
  const { results: all } = await env.DB.prepare("SELECT id, name FROM services").all<{ id: string; name: string }>();
  if (all.some((s) => s.id !== id && sameName(s.name, name))) {
    throw new BusinessError("Bu isimde bir hizmet zaten var.");
  }
  const serviceId = id ?? crypto.randomUUID();
  if (id) {
    await env.DB.prepare("UPDATE services SET name = ?, duration_minutes = ?, price_cents = ? WHERE id = ?")
      .bind(name, duration, priceCents, id)
      .run();
  } else {
    await env.DB.prepare("INSERT INTO services (id, name, duration_minutes, price_cents) VALUES (?, ?, ?, ?)")
      .bind(serviceId, name, duration, priceCents)
      .run();
  }
  return toAdminService(await findService(env, serviceId));
}

// Hizmet silinmez, pasife alınır: geçmiş randevular korunur, yeni randevu alınamaz
export async function setServiceActive(env: Env, id: string, active: boolean) {
  await findService(env, id);
  await env.DB.prepare("UPDATE services SET is_active = ? WHERE id = ?").bind(active ? 1 : 0, id).run();
  return toAdminService(await findService(env, id));
}

// Hizmeti verecek ekip üyelerini belirler: listedekilere eklenir, diğerlerinden çıkarılır
export async function setServiceProviders(env: Env, id: string, employeeIds: unknown) {
  await findService(env, id);
  if (employeeIds != null && !Array.isArray(employeeIds)) throw new BadRequest();
  const wanted = [...new Set((employeeIds as unknown[]) ?? [])];
  if (wanted.some((e) => typeof e !== "string")) throw new BadRequest();
  const { results: all } = await env.DB.prepare("SELECT id FROM employees").all<{ id: string }>();
  const existing = new Set(all.map((e) => e.id));
  if (wanted.some((e) => !existing.has(e as string))) {
    throw new NotFound("Seçilen ekip üyelerinden biri bulunamadı.");
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM employee_services WHERE service_id = ?").bind(id),
    ...wanted.map((employeeId) =>
      env.DB.prepare("INSERT INTO employee_services (employee_id, service_id) VALUES (?, ?)").bind(employeeId, id),
    ),
  ]);
}

// --- MOLALAR ---
// breakDate dolu -> sadece o tarih; dayOfWeek dolu -> her hafta o gün; ikisi de boş -> her gün

interface BreakRow {
  id: string;
  break_date: string | null;
  day_of_week: string | null;
  start_time: string;
  end_time: string;
  reason: string | null;
}

const toBreak = (b: BreakRow) => ({
  id: b.id,
  breakDate: b.break_date,
  dayOfWeek: b.day_of_week,
  startTime: b.start_time,
  endTime: b.end_time,
  reason: b.reason,
});

// Tekrarlayan molalar + bugünden sonraki tarihli molalar
export async function listBreaks(env: Env, employeeId: string) {
  await findEmployee(env, employeeId, "Çalışan bulunamadı.");
  const { results } = await env.DB.prepare(
    `SELECT * FROM employee_breaks
     WHERE employee_id = ? AND (break_date IS NULL OR break_date >= ?)
     ORDER BY break_date NULLS FIRST, day_of_week NULLS FIRST, start_time`,
  )
    .bind(employeeId, todayLocal())
    .all<BreakRow>();
  return results.map(toBreak);
}

interface BreakRequest {
  breakDate?: unknown;
  dayOfWeek?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  reason?: unknown;
}

export async function addBreak(env: Env, employeeId: string, request: BreakRequest) {
  await findEmployee(env, employeeId, "Çalışan bulunamadı.");
  const start = request.startTime == null || request.startTime === "" ? null : parseTime(request.startTime);
  const end = request.endTime == null || request.endTime === "" ? null : parseTime(request.endTime);
  if (!start || !end || start >= end) {
    throw new BusinessError("Mola başlangıcı bitişten önce olmalıdır.");
  }
  const breakDate = parseOptionalDate(request.breakDate);
  const day = request.dayOfWeek == null || request.dayOfWeek === "" ? null : parseDayOfWeek(request.dayOfWeek);
  if (breakDate && day) {
    throw new BusinessError("Mola ya belirli bir tarihe ya da haftanın bir gününe tanımlanabilir.");
  }
  if (breakDate && breakDate < todayLocal()) {
    throw new BusinessError("Geçmiş bir tarihe mola eklenemez.");
  }
  const row: BreakRow = { id: crypto.randomUUID(), break_date: breakDate, day_of_week: day, start_time: start, end_time: end, reason: trimToNull(request.reason) };
  await env.DB.prepare(
    "INSERT INTO employee_breaks (id, employee_id, break_date, day_of_week, start_time, end_time, reason) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(row.id, employeeId, row.break_date, row.day_of_week, row.start_time, row.end_time, row.reason)
    .run();
  return toBreak(row);
}

export async function deleteBreak(env: Env, breakId: string) {
  const result = await env.DB.prepare("DELETE FROM employee_breaks WHERE id = ?").bind(breakId).run();
  if (result.meta.changes === 0) throw new NotFound("Mola bulunamadı.");
}

// --- İZİNLER ---
// Çalışanın tam gün izinli olduğu tarih aralığı (başlangıç ve bitiş dahil)

interface LeaveRow {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
}

const toLeave = (l: LeaveRow) => ({ id: l.id, startDate: l.start_date, endDate: l.end_date, reason: l.reason });

// Bitmemiş izinler
export async function listLeaves(env: Env, employeeId: string) {
  await findEmployee(env, employeeId, "Çalışan bulunamadı.");
  const { results } = await env.DB.prepare(
    "SELECT * FROM employee_leaves WHERE employee_id = ? AND end_date >= ? ORDER BY start_date ASC",
  )
    .bind(employeeId, todayLocal())
    .all<LeaveRow>();
  return results.map(toLeave);
}

interface LeaveRequest {
  startDate?: unknown;
  endDate?: unknown;
  reason?: unknown;
}

export async function addLeave(env: Env, employeeId: string, request: LeaveRequest) {
  await findEmployee(env, employeeId, "Çalışan bulunamadı.");
  const start = parseOptionalDate(request.startDate);
  const end = parseOptionalDate(request.endDate) ?? start;
  if (!start || !end || end < start) {
    throw new BusinessError("İzin başlangıç tarihi bitişten sonra olamaz.");
  }
  if (end < todayLocal()) {
    throw new BusinessError("Geçmiş tarihlere izin eklenemez.");
  }
  // Müşterisi habersiz kalmasın: izin günlerindeki aktif randevular önce iptal edilmeli
  const conflicts = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM appointments WHERE employee_id = ? AND ${OCCUPIES_SLOT} AND start_time BETWEEN ? AND ?`,
  )
    .bind(employeeId, startOfDay(start), endOfDay(end))
    .first<number>("n");
  if (conflicts) {
    throw new BusinessError(
      `Bu tarihlerde ${conflicts} aktif randevu var. Önce Randevular sekmesinden iptal edin (müşterilere SMS ile bildirilir).`,
    );
  }
  const row: LeaveRow = { id: crypto.randomUUID(), start_date: start, end_date: end, reason: trimToNull(request.reason) };
  await env.DB.prepare("INSERT INTO employee_leaves (id, employee_id, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)")
    .bind(row.id, employeeId, row.start_date, row.end_date, row.reason)
    .run();
  return toLeave(row);
}

export async function deleteLeave(env: Env, leaveId: string) {
  const result = await env.DB.prepare("DELETE FROM employee_leaves WHERE id = ?").bind(leaveId).run();
  if (result.meta.changes === 0) throw new NotFound("İzin bulunamadı.");
}

