# AfarRide (አፋር ራይድ) 🛺 — Full-Stack Ride-Hailing Platform

> **Next-generation Bajaj ride hailing, shared transit & logistics for Semera & Logiya, Afar Regional State, Ethiopia** — rebuilt as a complete Uber-style full-stack monorepo with real accounts, live ride matching, realtime GPS tracking, Telebirr/Chapa payments, and an operations admin dashboard.

---

## 🏗️ Monorepo Layout

| Workspace | Stack | Port | Purpose |
|---|---|---|---|
| [`server/`](server/) | Node.js + Express + Socket.io + SQLite (better-sqlite3) | 4000 | REST API, OTP auth, ride matching, live tracking, fares, payments, ratings |
| [`rider-app/`](rider-app/) | React 19 + Vite + Tailwind 4 + Leaflet | 5173 | Passenger app: booking, live map, payment, rating, SOS, trilingual UI |
| [`driver-app/`](driver-app/) | React 19 + Vite + Tailwind 4 | 5174 | Bajaj driver console: online toggle, live GPS broadcast, ride acceptance |
| [`admin-dashboard/`](admin-dashboard/) | React 19 + Vite + Tailwind 4 + Socket.io | 5175 | Live KPIs: rides, revenue (ETB), drivers online, ride feed |

---

## ✨ What's Included (vs. the original single-page prototype)

**Preserved from the original AfarRide:**
- 🛰️ Multi-layer map (Satellite Hybrid / Pure Satellite / OSM Streets) over the Semera–Logiya corridor
- 🛣️ Route polyline + nearby Bajaj fleet with driver names, plates (`AF-3-1284`), ratings
- 👥 Three ride modes: Private Charter (Inki Kire), Shared Pool (Biyak Kire, 1–3 seats, up to 60% saving), AfarCargo (Maalu Kire freight, 1.6× multiplier)
- 💳 Telebirr, CBE Birr (via Chapa) & Cash payments
- 🌐 Trilingual: Qafaraf · አማርኛ · English
- 🆘 SOS dispatch dial (`0966393925`) & Share Live Trip
- 📍 Semera/Logiya landmark database

**New — closing the gap with Ride / Feres / Uber:**
- 🔐 **Phone OTP authentication** with JWT sessions (rider, driver, admin roles) — the standard sign-in across Ethiopian ride apps
- 🛰️ **Real ride matching**: rider requests persist to the DB → online drivers see and accept them → full trip lifecycle (`requested → accepted → arrived → in_trip → completed`)
- 📡 **Socket.io realtime**: live driver GPS broadcast, ride-room status pushes, live admin stats
- 💰 **Real Chapa payment flow** (`POST /v1/transaction/initialize` + `/verify`) settling Telebirr, CBE Birr, M-PESA and cards through one API — with a sandbox mode so the flow runs without live keys
- ⭐ **Two-sided ratings** (driver averages from rider star reviews)
- 🧾 **Trip history** and live **admin dashboard** with revenue/driver KPIs
- 🐳 Docker + docker-compose deployment

---

## 🚀 Quick Start

```bash
git clone https://github.com/your-username/afarride-fullstack.git
cd afarride-fullstack

# 1) Install all workspaces
npm install

# 2) Configure
cp .env.example .env
# Optional: set CHAPA_SECRET_KEY and GEMINI_API_KEY

# 3) Seed demo data (rider 0911000001 · driver 0911000002 · admin 0911000003)
npm run seed --workspace server

# 4) Run everything (4 terminals, or `npm run dev` for all at once)
npm run dev:server    # API + Socket.io on :4000
npm run dev:rider     # passenger app on :5173
npm run dev:driver    # driver console on :5174
npm run dev:admin     # admin dashboard on :5175
```

**Dev OTP for any phone number: `123456`** (production uses random 6-digit codes via your SMS gateway).

### Try the full flow
1. Open the **rider app** → login `0911000001`, OTP `123456`
2. Pick mode (Private / Pool / Cargo), choose pickup + dropoff landmarks, preview fare, request ride
3. Open the **driver app** → login `0911000002`, go **Online**, accept the request, advance: Arrived → Start Trip → Complete
4. Rider sees live status changes, pays (Telebirr via Chapa sandbox / cash), and rates the driver
5. **Admin dashboard** shows live revenue, ride counts, and drivers online

---

## 🔌 API Reference

### Auth — `/api/auth`
| Method | Route | Body | Description |
|---|---|---|---|
| POST | `/otp/request` | `{phone}` | Send OTP (dev returns `dev_code`) |
| POST | `/otp/verify` | `{phone, code, role?, name?, plate?}` | Returns JWT + user profile |

### Rides — `/api`
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/landmarks` | — | Semera/Logiya landmark list |
| POST | `/fare-preview` | — | Upfront fare estimate (`{pickup, dropoff, mode, seats}`) |
| POST | `/rides` | rider | Create ride request |
| GET | `/rides/mine` | any | Trip history |
| POST | `/rides/:id/rate` | rider | Rate a completed ride (1–5) |
| GET | `/drivers/nearby?lat&lng&radiusKm` | any | Online drivers near a point |

### Driver — `/api/driver`
| Method | Route | Description |
|---|---|---|
| POST | `/location` | Broadcast GPS `{lat,lng}` |
| POST | `/status` | Go `online` / `offline` |
| GET | `/requests` | Pending ride requests |
| POST | `/accept/:rideId` | Accept a ride |
| POST | `/trip/:rideId/arrived\|in_trip\|completed` | Advance trip lifecycle |

### Payments — `/api/payments`
| Method | Route | Description |
|---|---|---|
| POST | `/pay/:rideId` | Initialize Telebirr/Chapa checkout or record cash |
| GET | `/chapa/verify/:txRef` | Verify a Chapa transaction |
| POST | `/cash/:rideId/confirm` | Driver confirms cash collection |

### Socket.io events
- `ride:subscribe` → join a ride room; receive `ride:status`, `ride:accepted`
- `driver:location`, `driver:status` — broadcast fleet movement
- `admin:subscribe` (admin JWT) → `admin:stats` every 10s

---

## 💵 Fare Model (ETB, Semera–Logiya corridor)

| Component | Value |
|---|---|
| Base fare | 50 ETB |
| Per km | 25 ETB |
| Minimum fare | 60 ETB |
| Shared Pool | × 0.4 per seat (up to 60% cheaper) |
| AfarCargo | × 1.6 |

Tune in [`server/src/fares.js`](server/src/fares.js).

---

## 🐳 Production Deployment

```bash
# API (serves built rider/driver/admin static builds too)
npm run build
docker compose up --build -d
# API on :4000 — rider at /, driver at /driver, admin at /admin
```

Set in `.env`: `JWT_SECRET`, `CHAPA_SECRET_KEY`, `GEMINI_API_KEY` (optional AI navigator), `PUBLIC_URL`.

**Chapa keys**: register at [dashboard.chapa.co](https://dashboard.chapa.co) — docs at [developer.chapa.co](https://developer.chapa.co). Direct Telebirr InApp SDK integration can be added behind the same provider interface in [`server/src/payments.js`](server/src/payments.js).

**Production SMS OTP**: plug [Africa's Talking](https://africastalking.com) or Ethio Telecom Bulk SMS into `authRouter.post('/otp/request')`.

---

## 📄 License

MIT — built for the Afar Regional State transportation ecosystem.
