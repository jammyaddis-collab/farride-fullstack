import { useEffect, useRef, useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const authHeaders = () => {
  const token = localStorage.getItem('afarride_driver_token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('afarride_driver_user') || 'null'); } catch { return null; }
  });
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [online, setOnline] = useState(false);
  const [requests, setRequests] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [stats, setStats] = useState({ total_rides: 0, total_earnings_etb: 0, rating: 5.0 });
  const watchRef = useRef(null);

  const driverStatus = async (token) => {
    // status is derived from the driver profile after verify; default offline
    setOnline(false);
    return token;
  };

  const requestOtp = async () => {
    const r = await fetch(`${API}/api/auth/otp/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const d = await r.json();
    if (d.ok) setOtpSent(true); else alert(d.error);
  };

  const verifyOtp = async () => {
    const r = await fetch(`${API}/api/auth/otp/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code: otp, role: 'driver' }),
    });
    const d = await r.json();
    if (d.token) {
      localStorage.setItem('afarride_driver_token', d.token);
      localStorage.setItem('afarride_driver_user', JSON.stringify(d.user));
      setUser(d.user);
    } else alert(d.error);
  };

  const refreshRequests = async () => {
    const r = await fetch(`${API}/api/driver/requests`, { headers: authHeaders() });
    if (r.status === 403 || r.status === 404) return;
    const d = await r.json();
    if (Array.isArray(d)) setRequests(d);
  };

  const toggleOnline = async () => {
    const next = !online;
    setOnline(next);
    await fetch(`${API}/api/driver/status`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ status: next ? 'online' : 'offline' }),
    });
    if (next) {
      watchRef.current = navigator.geolocation?.watchPosition(
        p => fetch(`${API}/api/driver/location`, {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude }),
        }).catch(() => {}),
        () => {}, { enableHighAccuracy: true }
      );
    } else if (watchRef.current) {
      navigator.geolocation?.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  };

  const accept = async (rideId) => {
    const r = await fetch(`${API}/api/driver/accept/${rideId}`, {
      method: 'POST', headers: authHeaders(),
    });
    const d = await r.json();
    if (d.ride) { setActiveRide(d.ride); setRequests(reqs => reqs.filter(x => x.id !== rideId)); }
    else alert(d.error);
  };

  const advance = async (rideId, status) => {
    const r = await fetch(`${API}/api/driver/trip/${rideId}/${status}`, {
      method: 'POST', headers: authHeaders(),
    });
    const d = await r.json();
    if (d.ride) {
      if (status === 'completed') {
        setActiveRide(null);
        if (d.ride.payment_method === 'cash') {
          await fetch(`${API}/api/payments/cash/${rideId}/confirm`, { method: 'POST', headers: authHeaders() }).catch(() => {});
        }
      } else setActiveRide(d.ride);
    } else alert(d.error);
  };

  // Poll for new requests while online
  useEffect(() => {
    if (!user || !online) return;
    refreshRequests();
    const iv = setInterval(refreshRequests, 5000);
    return () => clearInterval(iv);
  }, [user, online]);

  // ---------- Auth ----------
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white/95 p-8 rounded-3xl shadow-2xl w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl">🛺</div>
            <h1 className="text-xl font-black text-slate-800 mt-2">AfarRide Driver Console</h1>
            <p className="text-xs text-slate-500">Bajaj driver sign-in</p>
          </div>
          {!otpSent ? (
            <>
              <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel"
                placeholder="09xxxxxxxx" className="w-full px-4 py-3 rounded-xl bg-slate-100 mb-3 text-sm" />
              <button onClick={requestOtp} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm">Send OTP</button>
            </>
          ) : (
            <>
              <input value={otp} onChange={e => setOtp(e.target.value)} inputMode="numeric" maxLength={6}
                placeholder="OTP code" className="w-full px-4 py-3 rounded-xl bg-slate-100 mb-3 text-center text-xl tracking-[0.5em]" />
              <button onClick={verifyOtp} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm">Verify & Start Driving</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const rating = user.driver?.rating_count
    ? Math.round((user.driver.rating_sum / user.driver.rating_count) * 10) / 10 : 5.0;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-lg font-black">🛺 AfarRide Driver</h1>
            <p className="text-xs text-slate-400">{user.name} · {user.driver?.plate}</p>
          </div>
          <button onClick={() => { localStorage.clear(); setUser(null); }}
            className="text-xs bg-white/10 px-3 py-2 rounded-xl">Logout</button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white/10 p-3 rounded-2xl text-center">
            <p className="text-xl font-black text-indigo-300">{user.driver?.total_rides ?? 0}</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Rides</p>
          </div>
          <div className="bg-white/10 p-3 rounded-2xl text-center">
            <p className="text-xl font-black text-amber-300">{rating}</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Stars</p>
          </div>
          <div className="bg-white/10 p-3 rounded-2xl text-center">
            <p className="text-xl font-black text-emerald-300">{Math.round(user.driver?.total_earnings_etb ?? 0)}</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">ETB Earned</p>
          </div>
        </div>

        <button onClick={toggleOnline}
          className={`w-full py-4 rounded-2xl font-black text-sm mb-4 ${online
            ? 'bg-red-500/20 text-red-300 border border-red-400/40'
            : 'bg-emerald-600 shadow-lg shadow-emerald-900/50'}`}>
          {online ? '⏸ Go Offline' : '▶ Go Online & Receive Rides'}
        </button>
        {online && <p className="text-center text-[11px] text-slate-400 mb-4">
          Broadcasting live GPS on the Semera–Logiya network…
        </p>}

        {activeRide ? (
          <div className="bg-white/10 p-4 rounded-2xl mb-4">
            <p className="text-sm font-black text-emerald-300 mb-1">
              {activeRide.status === 'accepted' ? '→ Pick up passenger' : activeRide.status === 'arrived' ? '✓ At pickup — start trip' : '→ Driving to dropoff'}
            </p>
            <p className="text-xs text-slate-300 mb-3">
              {activeRide.pickup_label || 'Pickup'} → {activeRide.dropoff_label || 'Dropoff'}<br />
              {activeRide.distance_km} km · <b className="text-amber-300">{activeRide.fare_etb} ETB</b> · {activeRide.payment_method}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {activeRide.status === 'accepted' && (
                <button onClick={() => advance(activeRide.id, 'arrived')}
                  className="col-span-2 py-3 bg-indigo-600 rounded-xl text-xs font-bold">📍 I've Arrived at Pickup</button>
              )}
              {activeRide.status === 'arrived' && (
                <button onClick={() => advance(activeRide.id, 'in_trip')}
                  className="col-span-2 py-3 bg-emerald-600 rounded-xl text-xs font-bold">▶ Start Trip</button>
              )}
              {activeRide.status === 'in_trip' && (
                <button onClick={() => advance(activeRide.id, 'completed')}
                  className="col-span-2 py-3 bg-emerald-600 rounded-xl text-xs font-bold">✓ Complete Trip · {activeRide.payment_method === 'cash' ? 'Collect Cash' : 'Fare Prepaid'}</button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {online && requests.length === 0 && (
              <p className="text-center text-xs text-slate-500 py-8">Waiting for ride requests…</p>
            )}
            {requests.map(rq => (
              <div key={rq.id} className="bg-white/10 p-4 rounded-2xl">
                <p className="text-sm font-bold">{rq.rider_name}</p>
                <p className="text-xs text-slate-300 mb-3">{rq.pickup_label || 'Semera'} → {rq.dropoff_label || 'Logiya'} · {rq.distance_km} km · <b className="text-amber-300">{rq.fare_etb} ETB</b></p>
                <button onClick={() => accept(rq.id)} className="w-full py-3 bg-indigo-600 rounded-xl text-xs font-bold">Accept Ride</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
