import 'dotenv/config';

export const FARE = {
  baseFareETB: 50,          // base flag-down fare for a Bajaj charter
  perKmETB: 25,             // per-kilometer rate on the Semera–Logiya corridor
  poolSeatFactor: 0.4,      // shared pool pays ~40% of private fare per seat (up to 60% saving)
  cargoMultiplier: 1.6,     // AfarCargo freight multiplier (goods, luggage, wholesale parcels)
  minimumFareETB: 60,
};

export function estimateFare({ distanceKm, mode = 'private', seats = 1 }) {
  let fare = FARE.baseFareETB + distanceKm * FARE.perKmETB;
  if (mode === 'pool') fare = fare * FARE.poolSeatFactor * Math.max(1, Math.min(3, seats));
  if (mode === 'cargo') fare = fare * FARE.cargoMultiplier;
  return Math.max(FARE.minimumFareETB, Math.round(fare));
}
