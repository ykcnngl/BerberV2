// Galeri fotoğrafları: dosya R2'de, kaydı veritabanında tutulur. Fotoğraf yönetici panelinde, tarayıcıda
// küçültülüp JPEG'e çevrilerek gönderilir (telefonun konum/EXIF bilgileri bu sırada silinir; bkz. GalleryPanel.jsx).
import type { Env } from "./env";
import { BusinessError, NotFound } from "./errors";
import { nowLocal } from "./time";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_CAPTION = 120;

interface GalleryRow {
  id: string;
  file_name: string;
  caption: string | null;
  created_at: string;
}

// imagePath API adresine eklenerek kullanılır: {API_URL}{imagePath}
const toItem = (g: GalleryRow) => ({
  id: g.id,
  imagePath: `/gallery/images/${g.file_name}`,
  caption: g.caption,
  createdAt: g.created_at,
});

export async function listGallery(env: Env) {
  const { results } = await env.DB.prepare("SELECT * FROM gallery_items ORDER BY created_at DESC").all<GalleryRow>();
  return results.map(toItem);
}

// Dosyanın gerçekten JPEG veya PNG olduğu ilk baytlarından anlaşılır (uzantıya/türe güvenilmez)
function detectImage(bytes: Uint8Array): { ext: string; contentType: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", contentType: "image/jpeg" };
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) {
    return { ext: "png", contentType: "image/png" };
  }
  return null;
}

export async function uploadImage(env: Env, file: unknown, caption: unknown) {
  if (!(file instanceof File) || file.size === 0) {
    throw new BusinessError("Lütfen bir fotoğraf seçin.");
  }
  if (file.size > MAX_BYTES) {
    throw new BusinessError("Fotoğraf en fazla 10 MB olabilir.");
  }
  const cleanCaption = typeof caption === "string" ? caption.trim() : "";
  if (cleanCaption.length > MAX_CAPTION) {
    throw new BusinessError(`Açıklama en fazla ${MAX_CAPTION} karakter olabilir.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImage(bytes);
  if (!type) {
    throw new BusinessError("Sadece JPEG veya PNG fotoğraf yüklenebilir.");
  }

  const row: GalleryRow = {
    id: crypto.randomUUID(),
    file_name: `${crypto.randomUUID()}.${type.ext}`,
    caption: cleanCaption || null,
    created_at: nowLocal(),
  };
  await env.GALLERY.put(row.file_name, bytes, { httpMetadata: { contentType: type.contentType } });
  await env.DB.prepare("INSERT INTO gallery_items (id, file_name, caption, created_at) VALUES (?, ?, ?, ?)")
    .bind(row.id, row.file_name, row.caption, row.created_at)
    .run();
  return toItem(row);
}

export async function deleteImage(env: Env, id: string) {
  const item = await env.DB.prepare("SELECT * FROM gallery_items WHERE id = ?").bind(id).first<GalleryRow>();
  if (!item) throw new NotFound("Fotoğraf bulunamadı.");
  await env.DB.prepare("DELETE FROM gallery_items WHERE id = ?").bind(id).run();
  await env.GALLERY.delete(item.file_name);
}

// Dosya adları rastgele olduğu için uzun süre önbelleğe alınabilir
export async function serveImage(env: Env, fileName: string): Promise<Response> {
  const object = /^[0-9a-f-]+\.(jpg|png)$/.test(fileName) ? await env.GALLERY.get(fileName) : null;
  if (!object) throw new NotFound("Fotoğraf bulunamadı.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=2592000");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}
