// Cloudflare Worker: /api/v1/booking/** adreslerini karşılar; diğer tüm adreslerde frontend (FRONTEND/dist)
// sunulur (bkz. wrangler.jsonc "assets"). Site ve API aynı adreste olduğu için CORS ayarı gerekmez.
import { Hono, type Context } from "hono";
import type { AppEnv } from "./env";
import { BadRequest, HttpError, SmsError } from "./errors";
import * as booking from "./booking";
import * as admin from "./admin";
import * as gallery from "./gallery";
import * as packages from "./packages";
import * as expenses from "./expenses";
import { getVerifiedPhone, requestCode, verifyAdminPassword, verifyCode } from "./verification";
import { parseDate } from "./time";

const app = new Hono<AppEnv>().basePath("/api/v1/booking");

// SMS ile doğrulanmış müşterinin oturum anahtarı (bkz. /verification/verify)
const CUSTOMER_TOKEN_HEADER = "X-Customer-Token";
const ADMIN_HEADER = "X-Admin-Password";

async function jsonBody<T = Record<string, unknown>>(c: Context): Promise<T> {
  try {
    const body = await c.req.json();
    if (body === null || typeof body !== "object") throw new Error();
    return body as T;
  } catch {
    throw new BadRequest();
  }
}

function requiredQuery(c: Context, name: string): string {
  const value = c.req.query(name);
  if (!value) throw new BadRequest();
  return value;
}

const message = (text: string) => ({ message: text });

// --- MÜŞTERİ ---

app.get("/employees", async (c) => c.json(await booking.getActiveEmployees(c.env)));
app.get("/services", async (c) => c.json(await booking.getActiveServices(c.env)));
app.get("/packages", async (c) => c.json(await booking.getActivePackages(c.env)));

// Seçim: ?serviceIds=a,b (birden fazla hizmet) ya da ?serviceId=a ya da ?packageId=p
const selectionQuery = (c: Context): booking.SelectionInput => ({
  serviceIds: c.req.query("serviceIds")?.split(",").filter(Boolean),
  serviceId: c.req.query("serviceId"),
  packageId: c.req.query("packageId"),
});

app.get("/available-slots", async (c) =>
  c.json(
    await booking.getAvailableSlots(
      c.env,
      requiredQuery(c, "employeeId"),
      selectionQuery(c),
      parseDate(requiredQuery(c, "date")),
    ),
  ),
);

app.post("/appointments", async (c) => {
  const phone = await getVerifiedPhone(c.env, c.req.header(CUSTOMER_TOKEN_HEADER));
  await booking.createAppointment(c.env, c.executionCtx, await jsonBody(c), phone);
  return c.json(message("Randevu başarıyla oluşturuldu."));
});

app.get("/appointments", async (c) => {
  const phone = await getVerifiedPhone(c.env, c.req.header(CUSTOMER_TOKEN_HEADER));
  return c.json(await booking.getCustomerAppointments(c.env, phone));
});

app.patch("/appointments/:id/cancel", async (c) => {
  const phone = await getVerifiedPhone(c.env, c.req.header(CUSTOMER_TOKEN_HEADER));
  await booking.cancelAppointmentAsCustomer(c.env, c.req.param("id"), phone);
  return c.json(message("Randevunuz başarıyla iptal edildi."));
});

// 1) /request ile telefona kod gönderilir  2) /verify ile kod doğrulanır ve oturum anahtarı alınır
app.post("/verification/request", async (c) => {
  const body = await jsonBody(c);
  await requestCode(c.env, body.phone, c.req.header("CF-Connecting-IP") ?? null);
  return c.json(message("Doğrulama kodu telefonunuza gönderildi."));
});

app.post("/verification/verify", async (c) => {
  const body = await jsonBody(c);
  return c.json(await verifyCode(c.env, body.phone, body.code));
});

// --- GALERİ ---

app.get("/gallery", async (c) => c.json(await gallery.listGallery(c.env)));
app.get("/gallery/images/:fileName", (c) => gallery.serveImage(c.env, c.req.param("fileName")));

// --- YÖNETİCİ ---
// /admin altındaki tüm istekler (login hariç) X-Admin-Password başlığıyla doğrulanır

app.post("/admin/login", async (c) => {
  const body = await jsonBody(c);
  await verifyAdminPassword(c.env, body.password);
  return c.json(message("Giriş başarılı."));
});

app.use("/admin/*", async (c, next) => {
  if (c.req.path.endsWith("/admin/login")) return next();
  const password = c.req.header(ADMIN_HEADER);
  if (!password || !password.trim()) {
    throw new HttpError(401, "Bu işlem için yönetici girişi gerekli.");
  }
  await verifyAdminPassword(c.env, password);
  return next();
});

// Randevular
app.get("/admin/appointments", async (c) =>
  c.json(await booking.getEmployeeAppointments(c.env, requiredQuery(c, "employeeId"), parseDate(requiredQuery(c, "date")))),
);
app.patch("/admin/appointments/:id/cancel", async (c) => {
  await booking.cancelAppointmentAsAdmin(c.env, c.executionCtx, c.req.param("id"));
  return c.json(message("Randevu iptal edildi. Müşteriye SMS ile bildirildi."));
});
app.patch("/admin/appointments/:id/no-show", async (c) => {
  const body = await jsonBody(c);
  return c.json(await booking.setNoShow(c.env, c.req.param("id"), body.noShow === true));
});

// İndirim vb.: tahsil edilen tutarı düzenle (price boşsa liste fiyatına döner)
app.patch("/admin/appointments/:id/price", async (c) => {
  const body = await jsonBody(c);
  return c.json(await booking.setAppointmentPrice(c.env, c.req.param("id"), body.price, body.note));
});

// Rapor (ciro, çalışan ve hizmet bazında işlem sayıları, giderler)
app.get("/admin/report", async (c) => c.json(await admin.getReport(c.env, c.req.query("from"), c.req.query("to"))));

// Çalışanlar
app.get("/admin/employees", async (c) => c.json(await admin.listEmployees(c.env)));
app.post("/admin/employees", async (c) => c.json(await admin.saveEmployee(c.env, null, await jsonBody(c))));
app.put("/admin/employees/:id", async (c) => c.json(await admin.saveEmployee(c.env, c.req.param("id"), await jsonBody(c))));
app.patch("/admin/employees/:id/active", async (c) => {
  const body = await jsonBody(c);
  return c.json(await admin.setEmployeeActive(c.env, c.req.param("id"), body.active === true));
});

// Hizmetler
app.get("/admin/services", async (c) => c.json(await admin.listServices(c.env)));
app.post("/admin/services", async (c) => c.json(await admin.saveService(c.env, null, await jsonBody(c))));
app.put("/admin/services/:id", async (c) => c.json(await admin.saveService(c.env, c.req.param("id"), await jsonBody(c))));
app.patch("/admin/services/:id/active", async (c) => {
  const body = await jsonBody(c);
  return c.json(await admin.setServiceActive(c.env, c.req.param("id"), body.active === true));
});
app.put("/admin/services/:id/employees", async (c) => {
  const body = await jsonBody(c);
  await admin.setServiceProviders(c.env, c.req.param("id"), body.employeeIds);
  return c.json(message("Hizmeti veren ekip güncellendi."));
});

// Paketler
app.get("/admin/packages", async (c) => c.json(await packages.listPackages(c.env)));
app.post("/admin/packages", async (c) => c.json(await packages.savePackage(c.env, null, await jsonBody(c))));
app.put("/admin/packages/:id", async (c) => c.json(await packages.savePackage(c.env, c.req.param("id"), await jsonBody(c))));
app.patch("/admin/packages/:id/active", async (c) => {
  const body = await jsonBody(c);
  return c.json(await packages.setPackageActive(c.env, c.req.param("id"), body.active === true));
});

// Giderler
app.get("/admin/expenses", async (c) =>
  c.json(await expenses.listExpenses(c.env, parseDate(requiredQuery(c, "from")), parseDate(requiredQuery(c, "to")))),
);
app.post("/admin/expenses", async (c) => c.json(await expenses.saveExpense(c.env, null, await jsonBody(c))));
app.put("/admin/expenses/:id", async (c) => c.json(await expenses.saveExpense(c.env, c.req.param("id"), await jsonBody(c))));
app.delete("/admin/expenses/:id", async (c) => {
  await expenses.deleteExpense(c.env, c.req.param("id"));
  return c.json(message("Gider silindi."));
});

// Sabit aylık giderler (her ay otomatik eklenir)
app.get("/admin/recurring-expenses", async (c) => c.json(await expenses.listRecurring(c.env)));
app.post("/admin/recurring-expenses", async (c) => c.json(await expenses.saveRecurring(c.env, null, await jsonBody(c))));
app.put("/admin/recurring-expenses/:id", async (c) =>
  c.json(await expenses.saveRecurring(c.env, c.req.param("id"), await jsonBody(c))),
);
app.patch("/admin/recurring-expenses/:id/active", async (c) => {
  const body = await jsonBody(c);
  return c.json(await expenses.setRecurringActive(c.env, c.req.param("id"), body.active === true));
});
app.delete("/admin/recurring-expenses/:id", async (c) => {
  await expenses.deleteRecurring(c.env, c.req.param("id"));
  return c.json(message("Sabit gider silindi. Daha önce eklenen aylık kayıtlar giderlerde kalır."));
});

// Molalar
app.get("/admin/employees/:id/breaks", async (c) => c.json(await admin.listBreaks(c.env, c.req.param("id"))));
app.post("/admin/employees/:id/breaks", async (c) => c.json(await admin.addBreak(c.env, c.req.param("id"), await jsonBody(c))));
app.delete("/admin/breaks/:breakId", async (c) => {
  await admin.deleteBreak(c.env, c.req.param("breakId"));
  return c.json(message("Mola silindi."));
});

// İzinler
app.get("/admin/employees/:id/leaves", async (c) => c.json(await admin.listLeaves(c.env, c.req.param("id"))));
app.post("/admin/employees/:id/leaves", async (c) => c.json(await admin.addLeave(c.env, c.req.param("id"), await jsonBody(c))));
app.delete("/admin/leaves/:leaveId", async (c) => {
  await admin.deleteLeave(c.env, c.req.param("leaveId"));
  return c.json(message("İzin silindi."));
});

// Galeri
app.post("/admin/gallery", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new BadRequest();
  }
  return c.json(await gallery.uploadImage(c.env, form.get("file"), form.get("caption")));
});
app.delete("/admin/gallery/:id", async (c) => {
  await gallery.deleteImage(c.env, c.req.param("id"));
  return c.json(message("Fotoğraf silindi."));
});

// --- HATALAR ---

app.notFound((c) => c.json(message("Geçersiz istek."), 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    if (err instanceof SmsError) console.error("SMS hatası:", err.detail);
    return c.json(message(err.message), err.status);
  }
  console.error("Beklenmeyen hata", err);
  return c.json(message("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin."), 500);
});

export default {
  fetch: app.fetch,
  // Her gece 00:05'te (Türkiye) sabit aylık giderlerin günü gelenleri eklenir (bkz. wrangler.jsonc "triggers")
  async scheduled(_controller: ScheduledController, env: AppEnv["Bindings"], ctx: ExecutionContext) {
    ctx.waitUntil(expenses.generateRecurringExpenses(env));
  },
} satisfies ExportedHandler<AppEnv["Bindings"]>;
