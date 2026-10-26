import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { io } from 'socket.io-client';

const API = import.meta.env.VITE_API_URL || '';
const SEMERA = [11.7925, 41.0055];

// ---------- Trilingual translations (Qafaraf · አማርኛ · English) ----------
const T = {
  en: {
    title: 'AfarRide', tagline: 'Semera & Logiya Corridor',
    phone: 'Phone number', sendOtp: 'Send OTP', otp: '6-digit OTP code', verify: 'Verify & Continue',
    whereTo: 'Where to?', pickup: 'Pickup', dropoff: 'Dropoff', useGps: 'Use my GPS location',
    findBajaj: 'Find Nearby Bajaj', searching: 'Connecting to nearest Bajaj…', dispatched: 'Bajaj dispatched',
    arriving: 'Arriving in', enRoute: 'En route to', arrived: 'Your Bajaj has arrived', inTrip: 'On the way to',
    completed: 'Trip Completed', totalPaid: 'Total Paid', bookAnother: 'Book Another Ride',
    privateMode: 'Private Charter (Inki Kire)', poolMode: 'Shared Pool (Biyak Kire)', cargoMode: 'AfarCargo (Maalu Kire)',
    perSeat: 'per seat', payWith: 'Pay with', fare: 'Fare', km: 'km', eta: 'ETA',
    sos: 'Emergency SOS', shareTrip: 'Share Live Trip', rating: 'Rate your driver', aiGuide: 'AI Navigator',
    history: 'Trip History', logout: 'Logout', demoOtp: 'Dev OTP: 123456',
  },
  am: {
    title: 'አፋር ራይድ', tagline: 'ሰመራ እና ሎግያ ኮሪደር',
    phone: 'ስልክ ቁጥር', sendOtp: 'ኮድ ላክ', otp: '6-አሃዝ ኮድ', verify: 'አረጋግጥ እና ቀጥል',
    whereTo: 'ወዴት ትፈልጋለህ?', pickup: 'መነሻ', dropoff: 'መድረሻ', useGps: 'የእኔን አካባቢ ተጠቀም',
    findBajaj: 'አቅራቢያ ባጃጅ ፈልግ', searching: 'ከአቅራቢያ ባጃጅ ጋር በመገናኘት ላይ…', dispatched: 'ባጃጁ ተልኳል',
    arriving: 'ይደርሳል በ', enRoute: 'በጉዞ ላይ ወደ', arrived: 'ባጃጁ ደርሶአል', inTrip: 'በጉዞ ላይ ወደ',
    completed: 'ጉዞው ተጠናቋል', totalPaid: 'አጠቃላይ የተከፈለ', bookAnother: 'ሌላ ጉዞ ይያዙ',
    privateMode: 'የግል ቻርተር', poolMode: 'የጋራ ጉዞ', cargoMode: 'አፋር ካርጎ',
    perSeat: 'በአንድ ወንበር', payWith: 'ክፈል በ', fare: 'ክፍያ', km: 'ኪ.ሜ', eta: 'የጉዞ ጊዜ',
    sos: 'ድንገተኛ እርዳታ', shareTrip: 'ጉዞዬን አጋራ', rating: 'ሹፍንጥርዎን ይገምግሙ', aiGuide: 'የአሜሪካ መሪ',
    history: 'የጉዞ ታሪክ', logout: 'ውጣ', demoOtp: 'የሙከራ ኮድ: 123456',
  },
  af: {
    title: 'AfarRide', tagline: 'Semera kee Logiya Gino',
    phone: 'Simada lakal', sendOtp: 'Kodih gey', otp: '6 xabbak kod', verify: 'Keenih agati',
    whereTo: 'Hinnay haa?', pickup: 'Nammay', dropoff: 'Gasu', useGps: 'Annih GPS gey',
    findBajaj: 'Nuqtih Bajaj is', searching: 'Bajaj kaa baada…', dispatched: 'Bajaj dirirto',
    arriving: 'Gino', enRoute: 'Gino', arrived: 'Bajaj yemmoye', inTrip: 'Gino',
    completed: 'Gino dakh', totalPaid: 'Kafaar', bookAnother: 'Namma gino',
    privateMode: 'Inki Kire', poolMode: 'Biyak Kire', cargoMode: 'Maalu Kire',
    perSeat: 'kihadih', payWith: 'Kafaar', fare: 'Kafaar', km: 'km', eta: 'Zaman',
    sos: 'Taafta', shareTrip: 'Gino wadir', rating: 'Wadir yab', aiGuide: 'Adda yab',
    history: 'Gino taariikh', logout: 'Cibilsim', demoOtp: 'Kod: 123456',
  },
};

const authHeaders = () => {
  const token = localStorage.getItem('afarride_token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

function makeIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
    iconSize: [22, 22], iconAnchor: [11, 11],
  });
}
const bajajIcon = makeIcon('#4f46e5');
const pickupIcon = makeIcon('#059669');
const dropoffIcon = makeIcon('#dc2626');

function Recenter({ pos }) {
  const map = useMap();
  useEffect(() => { if (pos) map.setView(pos, map.getZoom() || 14); }, [pos?.[0], pos?.[1]]);
  return null;
}

export default function App() {
  const token = localStorage.getItem('afarride_token');
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('afarride_user') || 'null'); } catch { return null; }
  });
  const [lang, setLang] = useState(localStorage.getItem('afarride_lang') || 'en');
  const t = T[lang] || T.en;

  // auth state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState('');

  // ride state
  const [landmarks, setLandmarks] = useState([]);
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [mode, setMode] = useState('private');
  const [seats, setSeats] = useState(1);
  const [payMethod, setPayMethod] = useState('telebirr');
  const [preview, setPreview] = useState(null);
  const [ride, setRide] = useState(null);
  const [nearby, setNearby] = useState([]);
  const [history, setHistory] = useState([]);
  const [rating, setRating] = useState(0);
  const [pos, setPos] = useState(null);
  const socketRef = useRef(null);

  const ST = { map: 'hybrid', satellite: 'satellite', streets: 'streets' };
  const [mapType, setMapType] = useState('map');
  const tileUrl = {
    map: 'https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    streets: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  }[mapType];
  const tileOpts = mapType === 'map'
    ? { subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], maxZoom: 20 }
    : { maxZoom: 19 };

  // fetch landmarks + nearby drivers
  useEffect(() => {
    fetch(`${API}/api/landmarks`).then(r => r.json()).then(setLandmarks).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch(`${API}/api/driver/requests`.replace('/driver/requests', '/drivers/nearby'), { headers: authHeaders() })
      .then(r => r.json()).then(d => Array.isArray(d) && setNearby(d)).catch(() => {});
    fetch(`${API}/api/rides/mine`, { headers: authHeaders() })
      .then(r => r.json()).then(d => Array.isArray(d) && setHistory(d)).catch(() => {});
    const iv = setInterval(() => {
      navigator.geolocation?.getCurrentPosition(
        p => setPos([p.coords.latitude, p.coords.longitude]),
        () => {}, { enableHighAccuracy: true });
    }, 15000);
    navigator.geolocation?.getCurrentPosition(
      p => setPos([p.coords.latitude, p.coords.longitude]), () => {}, { enableHighAccuracy: true });
    return () => clearInterval(iv);
  }, [user]);

  // live socket updates for the active ride
  useEffect(() => {
    if (!ride?.id) return;
    const s = io(API || '/', { transports: ['websocket', 'polling'] });
    socketRef.current = s;
    s.emit('ride:subscribe', ride.id);
    s.on('ride:status', (updated) => setRide(prev => ({ ...prev, ...updated })));
    s.on('ride:accepted', (updated) => setRide(updated));
    return () => s.disconnect();
  }, [ride?.id]);

  const requestOtp = async () => {
    const r = await fetch(`${API}/api/auth/otp/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const d = await r.json();
    if (d.ok) { setOtpSent(true); setDevCode(d.dev_code || ''); }
    else alert(d.error);
  };

  const verifyOtp = async () => {
    const r = await fetch(`${API}/api/auth/otp/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code: otp }),
    });
    const d = await r.json();
    if (d.token) {
      localStorage.setItem('afarride_token', d.token);
      localStorage.setItem('afarride_user', JSON.stringify(d.user));
      setUser(d.user);
    } else alert(d.error);
  };

  const choosePoint = (kind, lm) => {
    const p = { lat: lm.lat, lng: lm.lng };
    if (kind === 'pickup') setPickup(p); else setDropoff(p);
    setPreview(null);
  };

  const farePreview = async () => {
    if (!pickup || !dropoff) return alert(t.whereTo);
    const r = await fetch(`${API}/api/fare-preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickup, dropoff, mode, seats }),
    });
    setPreview(await r.json());
  };

  const requestRide = async () => {
    const r = await fetch(`${API}/api/rides`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        pickup, dropoff, mode, seats, payment_method: payMethod,
        pickup_label: pickup.label || '', dropoff_label: dropoff.label || '',
      }),
    });
    const d = await r.json();
    if (d.ride) setRide(d.ride); else alert(d.error);
  };

  const pay = async () => {
    const r = await fetch(`${API}/api/payments/pay/${ride.id}`, {
      method: 'POST', headers: authHeaders(),
    });
    const d = await r.json();
    if (d.checkout_url && !d.sandbox) window.location.href = d.checkout_url;
    else if (d.ok) alert(d.message || `Payment status: ${d.status}`);
    else alert(d.error);
  };

  const shareTrip = () => {
    if (!ride) return;
    const url = `https://maps.google.com/?q=${ride.pickup_lat},${ride.pickup_lng}`;
    const text = `My AfarRide trip: ${ride.pickup_label || 'Semera'} → ${ride.dropoff_label || 'Logiya'}. Live location: ${url}`;
    if (navigator.share) navigator.share({ title: 'AfarRide Trip', text });
    else window.open(`https://t.me/share/url?url=${encodeURIComponent(text)}`);
  };

  const sos = () => { window.location.href = 'tel:0966393925'; };

  const rateRide = async (stars) => {
    setRating(stars);
    await fetch(`${API}/api/rides/${ride.id}/rate`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ rating: stars }),
    });
  };

  const resetRide = () => { setRide(null); setPreview(null); setDropoff(null); setPickup(null); setRating(0); };

  const logout = () => {
    localStorage.removeItem('afarride_token');
    localStorage.removeItem('afarride_user');
    setUser(null);
  };

  const statusLabel = {
    requested: t.searching, accepted: t.dispatched, arrived: t.arrived,
    in_trip: t.enTrip = t.inTrip, completed: t.completed,
  }[ride?.status] || '';

  // ---------- Auth screen ----------
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-700 to-emerald-600 flex items-center justify-center p-4">
        <div className="bg-white/95 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl">🛺</div>
            <h1 className="text-2xl font-black text-slate-800 mt-2">{t.title}</h1>
            <p className="text-xs text-slate-500 font-semibold">{t.tagline}</p>
          </div>
          <div className="flex gap-2 justify-center mb-6">
            {Object.keys(T).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${lang === l ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {l === 'en' ? 'English' : l === 'am' ? 'አማርኛ' : 'Qafaraf'}
              </button>
            ))}
          </div>
          {!otpSent ? (
            <>
              <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel"
                placeholder="09xxxxxxxx" className="w-full px-4 py-3 rounded-xl bg-slate-100 mb-3 text-sm outline-none focus:ring-2 ring-indigo-400" />
              <button onClick={requestOtp} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700">
                {t.sendOtp}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-2">{t.otp} {devCode && <b>({t.demoOtp})</b>}</p>
              <input value={otp} onChange={e => setOtp(e.target.value)} inputMode="numeric" maxLength={6}
                placeholder="● ● ● ● ● ●" className="w-full px-4 py-3 rounded-xl bg-slate-100 mb-3 text-center text-xl tracking-[0.5em] outline-none focus:ring-2 ring-indigo-400" />
              <button onClick={verifyOtp} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700">
                {t.verify}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---------- Main rider UI ----------
  return (
    <div className="h-screen flex flex-col bg-slate-900 relative">
      {/* Map */}
      <div className="absolute inset-0">
        <MapContainer center={SEMERA} zoom={14} className="h-full w-full" zoomControl={false}>
          <TileLayer url={tileUrl} {...tileOpts} />
          <Recenter pos={pos} />
          {pos && <Circle center={pos} radius={40} pathOptions={{ color: '#4f46e5', fillOpacity: 0.2 }} />}
          {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}><Popup>{t.pickup}</Popup></Marker>}
          {dropoff && <Marker position={[dropoff.lat, dropoff.lng]} icon={dropoffIcon}><Popup>{t.dropoff}</Popup></Marker>}
          {pickup && dropoff && (
            <Polyline positions={[[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]]}
              pathOptions={{ color: '#4f46e5', weight: 5, opacity: 0.7 }} />
          )}
          {nearby.map(d => (
            <Marker key={d.id} position={[d.lat, d.lng]} icon={bajajIcon}>
              <Popup><b>{d.name}</b><br />{d.plate} · {d.vehicle}<br />⭐ {d.rating} · {d.distance_km} km</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Top bar */}
      <div className="relative z-[1000] flex justify-between items-center p-3">
        <div className="bg-white/95 rounded-2xl px-4 py-2 shadow-lg">
          <p className="text-sm font-black text-indigo-700">🛺 {t.title}</p>
          <p className="text-[10px] text-slate-500">{t.tagline}</p>
        </div>
        <div className="flex gap-2">
          <select value={mapType} onChange={e => setMapType(e.target.value)}
            className="bg-white/95 rounded-xl px-2 py-2 text-xs font-bold shadow-lg">
            <option value="map">🛰️ Hybrid</option>
            <option value="satellite">🛰️ Satellite</option>
            <option value="streets">🗺️ Streets</option>
          </select>
          <select value={lang} onChange={e => { setLang(e.target.value); localStorage.setItem('afarride_lang', e.target.value); }}
            className="bg-white/95 rounded-xl px-2 py-2 text-xs font-bold shadow-lg">
            <option value="en">EN</option><option value="am">አማ</option><option value="af">QF</option>
          </select>
          <button onClick={logout} className="bg-white/95 rounded-xl px-3 py-2 text-xs font-bold text-red-600 shadow-lg">✕</button>
        </div>
      </div>

      {/* Bottom sheet */}
      <div className="relative z-[1000] mt-auto mx-3 mb-3 bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-4 max-h-[60vh] overflow-y-auto">
        {ride?.status === 'completed' ? (
          <div className="text-center">
            <div className="text-3xl mb-2">🎉</div>
            <p className="font-black text-slate-800">{t.completed}</p>
            <p className="text-xs text-slate-500 mt-1">{t.totalPaid}: <b className="text-emerald-600">{ride.fare_etb} ETB</b></p>
            <div className="flex justify-center gap-1.5 my-3">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => rateRide(s)}
                  className={`text-2xl transition-transform hover:scale-125 ${s <= rating ? 'text-amber-400' : 'text-slate-300'}`}>★</button>
              ))}
            </div>
            <button onClick={resetRide} className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm">{t.bookAnother}</button>
          </div>
        ) : ride ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-sm font-black text-slate-800">{statusLabel}</p>
            </div>
            <p className="text-xs text-slate-600">
              {ride.pickup_label || 'Semera'} → {ride.dropoff_label || 'Logiya'} · {ride.distance_km} {t.km} · {ride.fare_etb} ETB
            </p>
            {ride.status === 'completed' && null}
            {ride.status === 'in_trip' || ride.status === 'accepted' || ride.status === 'arrived' ? (
              <button onClick={shareTrip} className="mt-3 w-full py-2.5 bg-slate-800 text-white rounded-xl text-xs font-bold">
                📍 {t.shareTrip}
              </button>
            ) : null}
            {(ride.status === 'requested' || ride.status === 'accepted' || ride.status === 'arrived' || ride.status === 'in_trip') && ride.payment_status !== 'paid' && (
              <button onClick={pay} className="mt-2 w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold">
                💳 {t.payWith} {ride.payment_method === 'telebirr' ? 'Telebirr' : ride.payment_method === 'chapa' ? 'Chapa' : 'Cash'}
              </button>
            )}
            <button onClick={sos} className="mt-2 w-full py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold">
              🆘 {t.sos}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm font-black text-slate-800 mb-2">{t.whereTo}</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                ['private', `🛺 ${t.privateMode}`],
                ['pool', `👥 ${t.poolMode}`],
                ['cargo', `📦 ${t.cargoMode}`],
              ].map(([m, label]) => (
                <button key={m} onClick={() => { setMode(m); setPreview(null); }}
                  className={`p-2 rounded-xl text-[10px] font-bold leading-tight ${mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {label}
                </button>
              ))}
            </div>
            <select value="" onChange={e => { const lm = landmarks[+e.target.value]; if (lm) choosePoint('pickup', lm); }}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-100 text-xs mb-2">
              <option value="">📍 {t.pickup} — {pickup?.label || (pos ? `${pos[0].toFixed(4)}, ${pos[1].toFixed(4)}` : '—')}</option>
              {landmarks.map((lm, i) => <option key={lm.name} value={i}>{lm.name}</option>)}
            </select>
            <select value="" onChange={e => { const lm = landmarks[+e.target.value]; if (lm) choosePoint('dropoff', { ...lm, label: lm.name }); }}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-100 text-xs mb-3">
              <option value="">🏁 {t.dropoff}</option>
              {landmarks.map((lm, i) => <option key={lm.name} value={i}>{lm.name}</option>)}
            </select>
            {mode === 'pool' && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-slate-500">Seats</span>
                {[1, 2, 3].map(s => (
                  <button key={s} onClick={() => { setSeats(s); setPreview(null); }}
                    className={`w-8 h-8 rounded-full text-xs font-bold ${seats === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{s}</button>
                ))}
              </div>
            )}
            {preview && (
              <div className="p-3 rounded-xl bg-indigo-50 mb-3 flex justify-between text-xs">
                <span>{preview.distance_km} {t.km} · {preview.eta_minutes} min</span>
                <b className="text-indigo-700">{preview.fare_etb} ETB {mode === 'pool' && `(${t.perSeat}×${seats})`}</b>
              </div>
            )}
            <div className="flex gap-2 mb-3">
              {['telebirr', 'chapa', 'cash'].map(p => (
                <button key={p} onClick={() => setPayMethod(p)}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-bold ${payMethod === p ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {p === 'telebirr' ? 'Telebirr' : p === 'chapa' ? 'Chapa / CBE' : '💵 Cash'}
                </button>
              ))}
            </div>
            <button onClick={preview ? requestRide : farePreview}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm">
              {preview ? t.findBajaj : t.whereTo}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
