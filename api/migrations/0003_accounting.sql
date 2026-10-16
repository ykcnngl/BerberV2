-- Muhasebe: randevusuz satış (kasa), ürün ve stok, ödeme yöntemi, çalışan primi, gider kategorileri, ayarlar.
-- Ödeme yöntemleri: CASH (nakit), CARD (kart/POS), TRANSFER (IBAN/havale). Boş = girilmedi.

ALTER TABLE appointments ADD COLUMN payment_method TEXT;

-- Hizmet cirosu üzerinden prim yüzdesi (0-100); boş = prim yok
ALTER TABLE employees ADD COLUMN commission_rate REAL;

-- Gider kategorileri (bkz. expenses.ts CATEGORIES). employee_id: maaş gibi bir çalışana ait giderler
ALTER TABLE expenses ADD COLUMN category TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE expenses ADD COLUMN employee_id TEXT REFERENCES employees(id);
ALTER TABLE recurring_expenses ADD COLUMN category TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE recurring_expenses ADD COLUMN employee_id TEXT REFERENCES employees(id);

-- Satılan ürünler (wax, şampuan...). stock: eldeki adet; low_stock: bu adede inince uyarı verilir
CREATE TABLE products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,      -- satış fiyatı
    cost_cents INTEGER,                -- alış fiyatı (stok eklerken gider tutarını önermek için)
    stock INTEGER NOT NULL DEFAULT 0,
    low_stock INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

-- Randevusuz satış: kapıdan gelen müşteriye yapılan hizmet ve/veya ürün satışı
CREATE TABLE sales (
    id TEXT PRIMARY KEY,
    sale_time TEXT NOT NULL,
    employee_id TEXT REFERENCES employees(id), -- yalnızca ürün satışında boş olabilir
    payment_method TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_sales_time ON sales(sale_time);

-- Satış satırları (satıldığı andaki ad ve fiyatla). kind: SERVICE | PRODUCT
CREATE TABLE sale_items (
    sale_id TEXT NOT NULL REFERENCES sales(id),
    position INTEGER NOT NULL,
    kind TEXT NOT NULL,
    item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    PRIMARY KEY (sale_id, position)
);

-- Genel ayarlar (anahtar-değer). card_commission_rate: POS komisyonu yüzdesi, örn. "2.5"
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
