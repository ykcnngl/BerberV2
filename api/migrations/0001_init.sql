-- Tarih/saatler Türkiye yerel saatiyle metin olarak tutulur: "2026-10-14T15:30:00", "2026-10-14", "13:00"
-- (aynı biçimdeki metinler alfabetik olarak da doğru sıralanır, karşılaştırmalar bu sayede çalışır).
-- Fiyatlar kuruş cinsinden tam sayıdır (500,00 TL = 50000).

CREATE TABLE services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    buffer_minutes INTEGER NOT NULL DEFAULT 10, -- temizlik/tampon süresi
    price_cents INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE employees (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'STAFF', -- ADMIN, STAFF
    is_active INTEGER NOT NULL DEFAULT 1,
    weekly_off_days TEXT NOT NULL DEFAULT '[]' -- JSON: ["MONDAY", ...] (her hafta çalışmadığı günler)
);

-- Bir çalışanın birden fazla uzmanlık alanı (hizmeti) olabilir
CREATE TABLE employee_services (
    employee_id TEXT NOT NULL REFERENCES employees(id),
    service_id TEXT NOT NULL REFERENCES services(id),
    PRIMARY KEY (employee_id, service_id)
);

CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    full_name TEXT,
    phone TEXT NOT NULL UNIQUE,
    notes TEXT,
    is_blacklisted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE appointments (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    employee_id TEXT NOT NULL REFERENCES employees(id),
    service_id TEXT NOT NULL REFERENCES services(id),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL, -- start_time + süre + tampon
    -- Randevu alındığı andaki hizmet fiyatı: sonradan fiyat değişse de ciro raporu bozulmaz
    price_cents INTEGER,
    status TEXT NOT NULL, -- CONFIRMED, CANCELLED, NO_SHOW (PENDING, COMPLETED kullanılmıyor)
    created_at TEXT NOT NULL
);
CREATE INDEX idx_appointments_employee_start ON appointments(employee_id, start_time);
CREATE INDEX idx_appointments_customer_start ON appointments(customer_id, start_time);
CREATE INDEX idx_appointments_start ON appointments(start_time);

-- Molanın geçerli olduğu günler:
-- break_date dolu -> sadece o tarih; day_of_week dolu -> her hafta o gün; ikisi de boş -> her gün
CREATE TABLE employee_breaks (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    break_date TEXT,
    day_of_week TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    reason TEXT
);
CREATE INDEX idx_breaks_employee ON employee_breaks(employee_id);

-- Çalışanın tam gün izinli olduğu tarih aralığı (başlangıç ve bitiş dahil)
CREATE TABLE employee_leaves (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT
);
CREATE INDEX idx_leaves_employee ON employee_leaves(employee_id, end_date);

-- Telefona gönderilen tek kullanımlık doğrulama kodu (kodun kendisi değil, özeti saklanır)
CREATE TABLE phone_verifications (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    ip TEXT, -- aynı yerden çok sayıda numaraya kod istenmesini sınırlamak için
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_verifications_phone ON phone_verifications(phone, created_at);
CREATE INDEX idx_verifications_ip ON phone_verifications(ip, created_at);

-- Kodu doğrulayan müşteriye verilen kısa süreli oturum anahtarı (anahtarın özeti saklanır)
CREATE TABLE customer_sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

-- Sitedeki "Çalışmalarımız" galerisi (dosya R2'de, burada sadece adı tutulur)
CREATE TABLE gallery_items (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL UNIQUE,
    caption TEXT,
    created_at TEXT NOT NULL
);

-- Sitedeki "Neler yapıyoruz" bölümündeki hizmetler. Fiyat ve hizmeti hangi ekip üyesinin
-- vereceği yönetici panelinden belirlenir.
INSERT INTO services (id, name, duration_minutes) VALUES
    (lower(hex(randomblob(16))), 'Saç Kesimi', 30),
    (lower(hex(randomblob(16))), 'Sakal Tasarımı', 30),
    (lower(hex(randomblob(16))), 'Cilt Bakımı', 60),
    (lower(hex(randomblob(16))), 'Ölçülü Kaş Alımı', 15),
    (lower(hex(randomblob(16))), 'Manikür & Pedikür', 60);
