// Yönetici paneli: çalışan/hizmet yönetimi, mola ve izin tanımlama, ciro raporu
import type { Env } from "./env";
import { BadRequest, BusinessError, NotFound } from "./errors";
import { normalizePhone } from "./phone";
import { generateRecurringExpenses, totalExpensesCents } from "./expenses";
import {
  type AppointmentLine,
  type Employee,
  type ServiceRow,
  centsToPrice,
  priceToCents,
  sameName,
  findEmployee,
  findService,
  fullName,
  loadEmployees,
  queryAppointments,
  trCollator,
} from "./booking";
import {
  daysBetween,
  endOfDay,
  nowLocal,
  parseDate,
  parseDayOfWeek,
  parseOptionalDate,
  parseTime,
  plusDays,
  startOfDay,
  todayLocal,
} from "./time";

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

  const employeeId = id ?? crypto.randomUUID();
  await env.DB.batch([
    id
      ? env.DB.prepare("UPDATE employees SET first_name = ?, last_name = ?, phone = ?, weekly_off_days = ? WHERE id = ?").bind(
          firstName, lastName, phone, JSON.stringify(offDays), id)
      : env.DB.prepare(
          "INSERT INTO employees (id, first_name, last_name, phone, role, is_active, weekly_off_days) VALUES (?, ?, ?, ?, 'STAFF', 1, ?)",
        ).bind(employeeId, firstName, lastName, phone, JSON.stringify(offDays)),
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
    "SELECT COUNT(*) AS n FROM appointments WHERE employee_id = ? AND status <> 'CANCELLED' AND start_time BETWEEN ? AND ?",
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

// --- RAPOR ---
// Seçilen tarih aralığında yapılan (saati geçmiş, iptal edilmemiş, "gelmedi" olmayan) işlemler.
// "total" tüm salonu, "employees" her çalışanı ayrı ayrı verir. Ciro, yöneticinin düzenlediği (indirimli)
// tutarlarla hesaplanır; giderler ve net kâr yalnızca tüm salon için verilir.
const MAX_REPORT_DAYS = 366;

interface ReportAppointment {
  employeeId: string;
  packageName: string | null;
  noShow: boolean;
  priceCents: number;
  // Randevu tutarının hizmetlere dağılımı (liste fiyatları oranında)
  services: { name: string; cents: number }[];
}

// Tahsil edilen tutarı hizmetlere liste fiyatları oranında böler (fiyat yoksa eşit); kuruş artığı son hizmete
function splitByServices(totalCents: number, lines: AppointmentLine[]) {
  const weights = lines.map((l) => l.price_cents ?? 0);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  let given = 0;
  return lines.map((l, i) => {
    const cents = i === lines.length - 1
      ? totalCents - given
      : Math.round(weightSum > 0 ? (totalCents * weights[i]) / weightSum : totalCents / lines.length);
    given += cents;
    return { name: l.service_name, cents };
  });
}

function group(items: { name: string; cents: number }[]) {
  const map = new Map<string, { count: number; cents: number }>();
  for (const item of items) {
    const g = map.get(item.name) ?? { count: 0, cents: 0 };
    g.count++;
    g.cents += item.cents;
    map.set(item.name, g);
  }
  return [...map].sort((a, b) => b[1].count - a[1].count || trCollator.compare(a[0], b[0]));
}

function stats(appointments: ReportAppointment[]) {
  const done = appointments.filter((a) => !a.noShow);
  return {
    count: done.length,
    revenue: done.reduce((sum, a) => sum + a.priceCents, 0) / 100,
    noShowCount: appointments.length - done.length,
    services: group(done.flatMap((a) => a.services)).map(([serviceName, g]) => ({
      serviceName,
      count: g.count,
      revenue: g.cents / 100,
    })),
    packages: group(done.filter((a) => a.packageName).map((a) => ({ name: a.packageName!, cents: a.priceCents }))).map(
      ([packageName, g]) => ({ packageName, count: g.count, revenue: g.cents / 100 }),
    ),
  };
}

export async function getReport(env: Env, fromParam: unknown, toParam: unknown) {
  const from = parseDate(fromParam);
  const to = parseDate(toParam);
  if (to < from) {
    throw new BusinessError("Bitiş tarihi başlangıç tarihinden önce olamaz.");
  }
  if (daysBetween(from, to) >= MAX_REPORT_DAYS) {
    throw new BusinessError("En fazla 1 yıllık rapor alınabilir.");
  }
  await generateRecurringExpenses(env);
  // Saati gelmemiş randevular henüz yapılmadığı için rapora girmez
  const [rows, expenseCents] = await Promise.all([
    queryAppointments(
      env,
      "WHERE a.start_time >= ? AND a.start_time < ? AND a.start_time < ? AND a.status <> 'CANCELLED'",
      startOfDay(from),
      startOfDay(plusDays(to, 1)),
      nowLocal(),
    ),
    totalExpensesCents(env, from, to),
  ]);
  const past: ReportAppointment[] = rows.map((a) => {
    // Fiyat kaydı olmayan randevularda hizmet fiyatlarının toplamı kullanılır
    const priceCents = a.price_cents ?? a.lines.reduce((sum, l) => sum + (l.price_cents ?? 0), 0);
    return {
      employeeId: a.employee_id,
      packageName: a.package_name,
      noShow: a.status === "NO_SHOW",
      priceCents,
      services: splitByServices(priceCents, a.lines),
    };
  });

  // Aktif çalışanların hepsi listelenir (işlemi olmayan sıfır görünür); pasif çalışan yalnızca işlemi varsa
  const employees = (await loadEmployees(env))
    .map((e) => ({
      employeeId: e.id,
      employeeName: fullName(e),
      stats: stats(past.filter((a) => a.employeeId === e.id)),
      active: e.active,
    }))
    .filter((e) => e.active || e.stats.count + e.stats.noShowCount > 0);

  const total = stats(past);
  return {
    from,
    to,
    total,
    employees,
    expenses: expenseCents / 100,
    net: (Math.round(total.revenue * 100) - expenseCents) / 100,
  };
}
