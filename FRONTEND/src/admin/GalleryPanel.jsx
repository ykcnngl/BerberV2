import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import axios from "axios";
import { API_URL, getErrorMessage } from "../api";

const MAX_EDGE = 1600;

// Telefon fotoğrafını tarayıcıda doğru yöne çevirip küçültür ve JPEG olarak yeniden kaydeder
// (konum/EXIF bilgileri bu sırada silinir; sunucu fotoğrafı olduğu gibi saklar).
// Tarayıcı dosyayı açamazsa (örn. HEIC) orijinali gönderilir; sunucu uygun değilse reddeder.
async function prepareImage(file) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const ratio = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

// Sitedeki "Çalışmalarımız" bölümünün fotoğrafları
function GalleryPanel({ adminApi }) {
  const [items, setItems] = useState([]);
  const [files, setFiles] = useState([]);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState(null); // "2 / 5"
  const inputRef = useRef(null);

  const load = async () => {
    try {
      const response = await axios.get(`${API_URL}/gallery`);
      setItems(response.data);
    } catch (error) {
      alert(getErrorMessage(error, "Galeri yüklenemedi."));
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  // Seçilen dosyaların önizlemeleri; seçim değişince eski önizleme adresleri serbest bırakılır
  const previews = useMemo(() => files.map((f) => ({ file: f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!files.length) return;
    const failed = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(`${i + 1} / ${files.length}`);
      try {
        const form = new FormData();
        form.append("file", await prepareImage(files[i]));
        if (caption.trim()) form.append("caption", caption.trim());
        await adminApi.post("/gallery", form);
      } catch (error) {
        failed.push(`${files[i].name}: ${getErrorMessage(error, "yüklenemedi")}`);
      }
    }
    setProgress(null);
    setFiles([]);
    setCaption("");
    if (inputRef.current) inputRef.current.value = "";
    if (failed.length) alert("Bazı fotoğraflar yüklenemedi:\n" + failed.join("\n"));
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Bu fotoğraf sitedeki galeriden kaldırılsın mı?")) return;
    try {
      await adminApi.delete(`/gallery/${id}`);
      load();
    } catch (error) {
      alert(getErrorMessage(error, "Fotoğraf silinemedi."));
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleUpload} className="bg-neutral-800 border border-neutral-700 rounded-xl p-3 space-y-3">
        <div>
          <h2 className="font-semibold text-white">Çalışma fotoğrafı ekle</h2>
          <p className="text-sm text-neutral-400 mt-1">
            Fotoğraflar sitedeki "Çalışmalarımız" bölümünde en yeni en başta görünür. JPEG veya PNG, en fazla 10 MB.
          </p>
        </div>
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-neutral-600 hover:border-emerald-500 rounded-xl py-4 cursor-pointer text-neutral-400 hover:text-white transition-colors">
          <ImagePlus size={32} />
          <span className="text-sm">{files.length ? `${files.length} fotoğraf seçildi` : "Fotoğraf seçin (birden fazla seçebilirsiniz)"}</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
        </label>
        {previews.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {previews.map((p) => (
              <img key={p.url} src={p.url} alt="" className="h-20 w-20 object-cover rounded-lg shrink-0" />
            ))}
          </div>
        )}
        <input
          placeholder="Açıklama (isteğe bağlı, örn. Skin fade + sakal)"
          value={caption}
          maxLength={120}
          onChange={(e) => setCaption(e.target.value)}
          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={!files.length || progress !== null}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-semibold p-3 rounded-lg transition-colors"
        >
          <Upload size={18} /> {progress ? `Yükleniyor... ${progress}` : "Yükle"}
        </button>
      </form>

      <div>
        <h3 className="text-sm text-neutral-400 mb-3">Sitedeki fotoğraflar ({items.length})</h3>
        {items.length === 0 ? (
          <p className="text-center text-neutral-500 py-10 bg-neutral-800 rounded-xl">
            Henüz fotoğraf yok. Eklediğiniz ilk fotoğrafla birlikte sitede "Çalışmalarımız" bölümü görünür.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((item) => (
              <div key={item.id} className="group relative rounded-lg overflow-hidden bg-neutral-800">
                <img src={`${API_URL}${item.imagePath}`} alt={item.caption || ""} className="w-full aspect-square object-cover" />
                {item.caption && (
                  <p className="absolute bottom-0 inset-x-0 bg-black/70 text-xs text-white px-2 py-1.5 truncate">{item.caption}</p>
                )}
                <button
                  onClick={() => handleDelete(item.id)}
                  className="absolute top-2 right-2 bg-black/70 hover:bg-red-600 text-white p-2 rounded-full transition-colors"
                  aria-label="Fotoğrafı sil"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default GalleryPanel;
