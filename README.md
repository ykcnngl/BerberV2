# 💈 Arif Tüzünalp Barber's Club: Booking & Salon Management Platform

A production-grade, full-stack online booking and back-office platform built for **Arif Tüzünalp Barber's Club**, a men's hair and beauty salon in Balçova, İzmir.

SMS-Verified Booking · Race-Free Slot Reservation · Accounting & Reporting · Serverless Edge Deployment

<br>

🌍 **Technical Showcase:** This repository is a technical showcase of the engineering decisions, system architecture and UI/UX design behind a live business site. I'm happy to walk through the code in an interview.
*(Note: Secrets such as the admin password and Netgsm SMS credentials are never committed. They are stored as encrypted Cloudflare Worker secrets.)*

## 🧭 What Is This?

BerberV2 is the second generation of the salon's booking system. Customers pick a barber, one or more services (or a ready-made package) and a free time slot, then confirm the booking with a one-time code sent to their phone by SMS. No account or password is needed.

Behind the public site sits a full **admin panel** that runs the business day to day: appointments, staff schedules, breaks and leave, services and packages, a point-of-sale register, product stock, expenses, commissions, taxes and profit reports with Excel export.

V1 was a **Java Spring Boot** backend (still in the `booking/` folder for reference). V2 rewrites the API in **TypeScript on Cloudflare Workers** with a **D1 (SQLite)** database and **R2** object storage. The site and the API ship as a single Worker on Cloudflare's free plan, with no server to maintain.

## ✨ Feature Highlights

| Feature | Description |
| :--- | :--- |
| 📅 **Smart Slot Engine** | Calculates free 30-minute slots per barber from working hours, multi-service durations, existing bookings, recurring/one-off breaks, weekly days off and leave periods. |
| 📲 **Passwordless SMS Login** | Customers verify their phone with a 6-digit OTP via **Netgsm** and receive a short-lived session token. Rate-limited per phone and per IP. |
| 🔒 **Double-Booking Protection** | The overlap check and the insert run in one atomic D1 batch, so two customers racing for the same slot can never both win. |
| 🧾 **Built-in Accounting** | Cash / card / transfer payments, walk-in sales, product stock, recurring monthly expenses, staff commissions, POS fees, VAT and net profit, exportable to Excel (CSV). |
| 🖼️ **Gallery on R2** | Admins upload salon photos straight to Cloudflare R2. The Worker serves them under the same domain. |
| 🔔 **Automatic Notifications** | Booking confirmations and admin cancellations are sent as SMS in the background without slowing down the response. |
| ⏰ **Scheduled Jobs** | A nightly Cron Trigger posts recurring monthly expenses (rent, bills, etc.) on their due day. |

## 🏗️ System Architecture

```text
╔══════════════════════════════════════════════════════════════╗
║                   React 19 SPA (Vite + Tailwind)             ║
║                                                              ║
║  ┌──────────────────┐  ┌──────────────────────────────────┐  ║
║  │  Public Site     │  │          Admin Panel             │  ║
║  │  Home · Gallery  │  │  Appointments · Staff · Services │  ║
║  │  Booking Wizard  │  │  Register · Expenses · Reports   │  ║
║  └────────┬─────────┘  └────────────────┬─────────────────┘  ║
╚═══════════┼═════════════════════════════┼════════════════════╝
            │  X-Customer-Token           │  X-Admin-Password
            │        HTTPS  /api/v1/booking/*  (same origin)
            ▼                             ▼
╔══════════════════════════════════════════════════════════════╗
║            Cloudflare Worker (TypeScript + Hono)             ║
║                                                              ║
║  ┌──────────────────┐ ┌─────────────────┐ ┌───────────────┐  ║
║  │ Booking & Slots  │ │ OTP / Sessions  │ │  Admin APIs   │  ║
║  │ (atomic batches) │ │ (rate limited)  │ │ Sales·Reports │  ║
║  └──────────────────┘ └─────────────────┘ └───────────────┘  ║
║  ┌───────────────────────────┐ ┌──────────────────────────┐  ║
║  │ Static Assets (SPA build) │ │ Cron Trigger (00:05 TRT) │  ║
║  └───────────────────────────┘ └──────────────────────────┘  ║
╚════════╦════════════════════════╦════════════════════╦═══════╝
         │                        │                    │
         ▼                        ▼                    ▼
 ┌───────────────┐       ┌───────────────┐    ┌────────────────┐
 │ Cloudflare D1 │       │ Cloudflare R2 │    │   Netgsm API   │
 │   (SQLite)    │       │ (Gallery Img) │    │  (OTP & SMS)   │
 └───────────────┘       └───────────────┘    └────────────────┘
```

## 🧠 Hard Engineering Problems Solved

### 🔒 1. Double Booking Under Concurrency
* **The Problem:** Two customers can see the same free slot and press "Book" at the same moment. A naive "check, then insert" flow lets both requests pass the check and puts both people in the same chair.
* **The Solution:** The overlap check sits inside the `INSERT ... SELECT ... WHERE NOT EXISTS (overlapping appointment)` statement, and the customer, appointment and service rows are written in a single **D1 batch**, which runs as one transaction. Only one of the racing requests inserts a row. The other sees `changes === 0` and gets a friendly "this slot was just taken" message. Cancelled and no-show appointments free their slot automatically.

### 📲 2. SMS Verification Without Burning the SMS Budget
* **The Problem:** Every OTP costs real money. A public "send code" endpoint is an easy target for brute-forcing codes or draining the SMS balance by requesting codes for random numbers.
* **The Solution:** A layered defence: a 60-second resend cooldown, a limit of 5 codes per phone and 10 per IP per hour, and a limit of 5 attempts per code. The attempt counter uses a conditional `UPDATE ... WHERE attempts < max`, so parallel guesses can't get around it. Codes come from unbiased rejection sampling, are stored only as **SHA-256 hashes** and are compared in **constant time**. Session tokens are 256-bit random values that are also stored hashed. If the SMS fails to send, the code record is rolled back so the customer isn't penalised.

### 🕒 3. Time Zones on UTC-Only Edge Servers
* **The Problem:** Cloudflare's edge runs on UTC, while the salon, its working hours and its customers all live on Turkish time. Mixing `Date` objects across zones leads to off-by-three-hours slots and reports that fall on the wrong day.
* **The Solution:** All dates and times are handled as zone-free local strings (`2026-10-14T15:30:00`) in Turkey time (fixed UTC+3, no DST since 2016). The math runs on a pure utility module. Because the strings sort lexicographically, overlap checks are simple string comparisons in both SQL and TypeScript. The nightly cron is scheduled for `21:05 UTC` so it fires at 00:05 in İzmir.

### 🧾 4. Trustworthy Money Math
* **The Problem:** The owner needs reports that match the till exactly: discounts, package prices, card commissions, VAT, staff commissions and monthly fixed costs, all without floating-point rounding drift.
* **The Solution:** Every amount is stored and calculated in **integer kuruş (cents)**. Appointments keep both the list price and the price actually charged, along with snapshots of service names and prices, so later price changes never rewrite history. The report engine combines appointments, walk-in sales, stock-based product sales, expenses and payouts into gross revenue, deductions and net profit. Pure functions are unit-tested with **Vitest**.

### ☁️ 5. Zero-Ops, Near-Zero-Cost Hosting
* **The Problem:** A small business can't pay for or babysit a VPS, a database server and a separate frontend host. V1's Spring Boot stack needed all three.
* **The Solution:** The React build is served as **Worker static assets**, and only `/api/*` runs Worker code (`run_worker_first`), so there is one deployment, one domain and no CORS. D1 handles the database with versioned SQL migrations and 7-day Time Travel restore, and R2 stores images. A single `npm run deploy` applies migrations, builds the frontend and publishes, all within Cloudflare's free tier.

## 🛠️ Full Tech Stack

| Category | Technology |
| :--- | :--- |
| 🖥️ **Frontend** | React 19, Vite, React Router 7, Tailwind CSS 4, Axios, Lucide Icons |
| ⚙️ **Backend API** | TypeScript, Hono, Cloudflare Workers |
| 🗄️ **Database & Storage** | Cloudflare D1 (SQLite) with SQL migrations, Cloudflare R2 |
| 📡 **Messaging** | Netgsm OTP & SMS API |
| 🔐 **Security** | SMS OTP, hashed session tokens, constant-time comparison, rate limiting, Worker secrets |
| ⏰ **Automation** | Cloudflare Cron Triggers, `ctx.waitUntil` background tasks |
| 🧪 **Testing & Tooling** | Vitest, ESLint, Wrangler |
| 🕰️ **Legacy (V1)** | Java, Spring Boot, Spring Data JPA, PostgreSQL, Maven |

## 🚀 Running Locally

```sh
cd api
npm install
cp .dev.vars.example .dev.vars    # set ADMIN_PASSWORD (min. 12 characters)
npm run db:migrate:local
npm run dev                       # API → http://localhost:8787

# in a second terminal
cd FRONTEND
npm install
npm run dev                       # Site → http://localhost:5173 (/api is proxied to 8787)
```

Locally `SMS_PROVIDER` is set to `log`, so no SMS is sent and verification codes are printed to the Worker log. See [`api/README.md`](api/README.md) for the full Cloudflare deployment guide.
