// Yönetici paneli: muhasebe raporu ve mali müşavir için Excel (CSV) dışa aktarma.
// Gelir: saati geçmiş, iptal edilmemiş, "gelmedi" olmayan randevular + kasadan girilen randevusuz satışlar
// (hizmet ve ürün). Gider: girilen ve sabit aylık giderler + çalışan primleri + kart (POS) komisyonu.
// Tutarlar kuruş olarak hesaplanır, yanıtta TL'ye çevrilir.
import type { Env } from "./env";
import { BusinessError } from "./errors";
import { type AppointmentLine, type AppointmentRow, fullName, loadEmployees, queryAppointments, serviceLabel, trCollator } from "./booking";
import { CATEGORIES, type Category, expenseRows, generateRecurringExpenses } from "./expenses";
import { type PaymentMethod, type Sale, getSettings, querySales } from "./sales";
import { daysBetween, endOfDay, nowLocal, parseDate, plusDays, startOfDay } from "./time";

const MAX_REPORT_DAYS = 366;

// Rapordaki tek hizmet işlemi: randevu ya da randevusuz satışın hizmet kısmı
interface ServiceTransaction {
  time: string;
  employeeId: string | null;
  packageName: string | null;
  noShow: boolean;
  walkIn: boolean;
  priceCents: number;
  // Tutarın hizmetlere dağılımı (liste fiyatları oranında)
  services: { name: string; cents: number }[];
}

// Tahsil edilen tutarı hizmetlere liste fiyatları oranında böler (fiyat yoksa eşit); kuruş artığı son hizmete
export function splitByServices(totalCents: number, lines: AppointmentLine[]) {
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

function group(items: { name: string; cents: number; count?: number }[]) {
  const map = new Map<string, { count: number; cents: number }>();
  for (const item of items) {
    const g = map.get(item.name) ?? { count: 0, cents: 0 };
    g.count += item.count ?? 1;
    g.cents += item.cents;
    map.set(item.name, g);
  }
  return [...map].sort((a, b) => b[1].count - a[1].count || trCollator.compare(a[0], b[0]));
}

function stats(transactions: ServiceTransaction[]) {
  const done = transactions.filter((t) => !t.noShow);
  return {
    count: done.length,
    walkInCount: done.filter((t) => t.walkIn).length,
    revenue: done.reduce((sum, t) => sum + t.priceCents, 0) / 100,
    noShowCount: transactions.length - done.length,
    services: group(done.flatMap((t) => t.services)).map(([serviceName, g]) => ({
      serviceName,
      count: g.count,
      revenue: g.cents / 100,
    })),
    packages: group(done.filter((t) => t.packageName).map((t) => ({ name: t.packageName!, cents: t.priceCents }))).map(
      ([packageName, g]) => ({ packageName, count: g.count, revenue: g.cents / 100 }),
    ),
  };
}

// Fiyat kaydı olmayan randevularda hizmet fiyatlarının toplamı kullanılır
export const appointmentCents = (a: AppointmentRow) =>
  a.price_cents ?? a.lines.reduce((sum, l) => sum + (l.price_cents ?? 0), 0);

const saleServiceCents = (s: Sale) =>
  s.items.filter((i) => i.kind === "SERVICE").reduce((sum, i) => sum + i.unit_price_cents * i.quantity, 0);

const percentOf = (cents: number, rate: number) => Math.round((cents * rate) / 100);

export function parseRange(fromParam: unknown, toParam: unknown) {
  const from = parseDate(fromParam);
  const to = parseDate(toParam);
  if (to < from) {
    throw new BusinessError("Bitiş tarihi başlangıç tarihinden önce olamaz.");
  }
  if (daysBetween(from, to) >= MAX_REPORT_DAYS) {
    throw new BusinessError("En fazla 1 yıllık rapor alınabilir.");
  }
  return { from, to };
}

// Rapor ve dışa aktarmanın ortak verisi
// includeFixed = false: sabit aylık giderlerden (kira, maaş, stopaj...) eklenen kayıtlar alınmaz. Bu giderler ayın
// tek bir gününe yazıldığı için günlük/haftalık raporda düşülmez, yalnızca aylık raporda düşülür.
export async function loadPeriod(env: Env, from: string, to: string, includeFixed = true) {
  await generateRecurringExpenses(env);
  // Saati gelmemiş randevular henüz yapılmadığı için rapora girmez
  const [appointments, sales, expenses, employees, settings] = await Promise.all([
    queryAppointments(
      env,
      "WHERE a.start_time >= ? AND a.start_time < ? AND a.start_time < ? AND a.status <> 'CANCELLED' ORDER BY a.start_time",
      startOfDay(from),
      startOfDay(plusDays(to, 1)),
      nowLocal(),
    ),
    querySales(env, startOfDay(from), endOfDay(to)),
    expenseRows(env, from, to).then((rows) => (includeFixed ? rows : rows.filter((e) => e.recurring_id === null))),
    loadEmployees(env),
    getSettings(env),
  ]);
  return { appointments, sales, expenses, employees, cardRate: settings.cardCommissionRate, vatRate: settings.vatRate };
}

type Period = Awaited<ReturnType<typeof loadPeriod>>;

export function buildReport({ appointments, sales, expenses, employees, cardRate, vatRate }: Period) {
  const transactions: ServiceTransaction[] = [
    ...appointments.map((a) => {
      const priceCents = appointmentCents(a);
      return {
        time: a.start_time,
        employeeId: a.employee_id,
        packageName: a.package_name,
        noShow: a.status === "NO_SHOW",
        walkIn: false,
        priceCents,
        services: splitByServices(priceCents, a.lines),
      };
    }),
    ...sales
      .filter((s) => s.items.some((i) => i.kind === "SERVICE"))
      .map((s) => ({
        time: s.sale_time,
        employeeId: s.employee_id,
        packageName: null,
        noShow: false,
        walkIn: true,
        priceCents: saleServiceCents(s),
        services: s.items
          .filter((i) => i.kind === "SERVICE")
          .map((i) => ({ name: i.name, cents: i.unit_price_cents * i.quantity })),
      })),
  ];

  // Ürün satışları
  const productLines = sales.flatMap((s) => s.items.filter((i) => i.kind === "PRODUCT"));
  const productCents = productLines.reduce((sum, i) => sum + i.unit_price_cents * i.quantity, 0);
  const products = group(productLines.map((i) => ({ name: i.name, cents: i.unit_price_cents * i.quantity, count: i.quantity }))).map(
    ([productName, g]) => ({ productName, count: g.count, revenue: g.cents / 100 }),
  );

  // Tahsilatlar: her randevu ve kasa satışı bir ödeme. Ödemesi işaretlenmemiş randevular "UNKNOWN".
  // Kasa satışı tüm tutarıyla (ürünler dahil) satışı yapan çalışana yazılır; yalnız ürün satışında çalışan olmayabilir.
  const receipts: { employeeId: string | null; method: PaymentMethod | "UNKNOWN"; cents: number }[] = [
    ...appointments
      .filter((a) => a.status !== "NO_SHOW")
      .map((a) => ({ employeeId: a.employee_id, method: a.payment_method ?? ("UNKNOWN" as const), cents: appointmentCents(a) })),
    ...sales.map((s) => ({ employeeId: s.employee_id, method: s.payment_method, cents: s.total_cents })),
  ];
  const payments: Record<PaymentMethod | "UNKNOWN", number> = { CASH: 0, CARD: 0, TRANSFER: 0, UNKNOWN: 0 };
  for (const r of receipts) payments[r.method] += r.cents;
  const posFeeCents = percentOf(payments.CARD, cardRate);

  // Çalışanın ödeme yöntemine göre işlem sayısı ve tutarı
  const paymentsOf = (employeeId: string) => {
    const of = (method: PaymentMethod | "UNKNOWN") => {
      const mine = receipts.filter((r) => r.employeeId === employeeId && r.method === method);
      return { count: mine.length, amount: mine.reduce((sum, r) => sum + r.cents, 0) / 100 };
    };
    return { cash: of("CASH"), card: of("CARD"), transfer: of("TRANSFER"), unknown: of("UNKNOWN") };
  };

  // Giderler kategoriye göre
  const expenseCents = expenses.reduce((sum, e) => sum + e.amount_cents, 0);
  const expenseCategories = (Object.keys(CATEGORIES) as Category[])
    .map((category) => ({
      category,
      label: CATEGORIES[category],
      amount: expenses.filter((e) => e.category === category).reduce((sum, e) => sum + e.amount_cents, 0) / 100,
    }))
    .filter((c) => c.amount > 0);

  // Çalışanlar: ciro, prim (hizmet cirosu × prim oranı), bağlı maaş giderleri ve hakediş.
  // Aktif çalışanların hepsi listelenir; pasif çalışan yalnızca işlemi veya gideri varsa.
  const employeeReports = employees
    .map((e) => {
      const s = stats(transactions.filter((t) => t.employeeId === e.id));
      const commissionCents = percentOf(Math.round(s.revenue * 100), e.commissionRate);
      const salaryCents = expenses.filter((x) => x.employee_id === e.id).reduce((sum, x) => sum + x.amount_cents, 0);
      return {
        employeeId: e.id,
        employeeName: fullName(e),
        active: e.active,
        stats: s,
        commissionRate: e.commissionRate,
        commission: commissionCents / 100,
        salary: salaryCents / 100,
        payable: (commissionCents + salaryCents) / 100,
        payments: paymentsOf(e.id),
      };
    })
    .filter((e) => e.active || e.stats.count + e.stats.noShowCount > 0 || e.salary > 0);
  const commissionCents = employeeReports.reduce((sum, e) => sum + Math.round(e.commission * 100), 0);

  const total = stats(transactions);
  const serviceCents = Math.round(total.revenue * 100);
  const revenueCents = serviceCents + productCents;
  // Ücretler KDV dahil alınır: içindeki KDV = gelir × oran / (100 + oran). Alışlardaki (indirilecek) KDV düşülmez,
  // bu yüzden kesin ödenecek KDV mali müşavirin hesabıdır; burada net kârı olduğundan yüksek göstermemek için düşülür.
  const vatCents = Math.round((revenueCents * vatRate) / (100 + vatRate));
  return {
    total,
    employees: employeeReports,
    revenue: { services: serviceCents / 100, products: productCents / 100, total: revenueCents / 100 },
    products,
    payments: {
      cash: payments.CASH / 100,
      card: payments.CARD / 100,
      transfer: payments.TRANSFER / 100,
      unknown: payments.UNKNOWN / 100,
    },
    cardCommissionRate: cardRate,
    posFee: posFeeCents / 100,
    vatRate,
    vat: vatCents / 100,
    commissions: commissionCents / 100,
    expenses: expenseCents / 100,
    expenseCategories,
    net: (revenueCents - vatCents - expenseCents - commissionCents - posFeeCents) / 100,
  };
}

export async function getReport(env: Env, fromParam: unknown, toParam: unknown, includeFixed = true) {
  const { from, to } = parseRange(fromParam, toParam);
  return { from, to, fixedExpensesIncluded: includeFixed, ...buildReport(await loadPeriod(env, from, to, includeFixed)) };
}

// --- EXCEL (CSV) DIŞA AKTARMA ---
// Türkçe Excel'in doğrudan açabilmesi için: UTF-8 BOM, ";" ayraç, ondalık virgül.

const PAYMENT_LABELS: Record<PaymentMethod, string> = { CASH: "Nakit", CARD: "Kart", TRANSFER: "IBAN/Havale" };

// Metin hücreleri =, +, -, @ ile başlıyorsa Excel formül olarak çalıştırmasın diye başına ' eklenir
// (müşteri adları siteden geldiği için)
const csvCell = (value: string | number | null) => {
  let text = value === null ? "" : typeof value === "number" ? value.toFixed(2).replace(".", ",") : value;
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csvRow = (cells: (string | number | null)[]) => cells.map(csvCell).join(";");
const formatDate = (date: string) => date.slice(0, 10).split("-").reverse().join(".");
const trNumber = (n: number) => String(n).replace(".", ",");

export async function exportCsv(env: Env, fromParam: unknown, toParam: unknown, includeFixed = true) {
  const { from, to } = parseRange(fromParam, toParam);
  const period = await loadPeriod(env, from, to, includeFixed);
  const report = buildReport(period);
  const employeeName = (id: string | null) => {
    const e = period.employees.find((x) => x.id === id);
    return e ? fullName(e) : "";
  };

  const header = ["Tarih", "Saat", "Tür", "Açıklama", "Çalışan", "Ödeme", "Gelir (TL)", "Gider (TL)"];
  // time: "2026-10-14T15:30:00" ya da saatsiz kayıtlarda "2026-10-14" (aynı günün sonuna sıralanır)
  type Entry = { time: string; cells: (string | number | null)[] };
  const entries: Entry[] = [];

  for (const a of period.appointments) {
    if (a.status === "NO_SHOW") continue;
    entries.push({
      time: a.start_time,
      cells: [
        "Randevu",
        `${serviceLabel(a)} - ${a.customer_full_name}${a.price_note ? ` (${a.price_note})` : ""}`,
        a.employee_name,
        a.payment_method ? PAYMENT_LABELS[a.payment_method] : "Belirtilmemiş",
        appointmentCents(a) / 100,
        null,
      ],
    });
  }
  for (const s of period.sales) {
    const label = s.items.map((i) => (i.quantity > 1 ? `${i.name} x${i.quantity}` : i.name)).join(" + ");
    entries.push({
      time: s.sale_time,
      cells: ["Kasa satışı", s.note ? `${label} (${s.note})` : label, s.employee_name ?? "", PAYMENT_LABELS[s.payment_method], s.total_cents / 100, null],
    });
  }
  for (const e of period.expenses) {
    entries.push({
      time: e.expense_date,
      cells: [`Gider: ${CATEGORIES[e.category] ?? e.category}`, e.description, employeeName(e.employee_id), "", null, e.amount_cents / 100],
    });
  }
  // Dönem sonu hesaplanan giderler
  for (const e of report.employees) {
    if (e.commission > 0) {
      entries.push({ time: to, cells: ["Prim", `%${trNumber(e.commissionRate)} hizmet primi`, e.employeeName, "", null, e.commission] });
    }
  }
  if (report.posFee > 0) {
    entries.push({ time: to, cells: ["POS komisyonu", `Kart tahsilatı x %${trNumber(report.cardCommissionRate)}`, "", "", null, report.posFee] });
  }

  const sortKey = (t: string) => (t.length === 10 ? `${t}T99` : t);
  entries.sort((a, b) => sortKey(a.time).localeCompare(sortKey(b.time)));
  const rows = entries.map((e) => [formatDate(e.time), e.time.length > 10 ? e.time.slice(11, 16) : "", ...e.cells]);

  const summary = [
    [],
    ["ÖZET", `${formatDate(from)} - ${formatDate(to)}`],
    ["Hizmet cirosu", report.revenue.services],
    ["Ürün satışı", report.revenue.products],
    ["Toplam gelir", report.revenue.total],
    ["Giderler", report.expenses],
    ["Primler", report.commissions],
    ["POS komisyonu", report.posFee],
    ["KDV (gelirin içindeki)", report.vat],
    ["Net kâr", report.net],
    [],
    ["Nakit", report.payments.cash],
    ["Kart", report.payments.card],
    ["IBAN/Havale", report.payments.transfer],
    ["Ödemesi belirtilmemiş", report.payments.unknown],
  ];

  const csv = "﻿" + [header, ...rows, ...summary].map(csvRow).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="muhasebe_${from}_${to}.csv"`,
    },
  });
}
