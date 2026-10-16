import { useEffect, useState } from "react";
import { Pencil, Percent, Plus, Power, Repeat, Trash2 } from "lucide-react";
import { getErrorMessage } from "../api";
import { EXPENSE_CATEGORIES, categoryLabel, formatDate, formatMoney, getLocalDateStr } from "../utils";

const inputClass =
  "bg-neutral-900 border border-neutral-600 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-emerald-500 [color-scheme:dark]";

const iconButton = "p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors";

// Kategori; "Maaş / Personel" seçilirse gider bir çalışana bağlanabilir (raporda hakedişinde görünür)
function CategoryFields({ form, setForm, employees }) {
  return (
    <>
      <select
        value={form.category}
        onChange={(e) => setForm({ ...form, category: e.target.value, employeeId: e.target.value === "SALARY" ? form.employeeId : "" })}
        className={inputClass}
        aria-label="Kategori"
      >
        {EXPENSE_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      {form.category === "SALARY" && (
        <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className={inputClass} aria-label="Çalışan">
          <option value="">Çalışan seçin (isteğe bağlı)</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.firstName} {e.lastName}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

// Tek gider: tarih, açıklama, tutar, kategori
function ExpenseForm({ initial, employees, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSubmit(form);
        setSaving(false);
      }}
      className="flex flex-wrap gap-2 items-center bg-neutral-900 border border-neutral-700 rounded-lg p-3"
    >
      <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputClass} />
      <input
        placeholder="Açıklama (örn. Malzeme alımı)"
        value={form.description}
        maxLength={120}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className={`${inputClass} flex-1 min-w-40`}
      />
      <input
        type="number"
        min={0}
        step="any"
        placeholder="Tutar ₺"
        value={form.amount}
        onChange={(e) => setForm({ ...form, amount: e.target.value })}
        className={`${inputClass} w-28`}
      />
      <CategoryFields form={form} setForm={setForm} employees={employees} />
      <div className="flex gap-2 ml-auto">
        <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 text-neutral-400 hover:text-white">
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={saving || !form.description.trim() || !form.amount}
          className="text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 text-white px-3 py-1.5 rounded-lg"
        >
          Kaydet
        </button>
      </div>
    </form>
  );
}

// Sabit aylık gider: açıklama, tutar, kategori, ayın kaçında eklenecek
function RecurringForm({ initial, employees, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSubmit(form);
        setSaving(false);
      }}
      className="flex flex-wrap gap-2 items-center bg-neutral-900 border border-neutral-700 rounded-lg p-3"
    >
      <input
        placeholder="Açıklama (örn. Dükkan kirası)"
        value={form.description}
        maxLength={120}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className={`${inputClass} flex-1 min-w-40`}
      />
      <input
        type="number"
        min={0}
        step="any"
        placeholder="Tutar ₺"
        value={form.amount}
        onChange={(e) => setForm({ ...form, amount: e.target.value })}
        className={`${inputClass} w-28`}
      />
      <label className="text-sm text-neutral-400 flex items-center gap-2">
        Her ayın
        <input
          type="number"
          min={1}
          max={31}
          value={form.dayOfMonth}
          onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })}
          className={`${inputClass} w-16`}
        />
        . günü
      </label>
      <CategoryFields form={form} setForm={setForm} employees={employees} />
      {form.category === "RENT" && (
        <label className="w-full text-sm text-neutral-400 flex flex-wrap items-center gap-2">
          Stopaj %
          <input
            type="number"
            min={0}
            max={100}
            step="any"
            placeholder="örn. 20"
            value={form.withholdingRate}
            onChange={(e) => setForm({ ...form, withholdingRate: e.target.value })}
            className={`${inputClass} w-20`}
          />
          <span className="text-xs text-neutral-500 flex-1 min-w-48">
            Şahıstan kiralıksa: tutar <b>brüt</b> kiradır; her ay net kira ve stopaj ayrı gider olarak eklenir.
          </span>
          {Number(form.withholdingRate) > 0 && Number(form.amount) > 0 && (
            <span className="w-full text-xs text-neutral-300">
              Ev sahibine: {formatMoney(form.amount - Math.round(form.amount * form.withholdingRate) / 100)} · Vergi dairesine:{" "}
              {formatMoney(Math.round(form.amount * form.withholdingRate) / 100)}
            </span>
          )}
        </label>
      )}
      <div className="flex gap-2 ml-auto">
        <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 text-neutral-400 hover:text-white">
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={saving || !form.description.trim() || !form.amount || !form.dayOfMonth}
          className="text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 text-white px-3 py-1.5 rounded-lg"
        >
          Kaydet
        </button>
      </div>
    </form>
  );
}

const RATE_FIELDS = [
  { name: "cardCommissionRate", label: "POS komisyonu (%)", placeholder: "örn. 2,5", hint: "Kartla alınan ödemelerden düşülür" },
  { name: "vatRate", label: "KDV (%)", placeholder: "basit usulde boş", hint: "Ücretlerin içindeki KDV ayrılır" },
];

const toForm = (data) => Object.fromEntries(RATE_FIELDS.map(({ name }) => [name, data[name] ? String(data[name]) : ""]));

// Vergi ve komisyon oranları: rapor bu oranlarla POS komisyonunu ve gelirin içindeki KDV'yi hesaplar
function RateSettings({ adminApi, onChanged }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    adminApi
      .get("/settings")
      .then((response) => {
        setForm(toForm(response.data));
        setSaved(toForm(response.data));
      })
      .catch((error) => alert(getErrorMessage(error, "Ayarlar yüklenemedi.")));
  }, [adminApi]);

  const save = async (e) => {
    e.preventDefault();
    try {
      const response = await adminApi.put("/settings", form);
      setForm(toForm(response.data));
      setSaved(toForm(response.data));
      onChanged();
    } catch (error) {
      alert(getErrorMessage(error, "Ayar kaydedilemedi."));
    }
  };

  if (!form) return null;
  const changed = RATE_FIELDS.some(({ name }) => form[name] !== saved[name]);

  return (
    <form onSubmit={save} className="bg-neutral-800 rounded-xl p-3 border border-neutral-700 space-y-2 text-sm">
      <h2 className="font-semibold text-white flex items-center gap-2">
        <Percent size={16} /> Vergi ve Komisyon Oranları
      </h2>
      <div className="grid sm:grid-cols-2 gap-2">
        {RATE_FIELDS.map(({ name, label, placeholder, hint }) => (
          <label key={name} className="text-neutral-300">
            {label}
            <input
              type="number"
              min={0}
              max={100}
              step="any"
              placeholder={placeholder}
              value={form[name]}
              onChange={(e) => setForm({ ...form, [name]: e.target.value })}
              className={`${inputClass} w-full mt-1`}
            />
            <span className="block text-xs text-neutral-500 mt-0.5">{hint}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <p className="text-xs text-neutral-500 flex-1">Oranları mali müşavirinize teyit ettirin.</p>
        {changed && (
          <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg">
            Kaydet
          </button>
        )}
      </div>
    </form>
  );
}

// Rapordaki giderler: seçili tarih aralığının giderleri ve her ay otomatik eklenen sabit giderler.
// onChanged: rapor (gider toplamı, net) yeniden yüklensin diye çağrılır.
function ExpensesSection({ adminApi, employees, from, to, onChanged }) {
  const [expenses, setExpenses] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [editingId, setEditingId] = useState(null); // gider: "new" | id
  const [editingRecurringId, setEditingRecurringId] = useState(null); // sabit gider: "new" | id

  const loadExpenses = async () => {
    try {
      const response = await adminApi.get("/expenses", { params: { from, to } });
      setExpenses(response.data);
    } catch (error) {
      alert(getErrorMessage(error, "Giderler yüklenemedi."));
    }
  };

  const loadRecurring = async () => {
    try {
      const response = await adminApi.get("/recurring-expenses");
      setRecurring(response.data);
    } catch (error) {
      alert(getErrorMessage(error, "Sabit giderler yüklenemedi."));
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRecurring();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    await Promise.all([loadExpenses(), loadRecurring()]);
    onChanged();
  };

  const run = async (action, fallback) => {
    try {
      await action();
      await refresh();
      return true;
    } catch (error) {
      alert(getErrorMessage(error, fallback));
      return false;
    }
  };

  const saveExpense = async (id, form) => {
    const ok = await run(
      () => (id === "new" ? adminApi.post("/expenses", form) : adminApi.put(`/expenses/${id}`, form)),
      "Gider kaydedilemedi.",
    );
    if (ok) setEditingId(null);
  };

  const deleteExpense = (e) => {
    if (!window.confirm(`"${e.description}" (${formatMoney(e.amount)}) silinsin mi?`)) return;
    run(() => adminApi.delete(`/expenses/${e.id}`), "Gider silinemedi.");
  };

  const saveRecurring = async (id, form) => {
    // Stopaj yalnızca kira giderinde
    const body = { ...form, dayOfMonth: Number(form.dayOfMonth), withholdingRate: form.category === "RENT" ? form.withholdingRate : "" };
    const ok = await run(
      () => (id === "new" ? adminApi.post("/recurring-expenses", body) : adminApi.put(`/recurring-expenses/${id}`, body)),
      "Sabit gider kaydedilemedi.",
    );
    if (ok) setEditingRecurringId(null);
  };

  const toggleRecurring = (r) =>
    run(() => adminApi.patch(`/recurring-expenses/${r.id}/active`, { active: !r.active }), "İşlem yapılamadı.");

  const deleteRecurring = (r) => {
    if (!window.confirm(`"${r.description}" sabit gideri silinsin mi? Daha önce eklenen aylık kayıtlar giderlerde kalır.`)) return;
    run(() => adminApi.delete(`/recurring-expenses/${r.id}`), "Sabit gider silinemedi.");
  };

  const defaultDate = to < getLocalDateStr() ? to : getLocalDateStr();

  // "Maaş / Personel · Ali Can"
  const expenseTag = (e) => {
    const employee = employees.find((emp) => emp.id === e.employeeId);
    return employee ? `${categoryLabel(e.category)} · ${employee.firstName} ${employee.lastName}` : categoryLabel(e.category);
  };

  return (
    <div className="space-y-3">
      <RateSettings adminApi={adminApi} onChanged={onChanged} />
      {/* Giderler (seçili tarih aralığı) */}
      <div className="bg-neutral-800 rounded-xl p-3 border border-neutral-700 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-white">Giderler</h2>
          {editingId !== "new" && (
            <button
              onClick={() => setEditingId("new")}
              className="text-sm bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"
            >
              <Plus size={14} /> Gider Ekle
            </button>
          )}
        </div>
        {editingId === "new" && (
          <ExpenseForm
            initial={{ date: defaultDate, description: "", amount: "", category: "OTHER", employeeId: "" }}
            employees={employees}
            onSubmit={(form) => saveExpense("new", form)}
            onCancel={() => setEditingId(null)}
          />
        )}
        {expenses.length === 0 ? (
          <p className="text-center text-neutral-500 py-4 bg-neutral-900 rounded-lg text-sm">Bu tarihlerde gider yok.</p>
        ) : (
          <ul className="divide-y divide-neutral-700/60">
            {expenses.map((e) =>
              editingId === e.id ? (
                <li key={e.id} className="py-2">
                  <ExpenseForm
                    initial={{ date: e.date, description: e.description, amount: String(e.amount), category: e.category, employeeId: e.employeeId || "" }}
                    employees={employees}
                    onSubmit={(form) => saveExpense(e.id, form)}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="flex-1 min-w-0">
                    <span className="block text-white truncate">{e.description}</span>
                    <span className="flex items-center gap-1 text-xs text-neutral-500">
                      {formatDate(e.date)} · {expenseTag(e)}
                      {e.recurring && (
                        <>
                          · <Repeat size={11} /> sabit
                        </>
                      )}
                    </span>
                  </span>
                  <span className="text-red-300 whitespace-nowrap">{formatMoney(e.amount)}</span>
                  <button onClick={() => setEditingId(e.id)} className={iconButton} aria-label="Düzenle">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => deleteExpense(e)} className={iconButton} aria-label="Sil">
                    <Trash2 size={14} />
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {/* Sabit aylık giderler */}
      <div className="bg-neutral-800 rounded-xl p-3 border border-neutral-700 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Repeat size={16} /> Sabit Aylık Giderler
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Kira, aidat gibi giderler her ay otomatik eklenir.
            </p>
          </div>
          {editingRecurringId !== "new" && (
            <button
              onClick={() => setEditingRecurringId("new")}
              className="text-sm bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
            >
              <Plus size={14} /> Ekle
            </button>
          )}
        </div>
        {editingRecurringId === "new" && (
          <RecurringForm
            initial={{ description: "", amount: "", dayOfMonth: "1", category: "RENT", employeeId: "", withholdingRate: "" }}
            employees={employees}
            onSubmit={(form) => saveRecurring("new", form)}
            onCancel={() => setEditingRecurringId(null)}
          />
        )}
        {recurring.length === 0 && editingRecurringId !== "new" ? (
          <p className="text-center text-neutral-500 py-4 bg-neutral-900 rounded-lg text-sm">Sabit gider tanımlanmadı.</p>
        ) : (
          <ul className="divide-y divide-neutral-700/60">
            {recurring.map((r) =>
              editingRecurringId === r.id ? (
                <li key={r.id} className="py-2">
                  <RecurringForm
                    initial={{
                      description: r.description,
                      amount: String(r.amount),
                      dayOfMonth: String(r.dayOfMonth),
                      category: r.category,
                      employeeId: r.employeeId || "",
                      withholdingRate: r.withholdingRate ? String(r.withholdingRate) : "",
                    }}
                    employees={employees}
                    onSubmit={(form) => saveRecurring(r.id, form)}
                    onCancel={() => setEditingRecurringId(null)}
                  />
                </li>
              ) : (
                <li key={r.id} className={`flex items-center gap-2 py-2 text-sm ${r.active ? "" : "opacity-50"}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-white truncate">{r.description}</span>
                    <span className="block text-xs text-neutral-500">
                      Her ayın {r.dayOfMonth}. günü · {expenseTag(r)}
                      {r.withholdingRate > 0 && ` · brüt, %${r.withholdingRate} stopaj`}
                      {!r.active && " · durduruldu"}
                    </span>
                  </span>
                  <span className="text-red-300 whitespace-nowrap">{formatMoney(r.amount)}</span>
                  <button onClick={() => setEditingRecurringId(r.id)} className={iconButton} aria-label="Düzenle">
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => toggleRecurring(r)}
                    className={iconButton}
                    aria-label={r.active ? "Durdur" : "Devam ettir"}
                    title={r.active ? "Durdur" : "Devam ettir"}
                  >
                    <Power size={14} />
                  </button>
                  <button onClick={() => deleteRecurring(r)} className={iconButton} aria-label="Sil">
                    <Trash2 size={14} />
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
        {recurring.length > 0 && (
          <p className="text-xs text-neutral-500">
            Tutar değişikliği sonraki aylardan geçerlidir.
          </p>
        )}
      </div>
    </div>
  );
}

export default ExpensesSection;
