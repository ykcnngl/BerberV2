import { useEffect, useState } from "react";
import { Coffee, Palmtree, Trash2 } from "lucide-react";
import { getErrorMessage } from "../api";
import { DAYS, dayLabel, formatDate, getLocalDateStr } from "../utils";

const inputClass =
  "bg-neutral-900 border border-neutral-600 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-emerald-500 [color-scheme:dark]";

const describeBreak = (b) =>
  b.breakDate ? formatDate(b.breakDate) : b.dayOfWeek ? `Her ${dayLabel(b.dayOfWeek)}` : "Her gün";

// Bir çalışanın molaları (her gün / haftanın günü / tarih) ve izinleri (tarih aralığı)
function EmployeeSchedule({ adminApi, employeeId }) {
  const today = getLocalDateStr();
  const [breaks, setBreaks] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [breakForm, setBreakForm] = useState({ repeat: "daily", dayOfWeek: "MONDAY", breakDate: today, startTime: "13:00", endTime: "14:00", reason: "" });
  const [leaveForm, setLeaveForm] = useState({ startDate: today, endDate: today, reason: "" });

  const load = async () => {
    try {
      const [b, l] = await Promise.all([
        adminApi.get(`/employees/${employeeId}/breaks`),
        adminApi.get(`/employees/${employeeId}/leaves`),
      ]);
      setBreaks(b.data);
      setLeaves(l.data);
    } catch (error) {
      alert(getErrorMessage(error, "Mola ve izinler yüklenemedi."));
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const addBreak = async (e) => {
    e.preventDefault();
    try {
      await adminApi.post(`/employees/${employeeId}/breaks`, {
        startTime: breakForm.startTime,
        endTime: breakForm.endTime,
        reason: breakForm.reason,
        dayOfWeek: breakForm.repeat === "weekly" ? breakForm.dayOfWeek : null,
        breakDate: breakForm.repeat === "date" ? breakForm.breakDate : null,
      });
      setBreakForm((f) => ({ ...f, reason: "" }));
      load();
    } catch (error) {
      alert(getErrorMessage(error, "Mola eklenemedi."));
    }
  };

  const addLeave = async (e) => {
    e.preventDefault();
    try {
      await adminApi.post(`/employees/${employeeId}/leaves`, leaveForm);
      setLeaveForm((f) => ({ ...f, reason: "" }));
      load();
    } catch (error) {
      alert(getErrorMessage(error, "İzin eklenemedi."));
    }
  };

  const remove = async (path, label) => {
    if (!window.confirm(`Bu ${label} silinsin mi?`)) return;
    try {
      await adminApi.delete(path);
      load();
    } catch (error) {
      alert(getErrorMessage(error, "Silinemedi."));
    }
  };

  return (
    <div className="mt-5 pt-5 border-t border-neutral-700 grid md:grid-cols-2 gap-6">
      {/* MOLALAR */}
      <div>
        <h4 className="font-semibold flex items-center gap-2 mb-3">
          <Coffee size={16} className="text-amber-400" /> Molalar
        </h4>
        <ul className="space-y-2 mb-4">
          {breaks.length === 0 && <li className="text-sm text-neutral-500">Tanımlı mola yok.</li>}
          {breaks.map((b) => (
            <li key={b.id} className="flex justify-between items-center bg-neutral-900 rounded-lg px-3 py-2 text-sm">
              <span>
                <span className="text-white">{describeBreak(b)}</span>{" "}
                <span className="text-neutral-400">
                  {b.startTime.slice(0, 5)}-{b.endTime.slice(0, 5)}
                  {b.reason && ` · ${b.reason}`}
                </span>
              </span>
              <button onClick={() => remove(`/breaks/${b.id}`, "mola")} className="text-neutral-500 hover:text-red-400" aria-label="Molayı sil">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={addBreak} className="space-y-2">
          <select
            value={breakForm.repeat}
            onChange={(e) => setBreakForm({ ...breakForm, repeat: e.target.value })}
            className={`${inputClass} w-full`}
          >
            <option value="daily">Her gün</option>
            <option value="weekly">Haftanın belirli günü</option>
            <option value="date">Belirli bir tarih</option>
          </select>
          {breakForm.repeat === "weekly" && (
            <select
              value={breakForm.dayOfWeek}
              onChange={(e) => setBreakForm({ ...breakForm, dayOfWeek: e.target.value })}
              className={`${inputClass} w-full`}
            >
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
          {breakForm.repeat === "date" && (
            <input
              type="date"
              min={today}
              value={breakForm.breakDate}
              onChange={(e) => setBreakForm({ ...breakForm, breakDate: e.target.value })}
              className={`${inputClass} w-full`}
            />
          )}
          <div className="flex gap-2 items-center">
            <input
              type="time"
              aria-label="Mola başlangıcı"
              value={breakForm.startTime}
              onChange={(e) => setBreakForm({ ...breakForm, startTime: e.target.value })}
              className={`${inputClass} flex-1`}
            />
            <span className="text-neutral-500">-</span>
            <input
              type="time"
              aria-label="Mola bitişi"
              value={breakForm.endTime}
              onChange={(e) => setBreakForm({ ...breakForm, endTime: e.target.value })}
              className={`${inputClass} flex-1`}
            />
          </div>
          <input
            placeholder="Açıklama (örn. Öğle arası)"
            value={breakForm.reason}
            onChange={(e) => setBreakForm({ ...breakForm, reason: e.target.value })}
            className={`${inputClass} w-full`}
          />
          <button type="submit" className="w-full bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 rounded-lg py-2 text-sm font-medium">
            Mola Ekle
          </button>
        </form>
      </div>

      {/* İZİNLER */}
      <div>
        <h4 className="font-semibold flex items-center gap-2 mb-3">
          <Palmtree size={16} className="text-emerald-400" /> İzinler
        </h4>
        <ul className="space-y-2 mb-4">
          {leaves.length === 0 && <li className="text-sm text-neutral-500">Planlanmış izin yok.</li>}
          {leaves.map((l) => (
            <li key={l.id} className="flex justify-between items-center bg-neutral-900 rounded-lg px-3 py-2 text-sm">
              <span>
                <span className="text-white">
                  {l.startDate === l.endDate ? formatDate(l.startDate) : `${formatDate(l.startDate)} - ${formatDate(l.endDate)}`}
                </span>
                {l.reason && <span className="text-neutral-400"> · {l.reason}</span>}
              </span>
              <button onClick={() => remove(`/leaves/${l.id}`, "izin")} className="text-neutral-500 hover:text-red-400" aria-label="İzni sil">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={addLeave} className="space-y-2">
          <div className="flex gap-2 items-center">
            <input
              type="date"
              aria-label="İzin başlangıcı"
              min={today}
              value={leaveForm.startDate}
              onChange={(e) =>
                setLeaveForm({
                  ...leaveForm,
                  startDate: e.target.value,
                  endDate: leaveForm.endDate < e.target.value ? e.target.value : leaveForm.endDate,
                })
              }
              className={`${inputClass} flex-1`}
            />
            <span className="text-neutral-500">-</span>
            <input
              type="date"
              aria-label="İzin bitişi"
              min={leaveForm.startDate}
              value={leaveForm.endDate}
              onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
              className={`${inputClass} flex-1`}
            />
          </div>
          <input
            placeholder="Açıklama (örn. Yıllık izin)"
            value={leaveForm.reason}
            onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
            className={`${inputClass} w-full`}
          />
          <button type="submit" className="w-full bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 rounded-lg py-2 text-sm font-medium">
            İzin Ekle
          </button>
        </form>
      </div>
    </div>
  );
}

export default EmployeeSchedule;
