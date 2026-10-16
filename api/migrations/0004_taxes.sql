-- Kira stopajı: sabit giderin tutarı brüt kiradır; stopaj oranı girilirse her ay iki gider eklenir:
-- ev sahibine ödenen net kira (Kira) ve vergi dairesine ödenen stopaj (Vergi). Boş/0 = stopaj yok.
ALTER TABLE recurring_expenses ADD COLUMN withholding_rate REAL;

-- KDV oranı settings tablosunda 'vat_rate' anahtarıyla tutulur (boş/0 = KDV yok, örn. basit usul)
