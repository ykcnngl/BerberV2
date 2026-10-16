import { useEffect, useState } from "react";
import { Clock, Pencil, Plus, Power } from "lucide-react";
import { getErrorMessage } from "../api";
import { formatMoney } from "../utils";

const emptyForm = { name: "", description: "", serviceIds: [], price: "" };

const inputClass =
  "w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500";

// Paket ekleme/düzenleme formu: ad, içerik, hizmetler ve paket fiyatı
function PackageForm({ initial, services, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  // Pasif hizmetler sadece pakette zaten varsa gösterilir (çıkarılabilsin diye)
  const selectable = services.filter((s) => s.active || form.serviceIds.includes(s.id));
  const chosen = services.filter((s) => form.serviceIds.includes(s.id));
  const separatePrice = chosen.reduce((sum, s) => sum + (s.price || 0), 0);
  const duration = chosen.reduce((sum, s) => sum + s.durationMinutes, 0);

  const toggle = (id) =>
    setForm({
      ...form,
      serviceIds: form.serviceIds.includes(id) ? form.serviceIds.filter((x) => x !== id) : [...form.serviceIds, id],
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSubmit({ ...form, price: form.price === "" ? null : form.price });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-700 rounded-xl p-5 space-y-4">
      <input
        placeholder="Paket adı (örn. VIP Bakım)"
        value={form.name}
        maxLength={80}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className={inputClass}
      />
      <textarea
        placeholder="Paket içeriği / açıklaması (sitede görünür)"
        value={form.description}
        maxLength={500}
        rows={3}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className={inputClass}
      />
      <div>
        <p className="text-sm text-neutral-400 mb-2">Pakete dahil hizmetler</p>
        <div className="flex flex-wrap gap-2">
          {selectable.map((s) => {
            const selected = form.serviceIds.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                  selected ? "bg-emerald-600/20 border-emerald-500 text-white" : "border-neutral-600 text-neutral-400 hover:text-white"
                }`}
              >
                {s.name}
                {!s.active && " (pasif)"}
              </button>
            );
          })}
        </div>
        {chosen.length > 0 && (
          <p className="text-xs text-neutral-500 mt-2">
            Toplam süre {duration} dk · hizmetler ayrı ayrı {formatMoney(separatePrice)}
          </p>
        )}
      </div>
      <label className="block text-sm text-neutral-400">
        Paket fiyatı (₺) <span className="text-neutral-500">— sitede gösterilir</span>
        <input
          type="number"
          min={0}
          step="any"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          className={`${inputClass} mt-1`}
        />
      </label>
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-neutral-400 hover:text-white">
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 text-white font-semibold px-5 py-2 rounded-lg"
        >
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </form>
  );
}

// Paketler: birden fazla hizmet tek randevuda, özel fiyatla. Müşteri randevu alırken paketi seçebilir.
function PackagesPanel({ adminApi, services, employees }) {
  const [packages, setPackages] = useState([]);
  const [editingId, setEditingId] = useState(null); // "new" = yeni paket

  const load = async () => {
    try {
      const response = await adminApi.get("/packages");
      setPackages(response.data);
    } catch (error) {
      alert(getErrorMessage(error, "Paketler yüklenemedi."));
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (id, form) => {
    try {
      if (id === "new") {
        await adminApi.post("/packages", form);
      } else {
        await adminApi.put(`/packages/${id}`, form);
      }
      setEditingId(null);
      await load();
    } catch (error) {
      alert(getErrorMessage(error, "Paket kaydedilemedi."));
    }
  };

  const handleToggleActive = async (pkg) => {
    const message = pkg.active
      ? `${pkg.name} pasife alınsın mı? Sitede görünmez ve yeni randevu alınamaz, mevcut randevular silinmez.`
      : `${pkg.name} tekrar aktif edilsin mi?`;
    if (!window.confirm(message)) return;
    try {
      await adminApi.patch(`/packages/${pkg.id}/active`, { active: !pkg.active });
      await load();
    } catch (error) {
      alert(getErrorMessage(error, "İşlem yapılamadı."));
    }
  };

  const serviceName = (id) => services.find((s) => s.id === id)?.name || "?";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-400">Birden fazla hizmet tek randevuda, özel fiyatla. Sitede fiyatıyla görünür.</p>
        {editingId !== "new" && (
          <button
            onClick={() => setEditingId("new")}
            className="text-sm bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
          >
            <Plus size={14} /> Ekle
          </button>
        )}
      </div>
      {editingId === "new" && (
        <PackageForm initial={emptyForm} services={services} onSubmit={(form) => handleSave("new", form)} onCancel={() => setEditingId(null)} />
      )}

      {packages.length === 0 && editingId !== "new" && (
        <p className="text-center text-neutral-500 py-6 bg-neutral-800 rounded-xl text-sm">Henüz paket yok.</p>
      )}

      {packages.map((pkg) => {
        if (editingId === pkg.id) {
          return (
            <PackageForm
              key={pkg.id}
              initial={{
                name: pkg.name,
                description: pkg.description || "",
                serviceIds: pkg.serviceIds,
                price: String(pkg.price),
              }}
              services={services}
              onSubmit={(form) => handleSave(pkg.id, form)}
              onCancel={() => setEditingId(null)}
            />
          );
        }
        const pkgServices = services.filter((s) => pkg.serviceIds.includes(s.id));
        const duration = pkgServices.reduce((sum, s) => sum + s.durationMinutes, 0);
        const inactiveService = pkgServices.some((s) => !s.active);
        const hasProvider = employees.some((e) => e.active && pkg.serviceIds.every((id) => e.serviceIds.includes(id)));
        return (
          <div
            key={pkg.id}
            className={`bg-neutral-800 border rounded-xl p-3 ${pkg.active ? "border-neutral-700" : "border-neutral-800 opacity-60"}`}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white text-sm">
                  {pkg.name}
                  {!pkg.active && <span className="ml-2 text-[0.65rem] bg-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded-full">Pasif</span>}
                  <span className="ml-2 text-emerald-400">{formatMoney(pkg.price)}</span>
                </h3>
                <p className="text-xs text-neutral-300 mt-0.5">{pkg.serviceIds.map(serviceName).join(" + ")}</p>
                <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                  <Clock size={12} /> {duration} dk{pkg.description && ` · ${pkg.description}`}
                </p>
                {pkg.active && inactiveService && (
                  <p className="text-xs text-amber-400 mt-1">Paketteki bir hizmet pasif; paket sitede görünmez.</p>
                )}
                {pkg.active && !inactiveService && !hasProvider && (
                  <p className="text-xs text-amber-400 mt-1">Bu hizmetlerin hepsini veren aktif ekip üyesi yok.</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setEditingId(pkg.id)}
                  className="p-1.5 bg-neutral-700 hover:bg-neutral-600 rounded-lg"
                  aria-label="Düzenle"
                  title="Düzenle"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleToggleActive(pkg)}
                  className={`p-1.5 rounded-lg ${
                    pkg.active ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-emerald-600/20 text-emerald-400"
                  }`}
                  aria-label={pkg.active ? "Pasife al" : "Aktif et"}
                  title={pkg.active ? "Pasife al" : "Aktif et"}
                >
                  <Power size={14} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default PackagesPanel;
