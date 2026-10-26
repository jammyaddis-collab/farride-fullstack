import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { Server as SocketServer } from 'socket.io';
import { db } from './db.js';
import { authRouter, auth } from './auth.js';
import { ridesRouter, driverRouter } from './rides.js';
import { paymentsRouter } from './payments.routes.js';
import { aiRouter } from './ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'afarride-dev-secret-change-me';

const app = express();
app.use(cors());
app.use(express.json());

// REST API
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'AfarRide API', time: Date.now() }));
app.use('/api/auth', authRouter);
app.use('/api', ridesRouter);
app.use('/api/payments', auth(), paymentsRouter);
app.use('/api/ai', aiRouter);

// Driver routes need Socket.io access for live emits — inject it
const driverWithIO = (req, res, next) => { req.io = io; driverRouter(req, res, next); };
app.use('/api/driver', driverWithIO);

// Serve built front-ends when present (production single-origin mode)
const staticApps = [
  ['/driver', '../../driver-app/dist'],
  ['/admin', '../../admin-dashboard/dist'],
];
for (const [mount, rel] of staticApps) {
  const dir = path.join(__dirname, rel);
  if (fs.existsSync(dir)) app.use(mount, express.static(dir));
}
const riderDist = path.join(__dirname, '../../rider-app/dist');
if (fs.existsSync(riderDist)) app.use(express.static(riderDist));

// --- 404 + error handler for API ---
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));

const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: '*' } });

// Socket.io auth (optional — anonymous map watchers allowed, ride rooms need nothing secret)
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try { socket.user = jwt.verify(token, JWT_SECRET); } catch { /* treat as anonymous */ }
  }
  next();
});

io.on('connection', (socket) => {
  // Riders (and drivers) subscribe to a ride room for live status + driver location
  socket.on('ride:subscribe', (rideId) => {
    if (typeof rideId !== 'string') return;
    socket.join(`ride:${rideId}`);
    const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId);
    if (ride) socket.emit('ride:status', ride);
  });

  // Admin dashboard watches aggregate stats
  socket.on('admin:subscribe', () => {
    if (socket.user?.role !== 'admin') return;
    socket.join('admin');
    socket.emit('admin:stats', getAdminStats());
  });
});

function getAdminStats() {
  return {
    total_rides: db.prepare('SELECT COUNT(*) c FROM rides').get().c,
    completed_rides: db.prepare("SELECT COUNT(*) c FROM rides WHERE status='completed'").get().c,
    revenue_etb: db.prepare("SELECT COALESCE(SUM(fare_etb),0) s FROM rides WHERE payment_status='paid'").get().s,
    drivers_online: db.prepare("SELECT COUNT(*) c FROM drivers WHERE status IN ('online','on_trip')").get().c,
    drivers_total: db.prepare('SELECT COUNT(*) c FROM drivers').get().c,
  };
}

// Broadcast admin stats every 10s
setInterval(() => io.to('admin').emit('admin:stats', getAdminStats()), 10000);

server.listen(PORT, () => {
  console.log(`🛺 AfarRide API listening on http://localhost:${PORT}`);
  console.log('   Rider app  → http://localhost:5173  (npm run dev:rider)');
  console.log('   Driver app → http://localhost:5174  (npm run dev:driver)');
  console.log('   Admin      → http://localhost:5175  (npm run dev:admin)');
});

export { io };
