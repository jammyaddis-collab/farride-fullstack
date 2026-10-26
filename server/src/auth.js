import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { db, uid } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'afarride-dev-secret-change-me';
const OTP_TTL_MS = 5 * 60 * 1000;

export function signToken(user) {
  return jwt.sign({ id: user.id, phone: user.phone, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

export function auth(requiredRole = null) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Auth token required' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ error: `Requires ${requiredRole} role` });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

/**
 * Phone-based OTP auth — the standard across Ethiopian ride apps (Ride, Feres, Yango):
 * no passwords, just phone number + SMS/Telebirr-style OTP. In production plug in
 * Africa's Talking / Ethio Telecom SMS gateway; in dev the OTP is returned in the
 * response so the flow is testable.
 */
export const authRouter = Router();

authRouter.post('/otp/request', (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  if (!/^\+?\d{9,15}$/.test(phone.replace(/\s/g, ''))) {
    return res.status(400).json({ error: 'Valid phone number required (e.g. 0966393925)' });
  }
  const code = process.env.NODE_ENV === 'production'
    ? String(Math.floor(100000 + Math.random() * 900000))
    : '123456'; // dev OTP
  db.prepare('INSERT INTO otp_codes (phone, code, expires_at, attempts) VALUES (?, ?, ?, 0) ON CONFLICT(phone) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at, attempts=0')
    .run(phone, code, Date.now() + OTP_TTL_MS);
  // TODO(production): send via SMS gateway (Africa's Talking, Ethio Telecom Bulk SMS)
  res.json({ ok: true, dev_code: process.env.NODE_ENV === 'production' ? undefined : code });
});

authRouter.post('/otp/verify', (req, res) => {
  const { phone, code, name, role = 'rider' } = req.body || {};
  const row = db.prepare('SELECT * FROM otp_codes WHERE phone = ?').get(phone);
  if (!row || row.code !== String(code)) return res.status(401).json({ error: 'Invalid OTP code' });
  if (Date.now() > row.expires_at) return res.status(401).json({ error: 'OTP expired, request a new one' });
  db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(phone);

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) {
    const id = uid();
    db.prepare('INSERT INTO users (id, phone, name, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, phone, String(name || `User ${phone.slice(-4)}`), role === 'driver' ? 'driver' : role, Date.now());
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (user.role === 'driver') {
      db.prepare('INSERT OR IGNORE INTO drivers (id, user_id, plate, vehicle) VALUES (?, ?, ?, ?)')
        .run(uid(), id, String(req.body.plate || 'AF-0-0000'), String(req.body.vehicle || 'Bajaj'));
    }
  }
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(user.id) || null;
  res.json({ token: signToken(user), user: { ...user, driver } });
});
