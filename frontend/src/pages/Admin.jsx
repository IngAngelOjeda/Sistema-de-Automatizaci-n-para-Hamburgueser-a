import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import StatusBadge from '../components/StatusBadge.jsx';

const TABS = ['Pedidos', 'Menú', 'Repartidores', 'Estadísticas', 'WhatsApp'];
const CATEGORIES = ['hamburguesa', 'lomito', 'gaseosa', 'extra'];
const SYMBOL = '₲';

function PinGate({ children }) {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState(false);

  function submit(e) {
    e.preventDefault();
    // PIN validado contra variable de entorno expuesta opcionalmente, por defecto 1234
    const correct = import.meta.env.VITE_ADMIN_PIN || '1234';
    if (pin === correct) { setAuthed(true); } else { setError(true); setPin(''); }
  }

  if (authed) return children;
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <form onSubmit={submit} className="bg-white p-8 rounded-xl shadow text-center">
        <h2 className="text-xl font-bold mb-4">🔒 Acceso Admin</h2>
        <input
          type="password"
          maxLength={4}
          value={pin}
          onChange={(e) => { setPin(e.target.value); setError(false); }}
          className="border-2 rounded-lg px-4 py-2 text-center text-2xl tracking-widest w-32"
          placeholder="PIN"
          autoFocus
        />
        {error && <p className="text-red-500 text-sm mt-2">PIN incorrecto</p>}
        <button type="submit" className="mt-4 block w-full bg-orange-600 text-white py-2 rounded-lg font-medium hover:bg-orange-700">
          Entrar
        </button>
      </form>
    </div>
  );
}

// ── Tab: Pedidos ──────────────────────────────────────────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const url = filter ? `/api/orders?status=${filter}` : '/api/orders';
    fetch(url).then((r) => r.json()).then(setOrders);
  }, [filter]);

  const visible = orders.filter((o) =>
    !search || o.orderNumber.includes(search.toUpperCase()) || o.clientName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          className="border rounded-lg px-3 py-2 text-sm w-48"
          placeholder="Buscar por número o cliente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="border rounded-lg px-3 py-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          {['pending','confirmed','preparing','ready','delivering','delivered','cancelled'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm bg-white rounded-xl shadow">
          <thead className="bg-gray-50 text-left">
            <tr>
              {['#', 'Cliente', 'Teléfono', 'Tipo', 'Total', 'Estado', 'Hora'].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="px-4 py-3 font-mono font-semibold">{o.orderNumber}</td>
                <td className="px-4 py-3">{o.clientName}</td>
                <td className="px-4 py-3">{o.clientPhone}</td>
                <td className="px-4 py-3">{o.deliveryType === 'delivery' ? '🛵' : '🏠'}</td>
                <td className="px-4 py-3">{SYMBOL}{o.totalAmount?.toLocaleString('es-PY')}</td>
                <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                <td className="px-4 py-3 text-gray-500">{new Date(o.createdAt).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Menú ─────────────────────────────────────────────────────────────────
function MenuTab() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', price: '', category: 'hamburguesa', imageUrl: '' });
  const [editId, setEditId] = useState(null);

  async function fetchProducts() {
    const data = await fetch('/api/menu').then((r) => r.json());
    setProducts(data);
  }

  useEffect(() => { fetchProducts(); }, []);

  async function save(e) {
    e.preventDefault();
    const body = { ...form, price: Number(form.price) };
    if (editId) {
      await fetch(`/api/menu/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setEditId(null);
    } else {
      await fetch('/api/menu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    setForm({ name: '', description: '', price: '', category: 'hamburguesa', imageUrl: '' });
    fetchProducts();
  }

  async function toggle(id) {
    await fetch(`/api/menu/${id}/toggle`, { method: 'PATCH' });
    fetchProducts();
  }

  async function del(id) {
    if (!confirm('¿Eliminar este producto?')) return;
    await fetch(`/api/menu/${id}`, { method: 'DELETE' });
    fetchProducts();
  }

  function startEdit(p) {
    setEditId(p.id);
    setForm({ name: p.name, description: p.description || '', price: String(p.price), category: p.category, imageUrl: p.imageUrl || '' });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="bg-white p-4 rounded-xl shadow grid grid-cols-2 md:grid-cols-3 gap-3">
        <input required className="border rounded-lg px-3 py-2 text-sm col-span-2 md:col-span-1" placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input required type="number" className="border rounded-lg px-3 py-2 text-sm" placeholder="Precio" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <select className="border rounded-lg px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="border rounded-lg px-3 py-2 text-sm" placeholder="URL imagen (opcional)" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
        <button type="submit" className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 col-span-2 md:col-span-1">
          {editId ? 'Guardar cambios' : 'Agregar producto'}
        </button>
        {editId && <button type="button" onClick={() => { setEditId(null); setForm({ name: '', description: '', price: '', category: 'hamburguesa', imageUrl: '' }); }} className="border px-4 py-2 rounded-lg text-sm">Cancelar</button>}
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {products.map((p) => (
          <div key={p.id} className={`bg-white rounded-xl shadow p-4 flex justify-between items-start ${!p.available ? 'opacity-50' : ''}`}>
            <div>
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs text-gray-500">{p.category} · {SYMBOL}{p.price?.toLocaleString('es-PY')}</p>
              {p.description && <p className="text-xs text-gray-400">{p.description}</p>}
            </div>
            <div className="flex flex-col gap-1 items-end ml-2">
              <button onClick={() => toggle(p.id)} className={`text-xs px-2 py-1 rounded-full font-medium ${p.available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {p.available ? 'Activo' : 'Inactivo'}
              </button>
              <button onClick={() => startEdit(p)} className="text-xs text-blue-600 hover:underline">Editar</button>
              <button onClick={() => del(p.id)} className="text-xs text-red-600 hover:underline">Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Repartidores ─────────────────────────────────────────────────────────
function DriversTab() {
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '' });

  async function fetchDrivers() {
    const data = await fetch('/api/delivery/drivers').then((r) => r.json());
    setDrivers(data);
  }

  useEffect(() => { fetchDrivers(); }, []);

  async function add(e) {
    e.preventDefault();
    await fetch('/api/delivery/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setForm({ name: '', phone: '' });
    fetchDrivers();
  }

  async function toggle(id) {
    await fetch(`/api/delivery/drivers/${id}/toggle`, { method: 'PATCH' });
    fetchDrivers();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="bg-white p-4 rounded-xl shadow flex gap-3 flex-wrap">
        <input required className="border rounded-lg px-3 py-2 text-sm" placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input required className="border rounded-lg px-3 py-2 text-sm" placeholder="Teléfono (ej: 595981123456)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <button type="submit" className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700">Agregar</button>
      </form>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {drivers.map((d) => (
          <div key={d.id} className="bg-white rounded-xl shadow p-4 flex justify-between items-center">
            <div>
              <p className="font-semibold">{d.name}</p>
              <p className="text-xs text-gray-500">{d.phone}</p>
            </div>
            <button onClick={() => toggle(d.id)} className={`text-xs px-3 py-1 rounded-full font-medium ${d.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {d.active ? 'Activo' : 'Inactivo'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Estadísticas ─────────────────────────────────────────────────────────
function StatsTab() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    fetch(`/api/orders?date=${today}`).then((r) => r.json()).then((orders) => {
      const total = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
      const delivered = orders.filter((o) => o.status === 'delivered').length;

      // Producto más vendido
      const itemCount = {};
      orders.forEach((o) => o.items?.forEach((i) => {
        const name = i.product?.name || 'Desconocido';
        itemCount[name] = (itemCount[name] || 0) + i.quantity;
      }));
      const topProduct = Object.entries(itemCount).sort((a, b) => b[1] - a[1])[0];

      // Hora pico
      const hourCount = {};
      orders.forEach((o) => {
        const h = new Date(o.createdAt).getHours();
        hourCount[h] = (hourCount[h] || 0) + 1;
      });
      const peakHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0];

      setStats({ total: orders.length, delivered, revenue: total, topProduct, peakHour });
    });
  }, []);

  if (!stats) return <p className="text-gray-500">Cargando estadísticas…</p>;

  const cards = [
    { label: 'Pedidos del día', value: stats.total },
    { label: 'Entregados', value: stats.delivered },
    { label: 'Ingresos totales', value: `${SYMBOL}${stats.revenue.toLocaleString('es-PY')}` },
    { label: 'Producto más vendido', value: stats.topProduct ? `${stats.topProduct[0]} (${stats.topProduct[1]})` : '–' },
    { label: 'Hora pico', value: stats.peakHour ? `${stats.peakHour[0]}:00 hs` : '–' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl shadow p-6">
          <p className="text-sm text-gray-500">{c.label}</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Tab: WhatsApp ─────────────────────────────────────────────────────────────
function WhatsAppTab() {
  const [botStatus, setBotStatus] = useState('connecting');
  const [qr, setQr] = useState(null);

  useEffect(() => {
    // Cargar estado inicial vía REST por si el bot ya está conectado
    fetch('/api/bot/status')
      .then((r) => r.json())
      .then(({ status, qr: q }) => { setBotStatus(status); setQr(q); });

    const socket = io(import.meta.env.VITE_SOCKET_URL || '');
    socket.on('bot_status', ({ status, qr: q }) => {
      setBotStatus(status);
      setQr(q || null);
    });
    return () => socket.disconnect();
  }, []);

  const statusConfig = {
    connected:    { color: 'bg-green-100 text-green-700',  icon: '✅', label: 'WhatsApp conectado' },
    qr:           { color: 'bg-yellow-100 text-yellow-700', icon: '📱', label: 'Esperando escaneo' },
    connecting:   { color: 'bg-blue-100 text-blue-700',    icon: '⏳', label: 'Conectando…' },
    disconnected: { color: 'bg-red-100 text-red-700',      icon: '❌', label: 'Desconectado' },
  };
  const cfg = statusConfig[botStatus] || statusConfig.connecting;

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm ${cfg.color}`}>
        <span>{cfg.icon}</span>
        <span>{cfg.label}</span>
      </div>

      {botStatus === 'qr' && qr && (
        <div className="bg-white rounded-2xl shadow-lg p-6 flex flex-col items-center gap-3">
          <p className="text-sm text-gray-500">Abrí WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
          <img src={qr} alt="QR WhatsApp" className="w-64 h-64 rounded-lg" />
        </div>
      )}

      {botStatus === 'connected' && (
        <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-500">
          <p className="text-4xl mb-3">🟢</p>
          <p className="font-semibold text-gray-700">Bot activo y recibiendo mensajes</p>
          <p className="text-sm mt-1">Para desvincular, usá WhatsApp en tu celular</p>
        </div>
      )}

      {botStatus === 'connecting' && (
        <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-400">
          <p className="text-4xl mb-3 animate-pulse">⏳</p>
          <p>Iniciando conexión con WhatsApp…</p>
        </div>
      )}

      {botStatus === 'disconnected' && (
        <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-400">
          <p className="text-4xl mb-3">📵</p>
          <p>Bot desconectado. Reiniciá el servidor para reconectar.</p>
        </div>
      )}
    </div>
  );
}

// ── Main Admin ────────────────────────────────────────────────────────────────
export default function Admin() {
  const [tab, setTab] = useState(0);

  return (
    <PinGate>
      <div className="max-w-5xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">⚙️ Panel Admin</h1>
        <div className="flex gap-2 mb-6 border-b">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition ${tab === i ? 'border-orange-600 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === 0 && <OrdersTab />}
        {tab === 1 && <MenuTab />}
        {tab === 2 && <DriversTab />}
        {tab === 3 && <StatsTab />}
        {tab === 4 && <WhatsAppTab />}
      </div>
    </PinGate>
  );
}
