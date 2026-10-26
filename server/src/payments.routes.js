import { Router } from 'express';
import { db, uid } from './db.js';
import { auth } from './auth.js';
import { newTxRef, initializeChapaPayment, verifyChapaPayment, chapaConfigured } from './payments.js';

export const paymentsRouter = Router();

/**
 * Start a payment for a ride.
 *  - telebirr / cards / CBE Birr → routed through Chapa (one integration, every channel — https://chapa.co)
 *  - cash → recorded directly as pending, settled by the driver on dropoff.
 */
paymentsRouter.post('/pay/:rideId', auth('rider'), async (req, res) => {
  const ride = db.prepare('SELECT * FROM rides WHERE id = ? AND rider_id = ?').get(req.params.rideId, req.user.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (ride.payment_status === 'paid') return res.status(409).json({ error: 'Ride already paid' });

  const provider = ride.payment_method;
  const paymentId = uid();

  if (provider === 'cash') {
    db.prepare('INSERT INTO payments (id, ride_id, provider, amount_etb, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(paymentId, ride.id, 'cash', ride.fare_etb, 'pending', Date.now());
    return res.json({ ok: true, provider: 'cash', status: 'pending', message: 'Pay the driver in ETB cash on dropoff.' });
  }

  const txRef = newTxRef();
  try {
    const result = await initializeChapaPayment({
      amount: ride.fare_etb,
      txRef,
      customer: { phone_number: req.user.phone },
      rideId: ride.id,
      returnUrl: `${process.env.PUBLIC_URL || ''}/pay/success/${ride.id}`,
    });
    db.prepare('INSERT INTO payments (id, ride_id, provider, amount_etb, status, provider_ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(paymentId, ride.id, provider, ride.fare_etb, 'pending', txRef, Date.now());
    db.prepare('UPDATE rides SET chapa_tx_ref = ? WHERE id = ?').run(txRef, ride.id);
    res.json({
      ok: true,
      provider,
      checkout_url: result.checkout_url,
      sandbox: result.mock || !chapaConfigured(),
      message: result.mock ? result.public_message : undefined,
    });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Payment provider error' });
  }
});

/** Chapa verification — called by the return URL / webhook handler after checkout. */
paymentsRouter.get('/chapa/verify/:txRef', async (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE provider_ref = ?').get(req.params.txRef);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  const result = await verifyChapaPayment(req.params.txRef);
  const status = result.status === 'paid' ? 'paid' : result.status === 'failed' ? 'failed' : 'pending';
  db.prepare('UPDATE payments SET status = ? WHERE id = ?').run(status, payment.id);
  if (status === 'paid') {
    db.prepare("UPDATE rides SET payment_status = 'paid' WHERE id = ?").run(payment.ride_id);
  }
  res.json({ ok: true, status, ride_id: payment.ride_id });
});

/** Driver confirms cash collection on dropoff. */
paymentsRouter.post('/cash/:rideId/confirm', auth('driver'), (req, res) => {
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.user.id);
  const ride = db.prepare('SELECT * FROM rides WHERE id = ? AND driver_id = ?').get(req.params.rideId, driver?.id);
  if (!ride) return res.status(404).json({ error: 'Ride not assigned to this driver' });
  db.prepare("UPDATE payments SET status = 'paid' WHERE ride_id = ? AND provider = 'cash'").run(ride.id);
  db.prepare("UPDATE rides SET payment_status = 'paid' WHERE id = ?").run(ride.id);
  res.json({ ok: true });
});
