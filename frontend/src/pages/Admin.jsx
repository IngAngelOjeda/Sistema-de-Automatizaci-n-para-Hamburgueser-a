import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import StatusBadge from '../components/StatusBadge.jsx';
import { printTicket } from '../utils/printTicket.js';

const TABS = ['Pedidos', 'Menú', 'Repartidores', 'Estadísticas', 'WhatsApp', 'Bloqueados'];
const CATEGORIES = ['hamburguesa', 'lomito', 'gaseosa', 'extra'];
const SYMBOL = '₲';
const CATEGORY_EMOJI = {
  hamburguesa: '🍔',
  lomito: '🥩',
  gaseosa: '🥤',
  extra: '➕',
};

// ── Shared styles ─────────────────────────────────────────────────────────────
const INPUT = 'bg-brand-surface border border-brand-border text-brand-text placeholder:text-brand-muted rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-yellow transition-colors';
const BTN_PRIMARY = 'bg-brand-yellow text-black font-semibold px-4 py-2 rounded-lg text-sm hover:bg-brand-yellow-light transition-colors whitespace-nowrap';
const BTN_OUTLINE = 'border border-brand-border text-brand-muted px-4 py-2 rounded-lg text-sm hover:border-brand-yellow hover:text-brand-yellow transition-colors';
const BTN_GREEN = 'bg-green-500/10 text-green-400 border border-green-500/30 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-green-500/20 transition-colors whitespace-nowrap';
const BTN_DANGER_SM = 'text-xs text-red-500 hover:text-red-400 transition-colors';
const BTN_YELLOW_SM = 'text-xs text-brand-yellow hover:text-brand-yellow-light transition-colors';

// ── PinGate ───────────────────────────────────────────────────────────────────
function PinGate({ children }) {
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState(false);

  function submit(e) {
    e.preventDefault();
    const correct = import.meta.env.VITE_ADMIN_PIN || '1234';
    if (pin === correct) { setAuthed(true); } else { setError(true); setPin(''); }
  }

  if (authed) return children;
  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4">
      <form onSubmit={submit} className="bg-brand-card border border-brand-border p-8 rounded-xl w-full max-w-xs text-center">
        <p className="font-display text-brand-yellow text-4xl tracking-widest mb-1">ADMIN</p>
        <p className="text-brand-muted text-xs mb-6">Ingresá tu PIN de acceso</p>
        <input
          type="password"
          maxLength={4}
          value={pin}
          onChange={(e) => { setPin(e.target.value); setError(false); }}
          className={`${INPUT} text-center text-2xl tracking-widest w-32`}
          placeholder="· · · ·"
          autoFocus
        />
        {error && <p className="text-red-500 text-xs mt-2">PIN incorrecto</p>}
        <button type="submit" className={`mt-5 w-full ${BTN_PRIMARY} py-2.5`}>
          Entrar
        </button>
      </form>
    </div>
  );
}

// ── OrderRow & OrderTable ─────────────────────────────────────────────────────
const TABLE_HEADERS = ['#', 'Cliente', 'Tipo', 'Dirección', 'Total', 'Estado', 'Hora', 'Acción'];

function OrderRow({ o, actions }) {
  return (
    <tr className="border-t border-brand-border hover:bg-white/5 transition-colors">
      <td className="px-4 py-3 font-display text-brand-yellow text-base tracking-wide">{o.orderNumber}</td>
      <td className="px-4 py-3 text-sm font-medium">{o.clientName}</td>
      <td className="px-4 py-3 text-lg">{o.deliveryType === 'delivery' ? '🛵' : '🏠'}</td>
      <td className="px-4 py-3 text-xs text-brand-muted max-w-[160px] truncate">
        {o.clientAddress || (o.locationUrl
          ? <a href={o.locationUrl} target="_blank" rel="noreferrer" className="text-brand-yellow underline">Ver en Maps</a>
          : '–')}
      </td>
      <td className="px-4 py-3 text-sm font-semibold text-brand-yellow">{SYMBOL}{o.totalAmount?.toLocaleString('es-PY')}</td>
      <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
      <td className="px-4 py-3 text-brand-muted text-xs">{new Date(o.createdAt).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</td>
      <td className="px-4 py-3">{actions}</td>
    </tr>
  );
}

function OrderTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-brand-border">
      <table className="w-full text-sm bg-brand-surface min-w-[640px]">
        <thead className="bg-black/40 text-left">
          <tr>
            {TABLE_HEADERS.map((h) => (
              <th key={h} className="px-4 py-3 text-xs font-semibold text-brand-muted uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

// ── Tab: Pedidos ──────────────────────────────────────────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState({});
  const [search, setSearch] = useState('');
  const [editOrderId, setEditOrderId] = useState(null);
  const [editForm, setEditForm]       = useState(null);
  const [menuProducts, setMenuProducts] = useState([]);

  async function fetchOrders() {
    const data = await fetch('/api/orders').then((r) => r.json());
    setOrders(data);
  }

  useEffect(() => {
    fetchOrders();
    fetch('/api/delivery/drivers').then((r) => r.json()).then(setDrivers);
    fetch('/api/menu').then((r) => r.json()).then((data) => setMenuProducts(data.filter((p) => p.available)));
  }, []);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || '');
    socket.on('new_order', fetchOrders);
    socket.on('order_updated', fetchOrders);
    return () => socket.disconnect();
  }, []);

  async function confirmAndAssign(order) {
    const driverId = selectedDriver[order.id];
    if (order.deliveryType === 'delivery' && !driverId) {
      alert('Seleccioná un repartidor para el delivery');
      return;
    }
    await fetch(`/api/delivery/${order.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId: driverId ? Number(driverId) : null }),
    });
    fetchOrders();
  }

  async function markDelivered(orderId) {
    await fetch(`/api/delivery/${orderId}/delivered`, { method: 'PATCH' });
    fetchOrders();
  }

  function startEdit(o) {
    setEditOrderId(o.id);
    setEditForm({
      clientName: o.clientName,
      clientPhone: o.clientPhone,
      clientAddress: o.clientAddress || '',
      deliveryType: o.deliveryType,
      notes: o.notes || '',
      items: o.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        name: i.product?.name || 'Producto',
      })),
      addProductId: '',
    });
  }

  function cancelEdit() {
    setEditOrderId(null);
    setEditForm(null);
  }

  async function saveEdit(orderId) {
    const { clientName, clientPhone, clientAddress, deliveryType, notes, items } = editForm;
    if (items.length === 0) { alert('El pedido debe tener al menos un producto.'); return; }
    await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName,
        clientPhone,
        clientAddress: deliveryType === 'delivery' ? clientAddress : null,
        deliveryType,
        notes,
        items: items.map(({ productId, quantity, unitPrice }) => ({ productId, quantity, unitPrice })),
      }),
    });
    cancelEdit();
    fetchOrders();
  }

  function EditOrderRow({ orderId }) {
    if (editOrderId !== orderId) return null;

    const liveTotal = editForm.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    function setField(field, value) {
      setEditForm((f) => ({ ...f, [field]: value }));
    }

    function changeQty(idx, delta) {
      setEditForm((f) => {
        const items = f.items.map((item, i) =>
          i === idx ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
        );
        return { ...f, items };
      });
    }

    function removeItem(idx) {
      setEditForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
    }

    function addItem() {
      const product = menuProducts.find((p) => p.id === Number(editForm.addProductId));
      if (!product) return;
      setEditForm((f) => ({
        ...f,
        addProductId: '',
        items: [...f.items, { productId: product.id, quantity: 1, unitPrice: product.price, name: product.name }],
      }));
    }

    return (
      <tr className="bg-brand-card border-t border-brand-yellow/30">
        <td colSpan={8} className="px-4 py-4">
          <div className="space-y-4">

            {/* Datos del cliente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                className={INPUT}
                placeholder="Nombre del cliente"
                value={editForm.clientName}
                onChange={(e) => setField('clientName', e.target.value)}
              />
              <input
                className={INPUT}
                placeholder="Teléfono"
                value={editForm.clientPhone}
                onChange={(e) => setField('clientPhone', e.target.value)}
              />
              <select
                className={INPUT}
                value={editForm.deliveryType}
                onChange={(e) => setField('deliveryType', e.target.value)}
              >
                <option value="delivery">🛵 Delivery</option>
                <option value="pickup">🏠 Retiro en local</option>
              </select>
              {editForm.deliveryType === 'delivery' && (
                <input
                  className={INPUT}
                  placeholder="Dirección"
                  value={editForm.clientAddress}
                  onChange={(e) => setField('clientAddress', e.target.value)}
                />
              )}
            </div>

            {/* Notas */}
            <textarea
              className={`${INPUT} w-full resize-none`}
              rows={2}
              placeholder="Notas (opcional)"
              value={editForm.notes}
              onChange={(e) => setField('notes', e.target.value)}
            />

            {/* Items */}
            <div className="space-y-2">
              {editForm.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm flex-1 min-w-[120px]">{item.name}</span>
                  <span className="text-xs text-brand-muted">
                    {SYMBOL}{item.unitPrice.toLocaleString('es-PY')}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => changeQty(idx, -1)}
                      className="w-6 h-6 rounded bg-brand-surface border border-brand-border text-sm font-bold hover:border-brand-yellow transition-colors"
                    >−</button>
                    <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => changeQty(idx, 1)}
                      className="w-6 h-6 rounded bg-brand-surface border border-brand-border text-sm font-bold hover:border-brand-yellow transition-colors"
                    >+</button>
                  </div>
                  <span className="text-xs text-brand-yellow font-semibold w-20 text-right">
                    {SYMBOL}{(item.unitPrice * item.quantity).toLocaleString('es-PY')}
                  </span>
                  <button type="button" onClick={() => removeItem(idx)} className={BTN_DANGER_SM}>×</button>
                </div>
              ))}

              {/* Agregar producto */}
              <div className="flex gap-2 items-center flex-wrap pt-1">
                <select
                  className={`${INPUT} flex-1 min-w-[180px]`}
                  value={editForm.addProductId}
                  onChange={(e) => setField('addProductId', e.target.value)}
                >
                  <option value="">Agregar producto…</option>
                  {menuProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {SYMBOL}{p.price.toLocaleString('es-PY')}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addItem}
                  disabled={!editForm.addProductId}
                  className={`${BTN_OUTLINE} disabled:opacity-40`}
                >
                  Agregar
                </button>
              </div>
            </div>

            {/* Total + acciones */}
            <div className="flex items-center justify-between flex-wrap gap-3 pt-1 border-t border-brand-border">
              <span className="text-sm font-semibold text-brand-yellow">
                Total: {SYMBOL}{liveTotal.toLocaleString('es-PY')}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={cancelEdit} className={BTN_OUTLINE}>Cancelar</button>
                <button type="button" onClick={() => saveEdit(orderId)} className={BTN_PRIMARY}>
                  Guardar cambios
                </button>
              </div>
            </div>

          </div>
        </td>
      </tr>
    );
  }

  const matchesSearch = (o) =>
    !search ||
    o.orderNumber.includes(search.toUpperCase()) ||
    o.clientName.toLowerCase().includes(search.toLowerCase());

  const pendingOrders = orders.filter((o) => o.status === 'pending' && matchesSearch(o));
  const activeOrders  = orders.filter((o) => ['assigned', 'delivering'].includes(o.status) && matchesSearch(o));
  const doneOrders    = orders.filter((o) => ['delivered', 'cancelled'].includes(o.status) && matchesSearch(o));
  const activeDrivers = drivers.filter((d) => d.active);

  return (
    <div className="space-y-6">
      <input
        className={`${INPUT} w-full sm:w-64`}
        placeholder="Buscar por número o cliente…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <section>
        <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
          Nuevos pedidos <span className="text-brand-yellow ml-1">({pendingOrders.length})</span>
        </h2>
        {pendingOrders.length === 0 ? (
          <p className="text-brand-muted text-sm py-6 text-center border border-brand-border rounded-xl border-dashed">Sin pedidos pendientes</p>
        ) : (
          <OrderTable rows={pendingOrders.map((o) => (
            <React.Fragment key={o.id}>
              <OrderRow o={o} actions={
                <div className="flex gap-2 items-center">
                  <button onClick={() => startEdit(o)} className={BTN_YELLOW_SM}>Editar</button>
                  <span className="hidden md:inline">
                    <button onClick={() => printTicket(o)} className={`${BTN_OUTLINE} text-xs px-3 py-1`}>Imprimir</button>
                  </span>
                  {o.deliveryType === 'delivery' && (
                    <select
                      className={`${INPUT} py-1 text-xs`}
                      value={selectedDriver[o.id] || ''}
                      onChange={(e) => setSelectedDriver((prev) => ({ ...prev, [o.id]: e.target.value }))}
                    >
                      <option value="">Repartidor…</option>
                      {activeDrivers.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  )}
                  <button onClick={() => confirmAndAssign(o)} className={`${BTN_PRIMARY} text-xs px-3 py-1`}>
                    {o.deliveryType === 'delivery' ? 'Confirmar y asignar' : 'Confirmar'}
                  </button>
                </div>
              } />
              <EditOrderRow orderId={o.id} />
            </React.Fragment>
          ))} />
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
          En curso <span className="text-brand-yellow ml-1">({activeOrders.length})</span>
        </h2>
        {activeOrders.length === 0 ? (
          <p className="text-brand-muted text-sm py-6 text-center border border-brand-border rounded-xl border-dashed">Sin pedidos en curso</p>
        ) : (
          <OrderTable rows={activeOrders.map((o) => (
            <React.Fragment key={o.id}>
              <OrderRow o={o} actions={
                <div className="flex gap-2 items-center">
                  <button onClick={() => startEdit(o)} className={BTN_YELLOW_SM}>Editar</button>
                  <span className="hidden md:inline">
                    <button onClick={() => printTicket(o)} className={`${BTN_OUTLINE} text-xs px-3 py-1`}>Imprimir</button>
                  </span>
                  {o.deliveryType === 'pickup' && o.status === 'assigned' ? (
                    <button onClick={() => markDelivered(o.id)} className={BTN_GREEN}>Entregado en local</button>
                  ) : null}
                </div>
              } />
              <EditOrderRow orderId={o.id} />
            </React.Fragment>
          ))} />
        )}
      </section>

      {doneOrders.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-3">
            Historial <span className="ml-1">({doneOrders.length})</span>
          </h2>
          <OrderTable rows={doneOrders.map((o) => (
            <React.Fragment key={o.id}>
              <OrderRow o={o} actions={
                <div className="flex gap-2 items-center">
                  <button onClick={() => startEdit(o)} className={BTN_YELLOW_SM}>Editar</button>
                  <span className="hidden md:inline">
                    <button onClick={() => printTicket(o)} className={`${BTN_OUTLINE} text-xs px-3 py-1`}>Imprimir</button>
                  </span>
                </div>
              } />
              <EditOrderRow orderId={o.id} />
            </React.Fragment>
          ))} />
        </section>
      )}
    </div>
  );
}

// ── Tab: Menú ─────────────────────────────────────────────────────────────────
function MenuTab() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', price: '', category: 'hamburguesa' });
  const [editId, setEditId] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  async function fetchProducts() {
    const data = await fetch('/api/menu').then((r) => r.json());
    setProducts(data);
  }

  useEffect(() => { fetchProducts(); }, []);

  function startEdit(p) {
    setEditId(p.id);
    setForm({ name: p.name, description: p.description || '', price: String(p.price), category: p.category });
    setImageFile(null);
    setImagePreview(p.imageUrl || null);
  }

  function cancelEdit() {
    setEditId(null);
    setForm({ name: '', description: '', price: '', category: 'hamburguesa' });
    setImageFile(null);
    setImagePreview(null);
  }

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function removeImage(id) {
    await fetch(`/api/menu/${id}/image`, { method: 'DELETE' });
    setImagePreview(null);
    setImageFile(null);
    fetchProducts();
  }

  async function save(e) {
    e.preventDefault();
    const body = { name: form.name, description: form.description, price: Number(form.price), category: form.category };
    let saved;
    try {
      if (editId) {
        saved = await fetch(`/api/menu/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then((r) => r.json());
      } else {
        saved = await fetch('/api/menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then((r) => r.json());
      }

      if (!saved.id) throw new Error(saved.error || 'Error al guardar producto');

      if (imageFile) {
        const fd = new FormData();
        fd.append('image', imageFile);
        const imgRes = await fetch(`/api/menu/${saved.id}/image`, { method: 'POST', body: fd }).then((r) => r.json());
        if (!imgRes.id) throw new Error(imgRes.error || 'Error al subir la imagen');
      }
    } catch (err) {
      alert(`Error al guardar: ${err.message}`);
      return;
    }

    setEditId(null);
    setForm({ name: '', description: '', price: '', category: 'hamburguesa' });
    setImageFile(null);
    setImagePreview(null);
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

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="bg-brand-card border border-brand-border p-4 rounded-xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <input required className={INPUT} placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={INPUT} placeholder="Descripción (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input required type="number" className={INPUT} placeholder="Precio" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <select className={INPUT} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-lg overflow-hidden bg-brand-surface border border-brand-border flex items-center justify-center flex-shrink-0">
            {imagePreview
              ? <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
              : <span className="text-2xl">{CATEGORY_EMOJI[form.category] || '🍽️'}</span>
            }
          </div>
          <div className="flex flex-col gap-1">
            <label className={`cursor-pointer ${BTN_YELLOW_SM}`}>
              {imagePreview ? 'Cambiar imagen' : 'Subir imagen'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageChange} />
            </label>
            {imagePreview && editId && (
              <button type="button" onClick={() => removeImage(editId)} className={BTN_DANGER_SM}>Quitar imagen</button>
            )}
            {imagePreview && !editId && (
              <button type="button" onClick={() => { setImagePreview(null); setImageFile(null); }} className={BTN_DANGER_SM}>Quitar</button>
            )}
          </div>
        </div>

        <div className="flex gap-2 sm:col-span-2 md:col-span-1">
          <button type="submit" className={`${BTN_PRIMARY} flex-1`}>
            {editId ? 'Guardar cambios' : 'Agregar producto'}
          </button>
          {editId && <button type="button" onClick={cancelEdit} className={BTN_OUTLINE}>Cancelar</button>}
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {products.map((p) => (
          <div key={p.id} className={`bg-brand-card border border-brand-border rounded-xl p-4 flex items-start gap-3 transition-opacity ${!p.available ? 'opacity-40' : ''}`}>
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-brand-surface border border-brand-border flex items-center justify-center flex-shrink-0">
              {p.imageUrl
                ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'block'; }}
                  />
                : null
              }
              <span className="text-2xl" style={{ display: p.imageUrl ? 'none' : 'block' }}>
                {CATEGORY_EMOJI[p.category] || '🍽️'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-brand-text truncate">{p.name}</p>
              <p className="text-xs text-brand-muted">{p.category} · <span className="text-brand-yellow font-semibold">{SYMBOL}{p.price?.toLocaleString('es-PY')}</span></p>
              {p.description && <p className="text-xs text-brand-muted truncate mt-0.5">{p.description}</p>}
            </div>
            <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
              <button onClick={() => toggle(p.id)} className={`text-xs px-2.5 py-1 rounded-full font-semibold border transition-colors ${p.available ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                {p.available ? 'Activo' : 'Inactivo'}
              </button>
              <button onClick={() => startEdit(p)} className={BTN_YELLOW_SM}>Editar</button>
              <button onClick={() => del(p.id)} className={BTN_DANGER_SM}>Eliminar</button>
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
      <form onSubmit={add} className="bg-brand-card border border-brand-border p-4 rounded-xl flex flex-wrap gap-3">
        <input required className={`${INPUT} flex-1 min-w-[160px]`} placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input required className={`${INPUT} flex-1 min-w-[200px]`} placeholder="Teléfono (ej: 595981123456)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <button type="submit" className={BTN_PRIMARY}>Agregar</button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {drivers.map((d) => (
          <div key={d.id} className="bg-brand-card border border-brand-border rounded-xl p-4 flex justify-between items-center gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-brand-text">{d.name}</p>
              <p className="text-xs text-brand-muted font-mono">{d.phone}</p>
            </div>
            <button onClick={() => toggle(d.id)} className={`text-xs px-3 py-1.5 rounded-full font-semibold border flex-shrink-0 transition-colors ${d.active ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
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

      const itemCount = {};
      orders.forEach((o) => o.items?.forEach((i) => {
        const name = i.product?.name || 'Desconocido';
        itemCount[name] = (itemCount[name] || 0) + i.quantity;
      }));
      const topProduct = Object.entries(itemCount).sort((a, b) => b[1] - a[1])[0];

      const hourCount = {};
      orders.forEach((o) => {
        const h = new Date(o.createdAt).getHours();
        hourCount[h] = (hourCount[h] || 0) + 1;
      });
      const peakHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0];

      setStats({ total: orders.length, delivered, revenue: total, topProduct, peakHour });
    });
  }, []);

  if (!stats) return <p className="text-brand-muted text-sm">Cargando estadísticas…</p>;

  const cards = [
    { label: 'Pedidos del día', value: stats.total },
    { label: 'Entregados', value: stats.delivered },
    { label: 'Ingresos totales', value: `${SYMBOL}${stats.revenue.toLocaleString('es-PY')}` },
    { label: 'Producto más vendido', value: stats.topProduct ? `${stats.topProduct[0]} (×${stats.topProduct[1]})` : '–' },
    { label: 'Hora pico', value: stats.peakHour ? `${stats.peakHour[0]}:00 hs` : '–' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-brand-card border border-brand-border rounded-xl p-6">
          <p className="text-xs text-brand-muted uppercase tracking-wider mb-2">{c.label}</p>
          <p className="text-2xl font-bold text-brand-yellow font-display tracking-wide">{c.value}</p>
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
    connected:    { color: 'bg-green-500/10 text-green-400 border border-green-500/30',    icon: '🟢', label: 'WhatsApp conectado' },
    qr:           { color: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30', icon: '📱', label: 'Esperando escaneo' },
    connecting:   { color: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',        icon: '⏳', label: 'Conectando…' },
    disconnected: { color: 'bg-red-500/10 text-red-400 border border-red-500/30',           icon: '❌', label: 'Desconectado' },
  };
  const cfg = statusConfig[botStatus] || statusConfig.connecting;

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${cfg.color}`}>
        <span>{cfg.icon}</span>
        <span>{cfg.label}</span>
      </div>

      {botStatus === 'qr' && qr && (
        <div className="bg-brand-card border border-brand-border rounded-2xl p-6 flex flex-col items-center gap-4 w-full max-w-xs">
          <p className="text-xs text-brand-muted text-center">
            WhatsApp → Dispositivos vinculados → Vincular dispositivo
          </p>
          <img src={qr} alt="QR WhatsApp" className="w-56 h-56 rounded-xl" />
        </div>
      )}

      {botStatus === 'connected' && (
        <div className="bg-brand-card border border-brand-border rounded-2xl p-8 text-center max-w-sm w-full">
          <p className="font-display text-brand-yellow text-3xl tracking-wide mb-2">ACTIVO</p>
          <p className="text-brand-muted text-sm">Bot recibiendo mensajes de WhatsApp</p>
          <p className="text-xs text-brand-muted mt-2">Para desvincular, usá WhatsApp en tu celular</p>
        </div>
      )}

      {botStatus === 'connecting' && (
        <div className="bg-brand-card border border-brand-border rounded-2xl p-8 text-center max-w-sm w-full">
          <p className="text-brand-muted animate-pulse text-sm">Iniciando conexión con WhatsApp…</p>
        </div>
      )}

      {botStatus === 'disconnected' && (
        <div className="bg-brand-card border border-brand-border rounded-2xl p-8 text-center max-w-sm w-full">
          <p className="text-red-400 text-sm">Bot desconectado. Reiniciá el servidor para reconectar.</p>
        </div>
      )}
    </div>
  );
}

// ── Tab: Bloqueados ───────────────────────────────────────────────────────────
function BlockedTab() {
  const [blocked, setBlocked] = useState([]);
  const [form, setForm] = useState({ phone: '', note: '' });
  const [error, setError] = useState('');

  async function fetchBlocked() {
    const data = await fetch('/api/blocked').then((r) => r.json());
    setBlocked(data);
  }

  useEffect(() => { fetchBlocked(); }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/blocked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: form.phone.trim(), note: form.note.trim() || undefined }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Error al bloquear'); return; }
    setForm({ phone: '', note: '' });
    fetchBlocked();
  }

  async function remove(id) {
    await fetch(`/api/blocked/${id}`, { method: 'DELETE' });
    fetchBlocked();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="bg-brand-card border border-brand-border p-4 rounded-xl flex flex-wrap gap-3">
        <input
          required
          className={`${INPUT} flex-1 min-w-[200px]`}
          placeholder="Número (ej: 595981123456)"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <input
          className={`${INPUT} flex-1 min-w-[160px]`}
          placeholder="Nota (opcional)"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
        <button type="submit" className={BTN_PRIMARY}>Bloquear</button>
      </form>
      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {blocked.length === 0 ? (
          <p className="text-brand-muted text-sm py-6 text-center border border-brand-border rounded-xl border-dashed col-span-2">
            Sin números bloqueados
          </p>
        ) : blocked.map((b) => (
          <div key={b.id} className="bg-brand-card border border-brand-border rounded-xl p-4 flex justify-between items-center gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-brand-text font-mono">{b.phone}</p>
              {b.note && <p className="text-xs text-brand-muted">{b.note}</p>}
              <p className="text-xs text-brand-muted">{new Date(b.createdAt).toLocaleDateString('es-PY')}</p>
            </div>
            <button onClick={() => remove(b.id)} className={`${BTN_DANGER_SM} flex-shrink-0`}>
              Desbloquear
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Admin ────────────────────────────────────────────────────────────────
export default function Admin() {
  const [tab, setTab] = useState(0);

  return (
    <PinGate>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="font-display text-brand-yellow text-4xl tracking-wide mb-5">PANEL ADMIN</h1>

        <div className="flex border-b border-brand-border mb-6 overflow-x-auto">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                tab === i
                  ? 'border-brand-yellow text-brand-yellow'
                  : 'border-transparent text-brand-muted hover:text-brand-text'
              }`}
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
        {tab === 5 && <BlockedTab />}
      </div>
    </PinGate>
  );
}
