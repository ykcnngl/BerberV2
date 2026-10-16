import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

// Çalışmalarımız galerisi: eşit boyutlu kareler (Instagram düzeni) + tıklayınca büyüyen görüntüleyici
// items: [{ id, src, caption }]
function GalleryGrid({ items }) {
  const [openIndex, setOpenIndex] = useState(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (dir) => setOpenIndex((i) => (i === null ? null : (i + dir + items.length) % items.length)),
    [items.length],
  );

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [openIndex, close, step]);

  const current = openIndex === null ? null : items[openIndex];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4">
        {items.map((item, i) => (
          <button
            key={item.id}
            onClick={() => setOpenIndex(i)}
            className="group relative block w-full aspect-[4/5] overflow-hidden bg-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-bronze-400"
            aria-label={item.caption ? `Büyüt: ${item.caption}` : "Fotoğrafı büyüt"}
          >
            <img
              src={item.src}
              alt={item.caption || "Arif Tüzünalp çalışması"}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            {item.caption && (
              <span className="absolute bottom-0 left-0 right-0 p-4 text-left text-sm tracking-wide text-white opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">
                {item.caption}
              </span>
            )}
          </button>
        ))}
      </div>

      {current && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <button onClick={close} className="absolute top-5 right-5 text-neutral-400 hover:text-white" aria-label="Kapat">
            <X size={30} />
          </button>
          {items.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                className="absolute left-3 md:left-8 text-neutral-400 hover:text-white p-2"
                aria-label="Önceki"
              >
                <ChevronLeft size={40} strokeWidth={1.2} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                className="absolute right-3 md:right-8 text-neutral-400 hover:text-white p-2"
                aria-label="Sonraki"
              >
                <ChevronRight size={40} strokeWidth={1.2} />
              </button>
            </>
          )}
          <figure className="max-w-4xl max-h-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img src={current.src} alt={current.caption || ""} className="max-h-[80vh] w-auto object-contain" />
            {current.caption && (
              <figcaption className="mt-4 text-neutral-300 tracking-wide text-sm">{current.caption}</figcaption>
            )}
            <span className="mt-2 text-xs text-neutral-600">
              {openIndex + 1} / {items.length}
            </span>
          </figure>
        </div>
      )}
    </>
  );
}

export default GalleryGrid;
