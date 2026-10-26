import { Router } from 'express';
import { db, uid, haversineKm } from './db.js';
import { estimateFare } from './fares.js';
import { auth } from './auth.js';

export const ridesRouter = Router();

// ---- Landmarks (preserved from the original AfarRide server.ts) ----
export const knownLandmarks = [
  { name: 'Semera University Main Campus', lat: 11.7938, lng: 41.0095, category: 'Education', desc: 'Main academic gates & student center' },
  { name: 'Semera Airport (Sultan Mahmud SDE)', lat: 11.7917, lng: 41.0118, category: 'Transit', desc: 'Commercial flight terminal & parking' },
  { name: 'Afar Regional Government Palace', lat: 11.7980, lng: 41.0040, category: 'Administration', desc: 'Regional President Office & Ministries' },
  { name: 'Sultan Ali Mirah Hospital', lat: 11.7850, lng: 41.0020, category: 'Health', desc: 'Referral hospital in Semera' },
  { name: 'Logiya Central Bus Station', lat: 11.7225, lng: 40.9880, category: 'Transit', desc: 'Intercity coaches, customs & Bajaj hub' },
  { name: 'Logiya Grand Market', lat: 11.7260, lng: 40.9850, category: 'Shopping', desc: 'Major commercial trade center & goods market' },
  { name: 'Lucy Resort & Hotel Semera', lat: 11.7905, lng: 41.0075, category: 'Hotel', desc: 'Popular gathering spot & accommodations' },
  { name: 'Kuriftu Resort Semera', lat: 11.7920, lng: 41.0130, category: 'Hotel', desc: 'Premium resort near airport road' },
  { name: 'Awash River Bridge', lat: 11.7150, lng: 40.9820, category: 'Landmark', desc: 'Scenic bridge along Djibouti-Addis highway' },
  { name: 'Semera Sports Stadium', lat: 11.7890, lng: 41.0060, category: 'Recreation', desc: 'Regional stadium & athletic complex' },
];

ridesRouter.get('/landmarks', (_req, res) => res.json(knownLandmarks));

// ---- Fare preview (no auth needed — same as Uber's upfront pricing) ----
ridesRouter.post('/fare-preview', (req, res) => {
  const { pickup, dropoff, mode = 'private', seats = 1 } = req.body || {};
  if (!pickup?.lat || !dropoff?.lat) return res.status(400).json({ error: 'pickup and dropoff {lat,lng} required' });
  const distanceKm = haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
  const fareEtb = estimateFare({ distanceKm, mode, seats });
  res.json({
    distance_km: Math.round(distanceKm * 10) / 10,
    fare_etb: fareEtb,
    seats: mode === 'pool' ? Math.max(1, Math.min(3, seats)) : 1,
    mode,
    eta_minutes: Math.max(8, Math.round(distanceKm * 3.5)), // Semera–Logiya Hwy average Bajaj speed
  });
});

// ---- Create ride request ----
ridesRouter.post('/rides', auth('rider'), (req, res) => {
  const { pickup, dropoff, mode = 'private', seats = 1, payment_method = 'cash', pickup_label = '', dropoff_label = '' } = req.body || {};
  if (!pickup?.lat || !dropoff?.lat) return res.status(400).json({ error: 'pickup and dropoff required' });
  if (!['telebirr', 'chapa', 'cash'].includes(payment_method)) {
    return res.status(400).json({ error: 'payment_method must be telebirr | chapa | cash' });
  }
  const active = db.prepare("SELECT id FROM rides WHERE rider_id = ? AND status IN ('requested','accepted','arrived','in_trip')").get(req.user.id);
  if (active) return res.status(409).json({ error: 'You already have an active ride', ride_id: active.id });

  const distanceKm = haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
  const fareEtb = estimateFare({ distanceKm, mode, seats });
  const id = uid();
  db.prepare(`INSERT INTO rides (id, rider_id, mode, status, pickup_lat, pickup_lng, pickup_label,
      dropoff_lat, dropoff_lng, dropoff_label, distance_km, fare_etb, seats, payment_method, created_at)
    VALUES (?, ?, ?, 'requested', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.id, mode, pickup.lat, pickup.lng, pickup_label,
      dropoff.lat, dropoff.lng, dropoff_label, Math.round(distanceKm * 10) / 10, fareEtb,
      mode === 'pool' ? Math.max(1, Math.min(3, seats)) : 1, payment_method, Date.now());

  res.json({ ride: db.prepare('SELECT * FROM rides WHERE id = ?').get(id) });
});

// ---- Ride history for the logged-in user ----
ridesRouter.get('/rides/mine', auth(), (req, res) => {
  const rows = db.prepare('SELECT * FROM rides WHERE rider_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json(rows);
});

// ---- Rate a completed ride (Uber-style two-sided ratings) ----
ridesRouter.post('/rides/:id/rate', auth('rider'), (req, res) => {
  const rating = Number(req.body?.rating);
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'rating must be 1-5' });
  const ride = db.prepare('SELECT * FROM rides WHERE id = ? AND rider_id = ?').get(req.params.id, req.user.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (ride.status !== 'completed') return res.status(409).json({ error: 'Only completed rides can be rated' });
  if (ride.rating) return res.status(409).json({ error: 'Ride already rated' });
  db.prepare('UPDATE rides SET rating = ? WHERE id = ?').run(rating, ride.id);
  if (ride.driver_id) {
    db.prepare('UPDATE drivers SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE id = ?')
      .run(rating, ride.driver_id);
  }
  res.json({ ok: true });
});

// ---- Driver endpoints ----
export const driverRouter = Router();

driverRouter.post('/location', auth('driver'), (req, res) => {
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.user.id);
  if (!driver) return res.status(404).json({ error: 'Driver profile not found' });
  const { lat, lng } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'lat/lng numbers required' });
  db.prepare('UPDATE drivers SET lat = ?, lng = ?, last_ping_at = ? WHERE id = ?').run(lat, lng, Date.now(), driver.id);
  req.io.emit('driver:location', { driver_id: driver.id, lat, lng, status: driver.status });
  res.json({ ok: true });
});

driverRouter.post('/status', auth('driver'), (req, res) => {
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.user.id);
  if (!driver) return res.status(404).json({ error: 'Driver profile not found' });
  const status = req.body?.status;
  if (!['online', 'offline'].includes(status)) return res.status(400).json({ error: "status must be 'online' or 'offline'" });
  db.prepare('UPDATE drivers SET status = ? WHERE id = ?').run(status, driver.id);
  req.io.emit('driver:status', { driver_id: driver.id, status });
  res.json({ ok: true, status });
});

driverRouter.get('/requests', auth('driver'), (req, res) => {
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.user.id);
  if (!driver) return res.status(404).json({ error: 'Driver profile not found' });
  const rides = db.prepare(`
    SELECT r.*, u.name AS rider_name, u.phone AS rider_phone
    FROM rides r JOIN users u ON u.id = r.rider_id
    WHERE r.status = 'requested'
    ORDER BY r.created_at DESC LIMIT 20`).all();
  res.json(rides);
});

driverRouter.post('/accept/:rideId', auth('driver'), (req, res) => {
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.user.id);
  if (!driver) return res.status(404).json({ error: 'Driver profile not found' });
  const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(req.params.rideId);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (ride.status !== 'requested') return res.status(409).json({ error: 'Ride no longer available' });
  db.prepare("UPDATE rides SET driver_id = ?, status = 'accepted', accepted_at = ? WHERE id = ?")
    .run(driver.id, Date.now(), ride.id);
  db.prepare("UPDATE drivers SET status = 'on_trip' WHERE id = ?").run(driver.id);
  const updated = db.prepare('SELECT * FROM rides WHERE id = ?').get(ride.id);
  req.io.to(`ride:${ride.id}`).emit('ride:accepted', updated);
  res.json({ ride: updated });
});

driverRouter.post('/trip/:rideId/:status', auth('driver'), (req, res) => {
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.user.id);
  if (!driver) return res.status(404).json({ error: 'Driver profile not found' });
  const { status } = req.params;
  if (!['arrived', 'in_trip', 'completed'].includes(status)) {
    return res.status(400).json({ error: "status must be arrived | in_trip | completed" });
  }
  const ride = db.prepare('SELECT * FROM rides WHERE id = ? AND driver_id = ?').get(req.params.rideId, driver.id);
  if (!ride) return res.status(404).json({ error: 'Ride not assigned to this driver' });
  const now = Date.now();
  if (status === 'completed') {
    db.prepare("UPDATE rides SET status = 'completed', completed_at = ? WHERE id = ?").run(now, ride.id);
    db.prepare(`UPDATE drivers SET status = 'online', total_rides = total_rides + 1,
        total_earnings_etb = total_earnings_etb + ? WHERE id = ?`).run(ride.fare_etb, driver.id);
  } else {
    db.prepare('UPDATE rides SET status = ? WHERE id = ?').run(status, ride.id);
  }
  const updated = db.prepare('SELECT * FROM rides WHERE id = ?').get(ride.id);
  req.io.to(`ride:${ride.id}`).emit('ride:status', updated);
  res.json({ ride: updated });
});

// ---- Nearby online drivers for the rider map ----
ridesRouter.get('/drivers/nearby', auth(), (req, res) => {
  const { lat, lng, radiusKm = 15 } = req.query;
  const drivers = db.prepare("SELECT d.id, d.plate, d.vehicle, d.status, d.lat, d.lng, d.rating_sum, d.rating_count, d.total_rides, u.name FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.status IN ('online','on_trip') AND d.lat IS NOT NULL").all();
  if (lat && lng) {
    const cl = Number(lat), cng = Number(lng), r = Number(radiusKm);
    res.json(drivers
      .map(d => ({ ...d, rating: d.rating_count ? Math.round((d.rating_sum / d.rating_count) * 10) / 10 : 5.0, distance_km: Math.round(haversineKm(cl, cng, d.lat, d.lng) * 10) / 10 }))
      .filter(d => d.distance_km <= r)
      .sort((a, b) => a.distance_km - b.distance_km));
  } else {
    res.json(drivers.map(d => ({ ...d, rating: d.rating_count ? Math.round((d.rating_sum / d.rating_count) * 10) / 10 : 5.0 })));
  }
});
