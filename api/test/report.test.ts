import { describe, expect, it } from "vitest";
import { buildReport, splitByServices } from "../src/report";
import type { AppointmentRow, Employee } from "../src/booking";
import { type ExpenseRow, splitWithholding } from "../src/expenses";
import type { Sale } from "../src/sales";

const employee = (id: string, commissionRate: number): Employee => ({
  id,
  firstName: id,
  lastName: "Test",
  phone: null,
  active: true,
  serviceIds: [],
  weeklyOffDays: [],
  commissionRate,
});

const appointment = (over: Partial<AppointmentRow>): AppointmentRow => ({
  id: crypto.randomUUID(),
  start_time: "2026-10-14T10:00:00",
  end_time: "2026-10-14T10:40:00",
  status: "CONFIRMED",
  price_cents: 50000,
  list_price_cents: 50000,
  price_note: null,
  package_name: null,
  payment_method: null,
  customer_full_name: "Müşteri",
  customer_phone: "0555 444 3322",
  employee_id: "ali",
  employee_name: "ali Test",
  lines: [{ service_name: "Saç Kesimi", price_cents: 50000 }],
  ...over,
});

const expense = (amount_cents: number, category: ExpenseRow["category"], employee_id: string | null = null): ExpenseRow => ({
  id: crypto.randomUUID(),
  expense_date: "2026-10-14",
  description: "x",
  amount_cents,
  recurring_id: null,
  category,
  employee_id,
  created_at: "2026-10-14T00:00:00",
});

const sale: Sale = {
  id: "s1",
  sale_time: "2026-10-14T12:00:00",
  employee_id: "ali",
  employee_name: "ali Test",
  payment_method: "CASH",
  total_cents: 90000,
  note: null,
  items: [
    { sale_id: "s1", kind: "SERVICE", item_id: "x", name: "Sakal", quantity: 1, unit_price_cents: 40000 },
    { sale_id: "s1", kind: "PRODUCT", item_id: "p", name: "Wax", quantity: 2, unit_price_cents: 25000 },
  ],
};

describe("rapor", () => {
  const report = buildReport({
    appointments: [
      appointment({ payment_method: "CARD" }),
      appointment({ payment_method: "CARD", price_cents: 30000, employee_id: "ayse" }), // indirimli
      appointment({}), // ödeme girilmedi
      appointment({ status: "NO_SHOW", payment_method: "CASH" }), // gelmedi: ciroya ve kasaya girmez
    ],
    sales: [sale],
    expenses: [expense(100000, "RENT"), expense(500000, "SALARY", "ali")],
    employees: [employee("ali", 40), employee("ayse", 0)],
    cardRate: 2.5,
    vatRate: 0,
  });

  it("geliri hizmet ve ürün olarak ayırır", () => {
    // randevular 500 + 300 + 500, kasada hizmet 400, ürün 2 x 250
    expect(report.revenue).toEqual({ services: 1700, products: 500, total: 2200 });
    expect(report.total.count).toBe(4);
    expect(report.total.walkInCount).toBe(1);
    expect(report.total.noShowCount).toBe(1);
    expect(report.products).toEqual([{ productName: "Wax", count: 2, revenue: 500 }]);
  });

  it("tahsilatı ödeme yöntemine göre verir, POS komisyonunu kart tutarından hesaplar", () => {
    expect(report.payments).toEqual({ cash: 900, card: 800, transfer: 0, unknown: 500 });
    expect(report.posFee).toBe(20); // 800 x %2,5
  });

  it("çalışan primi ve hakedişi", () => {
    const ali = report.employees.find((e) => e.employeeId === "ali")!;
    expect(ali.stats.revenue).toBe(1400); // 500 + 500 + 400 (gelmedi hariç)
    expect(ali.commission).toBe(560); // %40
    expect(ali.salary).toBe(5000);
    expect(ali.payable).toBe(5560);
    expect(report.employees.find((e) => e.employeeId === "ayse")!.commission).toBe(0);
  });

  it("çalışan bazında ödeme yöntemine göre işlem sayısı ve tutar", () => {
    const ali = report.employees.find((e) => e.employeeId === "ali")!;
    expect(ali.payments).toEqual({
      cash: { count: 1, amount: 900 }, // kasa satışı (ürünler dahil)
      card: { count: 1, amount: 500 },
      transfer: { count: 0, amount: 0 },
      unknown: { count: 1, amount: 500 }, // gelmedi olan sayılmaz
    });
    expect(report.employees.find((e) => e.employeeId === "ayse")!.payments.card).toEqual({ count: 1, amount: 300 });
  });

  it("net kâr = gelir - gider - prim - POS", () => {
    expect(report.expenses).toBe(6000);
    expect(report.expenseCategories.map((c) => c.category)).toEqual(["RENT", "SALARY"]);
    expect(report.net).toBe(2200 - 6000 - 560 - 20);
  });

  it("indirimli tutarı hizmetlere liste fiyatı oranında böler, kuruş kaybolmaz", () => {
    const parts = splitByServices(10000, [
      { service_name: "A", price_cents: 100 },
      { service_name: "B", price_cents: 200 },
    ]);
    expect(parts.map((p) => p.cents)).toEqual([3333, 6667]);
  });
});

describe("vergiler", () => {
  it("KDV dahil gelirin içindeki KDV'yi ayırır ve net kârdan düşer", () => {
    const report = buildReport({
      appointments: [appointment({ price_cents: 120000, payment_method: "CASH" })],
      sales: [],
      expenses: [],
      employees: [employee("ali", 0)],
      cardRate: 0,
      vatRate: 20,
    });
    expect(report.vat).toBe(200); // 1200 TL'nin içinde %20 KDV: 1200 x 20 / 120
    expect(report.net).toBe(1000);
  });

  it("brüt kirayı net kira ve stopaja böler, toplam brüte eşit kalır", () => {
    expect(splitWithholding(2500000, 20)).toEqual({ net: 2000000, withholding: 500000 });
    expect(splitWithholding(1000001, 20)).toEqual({ net: 800001, withholding: 200000 });
    expect(splitWithholding(500000, 0)).toEqual({ net: 500000, withholding: 0 });
  });
});
