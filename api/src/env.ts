export interface Env {
  DB: D1Database;
  GALLERY: R2Bucket; // galeri fotoğrafları
  ASSETS: Fetcher; // frontend (FRONTEND/dist)

  // wrangler.jsonc "vars"
  SMS_PROVIDER?: string; // "netgsm" = gerçek SMS, "log" = kodlar sadece loga yazılır (geliştirme)
  NETGSM_HEADER?: string; // Netgsm'de onaylı gönderici başlığı
  BUSINESS_NAME?: string; // müşteriye giden SMS'lerde görünür
  BUSINESS_PHONE?: string;

  // Gizli değerler: "npx wrangler secret put ADI" ile (yerelde .dev.vars dosyasından)
  ADMIN_PASSWORD?: string; // en az 12 karakter
  NETGSM_USERCODE?: string;
  NETGSM_PASSWORD?: string;
}

export type AppEnv = { Bindings: Env };
