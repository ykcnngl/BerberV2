import { useEffect, useState } from "react";
import { PackagePlus, Pencil, Plus, Power, TriangleAlert } from "lucide-react";
import { getErrorMessage } from "../api";
import { formatMoney } from "../utils";

const emptyForm = { name: "", price: "", cost: "", lowStock: "" };

const inputClass =
  "w-full bg-neutral-900 border border-neutral-600 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-emerald-500";

const isLow = (p) => p.lowStock != null && p.stock <= p.lowStock;

// Ürün ekleme/düzenleme: ad, satış fiyatı, alış fiyatı, uyarı adedi
function ProductForm({ initial, onSubmit, onCancel }) {
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
      className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-3"
    >
      <input
        placeholder="Ürün adı (örn. Wax 100 ml)"
        value={form.name}
        maxLength={80}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className={inputClass}
      />
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-neutral-400">
          Satış fiyatı ₺
          <input type="number" min={0} step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-neutral-400">
          Alış fiyatı ₺
          <input type="number" min={0} step="any" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-neutral-400">
          Uyarı adedi
          <input type="number" min={0} step={1} value={form.lowStock} onChange={(e) => setForm({ ...form, lowStock: e.target.value })} className={`${inputClass} mt-1`} />
        </label>
      </div>
      <p className="text-xs text-neutral-500">Stok bu adede inince uyarı gösterilir. Alış fiyatı stok eklerken gider tutarını önermek için kullanılır.</p>
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-neutral-400 hover:text-white">
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={saving || !form.name.trim() || form.price === ""}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </form>
  );
}

// Stok girişi (alım) ya da düzeltme (eksi adet). Alım tutarı girilirse "Ürün alımı" gideri olarak eklenir.
function StockForm({ product, onSubmit, onCancel }) {
  const [quantity, setQuantity] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [saving, setSaving] = useState(false);
  const q = Number(quantity);
  const suggested = product.cost != null && q > 0 ? product.cost * q : null;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSubmit({ quantity: q, totalCost: q > 0 ? totalCost : null });
        setSaving(false);
      }}
      className="mt-2 flex flex-wrap items-end gap-2 bg-neutral-900 border border-neutral-700 rounded-lg p-3"
    >
      <label className="text-xs text-neutral-400">
        Adet (düşmek için eksi)
        <input type="number" step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`${inputClass} mt-1 w-28`} autoFocus />
      </label>
      {q > 0 && (
        <label className="text-xs text-neutral-400 flex-1 min-w-36">
          Alım tutarı ₺ (gider olarak eklenir)
          <input
            type="number"
            min={0}
            step="any"
            value={totalCost}
            placeholder={suggested != null ? `öneri: ${suggested}` : "boş = gider ekleme"}
            onChange={(e) => setTotalCost(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
      )}
      <div className="flex gap-2 ml-auto">
        <button type="button" onClick={onCancel} className="text-sm px-3 py-2 text-neutral-400 hover:text-white">
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={saving || !Number.isInteger(q) || q === 0}
          className="text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 text-white px-3 py-2 rounded-lg"
        >
          Kaydet
        </button>
      </div>
    </form>
  );
}

// Satılan ürünler (wax, şampuan...): fiyat, stok ve düşük stok uyarısı
function ProductsPanel({ adminApi }) {
  const [products, setProducts] = useState([]);
  const [editingId, setEditingId] = useState(null); // "new" | id
  const [stockId, setStockId] = useState(null);

  const load = async () => {
    try {
      const response = await adminApi.get("/products");
      setProducts(response.data);
    } catch (error) {
      alert(getErrorMessage(error, "Ürünler yüklenemedi."));
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (action, fallback) => {
    try {
      await action();
      await load();
      return true;
    } catch (error) {
      alert(getErrorMessage(error, fallback));
      return false;
    }
  };

  const save = async (id, form) => {
    const ok = await run(
      () => (id === "new" ? adminApi.post("/products", form) : adminApi.put(`/products/${id}`, form)),
      "Ürün kaydedilemedi.",
    );
    if (ok) setEditingId(null);
  };

  const addStock = async (id, body) => {
    const ok = await run(() => adminApi.post(`/products/${id}/stock`, body), "Stok güncellenemedi.");
    if (ok) setStockId(null);
  };

  const toggle = (p) => {
    if (p.active && !window.confirm(`"${p.name}" satıştan kaldırılsın mı? Geçmiş satışlar silinmez.`)) return;
    run(() => adminApi.patch(`/products/${p.id}/active`, { active: !p.active }), "İşlem yapılamadı.");
  };

  const lowCount = products.filter((p) => p.active && isLow(p)).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-neutral-400">Ürünler ({products.length})</h2>
        {editingId !== "new" && (
          <button
            onClick={() => setEditingId("new")}
            className="text-sm bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"
          >
            <Plus size={14} /> Ekle
          </button>
        )}
      </div>

      {lowCount > 0 && (
        <p className="text-sm text-amber-400 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
          <TriangleAlert size={16} /> {lowCount} üründe stok azaldı.
        </p>
      )}

      {editingId === "new" && <ProductForm initial={emptyForm} onSubmit={(f) => save("new", f)} onCancel={() => setEditingId(null)} />}

      {products.length === 0 && editingId !== "new" && (
        <p className="text-center text-neutral-500 py-6 bg-neutral-900 rounded-lg text-sm">
          Henüz ürün yok. Wax, şampuan gibi sattığınız ürünleri ekleyin; Kasa sekmesinden satabilirsiniz.
        </p>
      )}

      {products.map((p) =>
        editingId === p.id ? (
          <ProductForm
            key={p.id}
            initial={{
              name: p.name,
              price: String(p.price),
              cost: p.cost == null ? "" : String(p.cost),
              lowStock: p.lowStock == null ? "" : String(p.lowStock),
            }}
            onSubmit={(f) => save(p.id, f)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div key={p.id} className={`bg-neutral-800 border rounded-xl p-3 ${p.active ? "border-neutral-700" : "border-neutral-800 opacity-60"}`}>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white text-sm truncate">
                  {p.name}
                  {!p.active && <span className="ml-2 text-[0.65rem] bg-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded-full">Pasif</span>}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {formatMoney(p.price)}
                  {p.cost != null && <span className="text-neutral-500"> · alış {formatMoney(p.cost)}</span>}
                </p>
              </div>
              <span className={`text-sm font-semibold whitespace-nowrap ${isLow(p) ? "text-amber-400" : "text-white"}`}>
                {isLow(p) && <TriangleAlert size={12} className="inline mr-1 -mt-0.5" />}
                {p.stock} adet
              </span>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setStockId(stockId === p.id ? null : p.id)}
                  className={`p-1.5 rounded-lg ${stockId === p.id ? "bg-emerald-600 text-white" : "bg-neutral-700 hover:bg-neutral-600"}`}
                  aria-label="Stok ekle"
                  title="Stok ekle / düş"
                >
                  <PackagePlus size={14} />
                </button>
                <button onClick={() => setEditingId(p.id)} className="p-1.5 bg-neutral-700 hover:bg-neutral-600 rounded-lg" aria-label="Düzenle" title="Düzenle">
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => toggle(p)}
                  className={`p-1.5 rounded-lg ${p.active ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-emerald-600/20 text-emerald-400"}`}
                  aria-label={p.active ? "Pasife al" : "Aktif et"}
                  title={p.active ? "Pasife al" : "Aktif et"}
                >
                  <Power size={14} />
                </button>
              </div>
            </div>
            {stockId === p.id && <StockForm product={p} onSubmit={(body) => addStock(p.id, body)} onCancel={() => setStockId(null)} />}
          </div>
        ),
      )}
    </div>
  );
}

export default ProductsPanel;
