-- Çoklu hizmetli randevu, paketler, fiyat düzenleme (indirim) ve giderler

-- Randevuda alınan hizmetler (alındığı andaki ad, süre ve fiyatıyla). appointments.service_id ilk hizmettir.
CREATE TABLE appointment_services (
    appointment_id TEXT NOT NULL REFERENCES appointments(id),
    service_id TEXT NOT NULL REFERENCES services(id),
    service_name TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    price_cents INTEGER,
    position INTEGER NOT NULL,
    PRIMARY KEY (appointment_id, service_id)
);

-- price_cents artık tahsil edilen (yönetici indirim yaptıysa düzenlenmiş) tutardır;
-- list_price_cents randevu alındığındaki liste fiyatıdır.
ALTER TABLE appointments ADD COLUMN list_price_cents INTEGER;
ALTER TABLE appointments ADD COLUMN price_note TEXT; -- örn. "Öğrenci indirimi"
ALTER TABLE appointments ADD COLUMN package_id TEXT;
ALTER TABLE appointments ADD COLUMN package_name TEXT;

UPDATE appointments SET list_price_cents = price_cents;
INSERT INTO appointment_services (appointment_id, service_id, service_name, duration_minutes, price_cents, position)
SELECT a.id, s.id, s.name, s.duration_minutes, a.price_cents, 0
FROM appointments a JOIN services s ON s.id = a.service_id;

-- Paket: birden fazla hizmet tek randevuda, yöneticinin belirlediği fiyatla (örn. "VIP Bakım")
CREATE TABLE packages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE package_services (
    package_id TEXT NOT NULL REFERENCES packages(id),
    service_id TEXT NOT NULL REFERENCES services(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (package_id, service_id)
);

-- Giderler (kira, malzeme, fatura...). Sabit aylık giderlerden otomatik eklenenlerde recurring_id doludur.
CREATE TABLE expenses (
    id TEXT PRIMARY KEY,
    expense_date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    recurring_id TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_expenses_date ON expenses(expense_date);

-- Her ay belirtilen günde otomatik gider olarak eklenir. last_generated_month: en son eklendiği ay ("2026-10");
-- yönetici o ayın kaydını silerse tekrar eklenmez.
CREATE TABLE recurring_expenses (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    day_of_month INTEGER NOT NULL, -- 1-31; kısa aylarda ayın son günü
    is_active INTEGER NOT NULL DEFAULT 1,
    last_generated_month TEXT,
    created_at TEXT NOT NULL
);
