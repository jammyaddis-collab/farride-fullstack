import { db, uid } from './db.js';

/**
 * Seed: demo accounts, drivers, rides and landmarks so the apps work instantly.
 * Run: npm run seed --workspace server
 *
 * Demo logins (OTP is "123456" in dev for ANY phone):
 *   Rider  → 0911000001 (Selam T.)
 *   Driver → 0911000002 (Mohammed Ali, plate AF-3-1284)
 *   Admin  → 0911000003 (created with role=admin)
 */
const now = Date.now();

const users = [
  { id: 'u-rider-seed-0001', phone: '0911000001', name: 'Selam Tesfaye', role: 'rider' },
  { id: 'u-driver-seed-0002', phone: '0911000002', name: 'Mohammed Ali', role: 'driver' },
  { id: 'u-admin-seed-0003', phone: '0911000003', name: 'AfarRide Admin', role: 'admin' },
];

const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, phone, name, role, created_at) VALUES (?, ?, ?, ?, ?)');
for (const u of users) insertUser.run(u.id, u.phone, u.name, u.role, now);

const driverUser = users.find(u => u.role === 'driver');
db.prepare(`INSERT OR IGNORE INTO drivers (id, user_id, plate, vehicle, status, lat, lng, rating_sum, rating_count, total_rides)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  .run('d-seed-0001', driverUser.id, 'AF-3-1284', 'Bajaj RE 205', 'online', 11.7920, 41.0055, 4.9 * 142, 142, 142);

const rider = users.find(u => u.role === 'rider');
db.prepare(`INSERT OR IGNORE INTO rides (id, rider_id, mode, status, pickup_lat, pickup_lng, pickup_label,
    dropoff_lat, dropoff_lng, dropoff_label, distance_km, fare_etb, seats, payment_method, payment_status, rating, created_at, completed_at)
  VALUES (?, ?, 'private', 'completed', 11.7938, 41.0095, 'Semera University Main Campus',
    11.7225, 40.9880, 'Logiya Central Bus Station', 8.2, 255, 1, 'telebirr', 'paid', 5, ?, ?)`)
  .run('ride-seed-0001', rider.id, now - 86400000, now - 86400000 + 1200000);

console.log('✅ Seed complete. Demo OTP for any phone in dev mode: 123456');
console.log('   Rider 0911000001 · Driver 0911000002 · Admin 0911000003');
