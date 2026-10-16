# Randevu sitesi: Cloudflare kurulumu

Site (FRONTEND) ve API (bu klasör) tek bir Cloudflare Worker olarak yayınlanır.
Veritabanı Cloudflare D1, galeri fotoğrafları Cloudflare R2'de durur. Ücretsiz plan yeterlidir.

## Yerelde çalıştırma

```sh
cd api
npm install
cp .dev.vars.example .dev.vars          # ADMIN_PASSWORD'ü doldur (en az 12 karakter)
npm run db:migrate:local                # yerel veritabanını oluşturur
npm run dev                             # API: http://localhost:8787

# ayrı bir terminalde
cd FRONTEND
npm run dev                             # site: http://localhost:5173 (/api istekleri 8787'ye gider)
```

Yerelde `SMS_PROVIDER` "log" olduğu için SMS gönderilmez, doğrulama kodları Worker loguna yazılır.

## İlk yayın (bir kez)

1. https://dash.cloudflare.com adresinden ücretsiz hesap aç.
2. Giriş yap ve kaynakları oluştur:
   ```sh
   cd api
   npx wrangler login
   npx wrangler d1 create booking         # çıkan database_id'yi wrangler.jsonc'ye yaz
   npx wrangler r2 bucket create ariftuzunalp-gallery
   npm run db:migrate:remote
   ```
   R2'yi ilk kez kullanırken Cloudflare panelinden R2'yi etkinleştirmen istenebilir (ücretsiz planda kart bilgisi isteyebilir, 10 GB'a kadar ücret alınmaz).
3. Gizli değerleri gir (her biri sorulduğunda yazılır, hiçbir dosyaya kaydedilmez):
   ```sh
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put NETGSM_USERCODE
   npx wrangler secret put NETGSM_PASSWORD
   ```
4. `wrangler.jsonc` içinde `SMS_PROVIDER`'ı `"netgsm"` yap, `NETGSM_HEADER`'a onaylı gönderici başlığını yaz.
5. Yayınla:
   ```sh
   npm run deploy                         # veritabanını günceller, frontend'i derler, sonra yükler
   ```
   Site `https://ariftuzunalp.<hesap-adı>.workers.dev` adresinde açılır.
6. Alan adı: Cloudflare panelinde Workers & Pages → ariftuzunalp → Settings → Domains & Routes →
   "Add Custom Domain". Alan adının DNS'i Cloudflare'de olmalı (alan adını aldığın firmadan
   nameserver'ları Cloudflare'inkilerle değiştir).

## Güncelleme

Kodda değişiklik yaptıktan sonra `npm run deploy` yeterli. Önce bekleyen veritabanı güncellemelerini
(`migrations/`) uygular; bu adım hata verirse site yayınlanmaz, komut tekrar çalıştırılır. Şema değişirse
`migrations/` klasörüne yeni bir dosya eklenir.

## Loglar

Cloudflare panelinde Workers & Pages → ariftuzunalp → Logs. Netgsm hataları burada görünür.
Canlı izlemek için: `npx wrangler tail`.

## Yedek

```sh
npx wrangler d1 export booking --remote --output yedek.sql
```
D1 ayrıca yakın geçmişteki herhangi bir ana geri dönebilir ("Time Travel"; ücretsiz planda son 7 gün):
`npx wrangler d1 time-travel restore booking --timestamp=<zaman>`.
