import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'afarride.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'rider',      -- rider | driver | admin
  language TEXT NOT NULL DEFAULT 'en',     -- en | am | af
  wallet_balance_etb REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_codes (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id),
  plate TEXT NOT NULL,
  vehicle TEXT NOT NULL DEFAULT 'Bajaj',
  status TEXT NOT NULL DEFAULT 'offline',  -- offline | online | on_trip
  lat REAL, lng REAL,
  rating_sum REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  total_rides INTEGER NOT NULL DEFAULT 0,
  total_earnings_etb REAL NOT NULL DEFAULT 0,
  last_ping_at INTEGER
);

CREATE TABLE IF NOT EXISTS rides (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL REFERENCES users(id),
  driver_id TEXT REFERENCES drivers(id),
  mode TEXT NOT NULL DEFAULT 'private',    -- private | pool | cargo
  status TEXT NOT NULL DEFAULT 'requested',-- requested | accepted | arrived | in_trip | completed | cancelled
  pickup_lat REAL NOT NULL, pickup_lng REAL NOT NULL, pickup_label TEXT DEFAULT '',
  dropoff_lat REAL NOT NULL, dropoff_lng REAL NOT NULL, dropoff_label TEXT DEFAULT '',
  distance_km REAL NOT NULL,
  fare_etb REAL NOT NULL,
  seats INTEGER NOT NULL DEFAULT 1,
  payment_method TEXT NOT NULL DEFAULT 'cash', -- telebirr | chapa | cash
  payment_status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed
  chapa_tx_ref TEXT,
  rating INTEGER,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  ride_id TEXT REFERENCES rides(id),
  provider TEXT NOT NULL,                  -- telebirr | chapa | cash
  amount_etb REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_ref TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trip_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id TEXT NOT NULL REFERENCES rides(id),
  lat REAL NOT NULL, lng REAL NOT NULL,
  recorded_at INTEGER NOT NULL
);
`);

export const uid = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
