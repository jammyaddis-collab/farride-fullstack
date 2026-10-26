import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const API = import.meta.env.VITE_API_URL || '';

export default function App() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [rides, setRides] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  const login = async (e) => {
    e.preventDefault();
    setError('');
    const r = await fetch(`${API}/api/auth/otp/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0911000003' }),
    });
    const d = await r.json();
    const code = d.dev_code || '123456';
    const v = await fetch(`${API}/api/auth/otp/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0911000003', code }),
    });
    const vd = await v.json();
    if (vd.token) {
      if (vd.user.role !== 'admin') {
        // elevate: this seeded account is the admin account
        setError('Seeded account is not admin — run `npm run seed --workspace server` to reset.');
        return;
      }
      localStorage.setItem('afarride_admin_token', vd.token);
      setToken(vd.token);
      setUser(vd.user);
    } else setError(vd.error || 'Login failed');
  };

  // auto-login with stored token
  useEffect(() => {
    const t = localStorage.getItem('afarride_admin_token');
    if (t) {
      setToken(t);
      fetch(`${API}/api/rides/mine`, { headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
    }
  }, []);

  // live admin stats over Socket.io
  useEffect(() => {
    if (!token) return;
    const s = io(API || '/', { auth: { token } });
    s.on('connect', () => { setConnected(true); s.emit('admin:subscribe'); });
    s.on('disconnect', () => setConnected(false));
    s.on('admin:stats', setStats);
    return () => s.disconnect();
  }, [token]);

  // recent rides
  useEffect(() => {
    if (!token) return;
    const load = () => fetch(`${API}/api/rides/mine`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => Array.isArray(d) && setRides(d)).catch(() => {});
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [token]);

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <form onSubmit={login} className="bg-slate-900 border border-slate-700 p-8 rounded-3xl w-full max-w-sm text-white">
          <h1 className="text-xl font-black mb-1">🛺 AfarRide Admin</h1>
          <p className="text-xs text-slate-400 mb-6">Operations dashboard · Semera & Logiya</p>
          <button className="w-full py-3 bg-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-500">
            Login as Admin (seeded OTP flow)
          </button>
          {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
          <p className="text-[10px] text-slate-500 mt-4">Requires admin account 0911000003 from `npm run seed`.</p>
        </form>
      </div>
    );
  }

  const cards = [
    ['Total Rides', stats?.total_rides ?? '—', 'text-indigo-300'],
    ['Completed', stats?.completed_rides ?? '—', 'text-emerald-300'],
    ['Revenue (ETB)', stats ? Math.round(stats.revenue_etb).toLocaleString() : '—', 'text-amber-300'],
    ['Drivers Online', stats ? `${stats.drivers_online}/${stats.drivers_total}` : '—', 'text-sky-300'],
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-black">🛺 AfarRide Admin</h1>
            <p className="text-xs text-slate-400">{user?.name} · {connected ? <span className="text-emerald-400">● live</span> : <span className="text-red-400">● offline</span>}</p>
          </div>
          <button onClick={() => { localStorage.removeItem('afarride_admin_token'); setToken(null); }}
            className="text-xs bg-white/10 px-4 py-2 rounded-xl">Logout</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {cards.map(([label, value, color]) => (
            <div key={label} className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
              <p className={`text-3xl font-black ${color}`}>{value}</p>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>

        <h2 className="text-sm font-bold text-slate-300 mb-3">Recent Rides (live feed)</h2>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-800/60 text-slate-400">
              <tr>{['Ride ID', 'Mode', 'Status', 'Fare (ETB)', 'Payment', 'Rating', 'Date'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>))}</tr>
            </thead>
            <tbody>
              {rides.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No rides yet — book one from the rider app.</td></tr>
              )}
              {rides.map(r => (
                <tr key={r.id} className="border-t border-slate-800">
                  <td className="px-4 py-3 font-mono text-slate-400">{r.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3">{r.mode}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      r.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
                      ['requested', 'accepted', 'in_trip', 'arrived'].includes(r.status) ? 'bg-indigo-500/20 text-indigo-300' :
                      'bg-slate-500/20 text-slate-400'}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-amber-300 font-bold">{r.fare_etb}</td>
                  <td className="px-4 py-3">{r.payment_method} · {r.payment_status}</td>
                  <td className="px-4 py-3">{r.rating ? `${'★'.repeat(r.rating)}` : '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
