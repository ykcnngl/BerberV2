// Yönetici paneli: paketler (birden fazla hizmet tek randevuda, yöneticinin belirlediği fiyatla).
// Paket silinmez, pasife alınır: geçmiş randevular korunur, yeni randevu alınamaz.
import type { Env } from "./env";
import { BadRequest, BusinessError, NotFound } from "./errors";
import {
  type PackageRow,
  centsToPrice,
  findServices,
  packageServiceIds,
  priceToCents,
  sameName,
  trCollator,
} from "./booking";
import { nowLocal } from "./time";

const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;

const toAdminPackage = (p: PackageRow, serviceIds: string[]) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  price: centsToPrice(p.price_cents),
  active: p.is_active === 1,
  serviceIds,
});

export async function listPackages(env: Env) {
  const [{ results }, links] = await Promise.all([
    env.DB.prepare("SELECT * FROM packages").all<PackageRow>(),
    packageServiceIds(env),
  ]);
  return results
    .sort((a, b) => b.is_active - a.is_active || trCollator.compare(a.name, b.name))
    .map((p) => toAdminPackage(p, links.get(p.id) ?? []));
}

async function findPackage(env: Env, id: string) {
  const pkg = await env.DB.prepare("SELECT * FROM packages WHERE id = ?").bind(id).first<PackageRow>();
  if (!pkg) throw new NotFound("Paket bulunamadı.");
  return toAdminPackage(pkg, (await packageServiceIds(env, [id])).get(id) ?? []);
}

interface PackageRequest {
  name?: unknown;
  description?: unknown;
  serviceIds?: unknown;
  price?: unknown;
}

export async function savePackage(env: Env, id: string | null, request: PackageRequest) {
  if (id) await findPackage(env, id);
  const name = typeof request.name === "string" ? request.name.trim() : "";
  if (!name) {
    throw new BusinessError("Paket adı zorunludur.");
  }
  if (name.length > MAX_NAME) {
    throw new BusinessError(`Paket adı en fazla ${MAX_NAME} karakter olabilir.`);
  }
  const description = typeof request.description === "string" && request.description.trim() ? request.description.trim() : null;
  if (description && description.length > MAX_DESCRIPTION) {
    throw new BusinessError(`Paket içeriği en fazla ${MAX_DESCRIPTION} karakter olabilir.`);
  }
  if (!Array.isArray(request.serviceIds) || request.serviceIds.length === 0) {
    throw new BusinessError("Pakete en az bir hizmet seçilmelidir.");
  }
  if (request.serviceIds.some((s) => typeof s !== "string")) throw new BadRequest();
  const serviceIds = [...new Set(request.serviceIds as string[])];
  await findServices(env, serviceIds);
  const priceCents = priceToCents(request.price);
  if (priceCents === null) {
    throw new BusinessError("Geçerli bir paket fiyatı girin.");
  }
  const { results: all } = await env.DB.prepare("SELECT id, name FROM packages").all<{ id: string; name: string }>();
  if (all.some((p) => p.id !== id && sameName(p.name, name))) {
    throw new BusinessError("Bu isimde bir paket zaten var.");
  }

  const packageId = id ?? crypto.randomUUID();
  await env.DB.batch([
    id
      ? env.DB.prepare("UPDATE packages SET name = ?, description = ?, price_cents = ? WHERE id = ?").bind(
          name, description, priceCents, id)
      : env.DB.prepare(
          "INSERT INTO packages (id, name, description, price_cents, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
        ).bind(packageId, name, description, priceCents, nowLocal()),
    env.DB.prepare("DELETE FROM package_services WHERE package_id = ?").bind(packageId),
    ...serviceIds.map((serviceId, i) =>
      env.DB.prepare("INSERT INTO package_services (package_id, service_id, position) VALUES (?, ?, ?)").bind(
        packageId, serviceId, i),
    ),
  ]);
  return findPackage(env, packageId);
}

export async function setPackageActive(env: Env, id: string, active: boolean) {
  await findPackage(env, id);
  await env.DB.prepare("UPDATE packages SET is_active = ? WHERE id = ?").bind(active ? 1 : 0, id).run();
  return findPackage(env, id);
}
