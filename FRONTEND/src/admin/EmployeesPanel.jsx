import { useState } from "react";
import { CalendarOff, Pencil, Plus, Power, Scissors } from "lucide-react";
import { getErrorMessage } from "../api";
import { DAYS, dayLabel, formatPhoneNumber } from "../utils";
import EmployeeSchedule from "./EmployeeSchedule";

const emptyForm = { firstName: "", lastName: "", phone: "", serviceIds: [], weeklyOffDays: [], commissionRate: "" };

const inputClass =
  "w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500";

// Çalışan ekleme/düzenleme formu
function EmployeeForm({ initial, services, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  const toggle = (field, value) =>
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value],
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-700 rounded-xl p-5 space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <input
          placeholder="Ad"
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          className={inputClass}
        />
        <input
          placeholder="Soyad"
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          className={inputClass}
        />
      </div>
      <input
        type="tel"
        placeholder="Telefon (isteğe bağlı) 05XX XXX XXXX"
        value={form.phone}
        maxLength={13}
        onChange={(e) => setForm({ ...form, phone: formatPhoneNumber(e.target.value) })}
        className={inputClass}
      />
      <label className="block text-sm text-neutral-400">
        Prim oranı (%) <span className="text-neutral-500">— yaptığı hizmetlerin cirosundan; boş = prim yok</span>
        <input
          type="number"
          min={0}
          max={100}
          step="any"
          placeholder="örn. 40"
          value={form.commissionRate}
          onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
          className={`${inputClass} mt-1`}
        />
      </label>

      <div>
        <p className="text-sm font-medium text-neutral-300 mb-2">Verdiği hizmetler</p>
        <div className="flex flex-wrap gap-2">
          {/* Pasif hizmetler sadece zaten atanmışsa gösterilir (kaldırılabilsin diye) */}
          {services.filter((s) => s.active || form.serviceIds.includes(s.id)).map((s) => (
            <label
              key={s.id}
              className={`px-3 py-2 rounded-lg text-sm cursor-pointer border transition-colors ${
                form.serviceIds.includes(s.id)
                  ? "bg-emerald-600/20 border-emerald-500 text-white"
                  : "border-neutral-600 text-neutral-400"
              }`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={form.serviceIds.includes(s.id)}
                onChange={() => toggle("serviceIds", s.id)}
              />
              {s.name}
              {!s.active && " (pasif)"}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-neutral-300 mb-2">Haftalık izin günleri</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <label
              key={d.value}
              className={`px-3 py-2 rounded-lg text-sm cursor-pointer border transition-colors ${
                form.weeklyOffDays.includes(d.value)
                  ? "bg-amber-500/20 border-amber-500 text-white"
                  : "border-neutral-600 text-neutral-400"
              }`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={form.weeklyOffDays.includes(d.value)}
                onChange={() => toggle("weeklyOffDays", d.value)}
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

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

// Çalışan listesi: ekle, düzenle, pasife al, mola/izin yönet
function EmployeesPanel({ adminApi, employees, services, onChanged }) {
  const [editingId, setEditingId] = useState(null); // "new" = yeni çalışan
  const [scheduleId, setScheduleId] = useState(null);

  const serviceName = (id) => services.find((s) => s.id === id)?.name || "?";

  const handleSave = async (id, form) => {
    try {
      if (id === "new") {
        await adminApi.post("/employees", form);
      } else {
        await adminApi.put(`/employees/${id}`, form);
      }
      setEditingId(null);
      await onChanged();
    } catch (error) {
      alert(getErrorMessage(error, "Çalışan kaydedilemedi."));
    }
  };

  const handleToggleActive = async (emp) => {
    const message = emp.active
      ? `${emp.firstName} ${emp.lastName} pasife alınsın mı? Yeni randevu alınamaz, mevcut randevular silinmez.`
      : `${emp.firstName} ${emp.lastName} tekrar aktif edilsin mi?`;
    if (!window.confirm(message)) return;
    try {
      await adminApi.patch(`/employees/${emp.id}/active`, { active: !emp.active });
      await onChanged();
    } catch (error) {
      alert(getErrorMessage(error, "İşlem yapılamadı."));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-neutral-400">Çalışanlar ({employees.length})</h2>
        {editingId !== "new" && (
          <button
            onClick={() => setEditingId("new")}
            className="text-sm bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"
          >
            <Plus size={14} /> Ekle
          </button>
        )}
      </div>
      {editingId === "new" && (
        <EmployeeForm
          initial={emptyForm}
          services={services}
          onSubmit={(form) => handleSave("new", form)}
          onCancel={() => setEditingId(null)}
        />
      )}

      {employees.map((emp) =>
        editingId === emp.id ? (
          <EmployeeForm
            key={emp.id}
            initial={{
              firstName: emp.firstName,
              lastName: emp.lastName,
              phone: emp.phone ? formatPhoneNumber(emp.phone) : "",
              serviceIds: emp.serviceIds,
              weeklyOffDays: emp.weeklyOffDays,
              commissionRate: emp.commissionRate ? String(emp.commissionRate) : "",
            }}
            services={services}
            onSubmit={(form) => handleSave(emp.id, form)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div
            key={emp.id}
            className={`bg-neutral-800 border rounded-xl p-3 ${emp.active ? "border-neutral-700" : "border-neutral-800 opacity-60"}`}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white text-sm">
                  {emp.firstName} {emp.lastName}
                  {!emp.active && (
                    <span className="ml-2 text-[0.65rem] bg-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded-full">Pasif</span>
                  )}
                </h3>
                {(emp.phone || emp.commissionRate > 0) && (
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {[emp.phone && formatPhoneNumber(emp.phone), emp.commissionRate > 0 && `%${emp.commissionRate} prim`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <p className="text-xs text-neutral-400 flex items-center gap-1 mt-1 truncate">
                  <Scissors size={12} className="shrink-0" /> {emp.serviceIds.map(serviceName).join(", ") || "Hizmet yok"}
                </p>
                <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                  <CalendarOff size={12} className="shrink-0" />
                  {emp.weeklyOffDays.length ? `İzin: ${emp.weeklyOffDays.map(dayLabel).join(", ")}` : "Haftalık izin yok"}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setScheduleId(scheduleId === emp.id ? null : emp.id)}
                  className={`text-xs px-2 py-1.5 rounded-lg ${scheduleId === emp.id ? "bg-emerald-600 text-white" : "bg-neutral-700 hover:bg-neutral-600"}`}
                >
                  Mola/İzin
                </button>
                <button
                  onClick={() => setEditingId(emp.id)}
                  className="p-1.5 bg-neutral-700 hover:bg-neutral-600 rounded-lg"
                  aria-label="Düzenle"
                  title="Düzenle"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleToggleActive(emp)}
                  className={`p-1.5 rounded-lg ${
                    emp.active ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-emerald-600/20 text-emerald-400"
                  }`}
                  aria-label={emp.active ? "Pasife al" : "Aktif et"}
                  title={emp.active ? "Pasife al" : "Aktif et"}
                >
                  <Power size={14} />
                </button>
              </div>
            </div>
            {scheduleId === emp.id && <EmployeeSchedule adminApi={adminApi} employeeId={emp.id} />}
          </div>
        ),
      )}
    </div>
  );
}

export default EmployeesPanel;
