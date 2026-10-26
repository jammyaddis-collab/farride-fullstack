import 'dotenv/config';

/**
 * Chapa — unified Ethiopian payment gateway (Telebirr, CBE Birr, cards, mobile money).
 * Docs: https://developer.chapa.co/
 *   Initialize:  POST https://api.chapa.co/v1/transaction/initialize
 *   Verify:      GET  https://api.chapa.co/v1/transaction/verify/:tx_ref
 * Telebirr direct (Ethio Telecom InApp SDK / H5 C2B) can be plugged in behind the
 * same provider interface; Chapa is used as the default aggregator because it
 * settles Telebirr, CBE Birr, M-PESA and cards through one API.
 */

const CHAPA_BASE = process.env.CHAPA_BASE_URL || 'https://api.chapa.co/v1';
const CHAPA_KEY = process.env.CHAPA_SECRET_KEY || '';

export function chapaConfigured() {
  return Boolean(CHAPA_KEY);
}

export function newTxRef() {
  return `AFARRIDE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/**
 * Initialize a Chapa payment. Returns the checkout URL the rider is redirected to.
 * When CHAPA_SECRET_KEY is not set (dev/sandbox), returns a mock checkout so the
 * full ride flow stays testable end-to-end without live keys.
 */
export async function initializeChapaPayment({ amount, txRef, customer, rideId, returnUrl }) {
  if (!chapaConfigured()) {
    return {
      mock: true,
      checkout_url: `/pay/mock/${txRef}`,
      public_message: 'Chapa sandbox mode — set CHAPA_SECRET_KEY in .env for live Telebirr/CBE checkout.',
    };
  }
  const res = await fetch(`${CHAPA_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CHAPA_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: String(amount),
      currency: 'ETB',
      tx_ref: txRef,
      callback_url: returnUrl || `${process.env.PUBLIC_URL || ''}/api/payments/chapa/verify/${txRef}`,
      return_url: returnUrl || '',
      customization: { title: 'AfarRide', description: `Ride ${rideId}` },
      ...(customer?.phone ? { customer: customer } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok || data.status !== 'success') {
    throw new Error(data.message || 'Chapa initialization failed');
  }
  return { mock: false, checkout_url: data.data.checkout_url };
}

export async function verifyChapaPayment(txRef) {
  if (!chapaConfigured()) return { mock: true, status: 'paid' };
  const res = await fetch(`${CHAPA_BASE}/transaction/verify/${txRef}`, {
    headers: { Authorization: `Bearer ${CHAPA_KEY}` },
  });
  const data = await res.json();
  if (!res.ok || data.status !== 'success') return { status: 'failed' };
  return { status: data.data.status === 'success' ? 'paid' : 'pending', provider_ref: data.data.reference };
}
