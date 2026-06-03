import StatusBadge from './StatusBadge.jsx';

function elapsed(createdAt) {
  return Math.floor((Date.now() - new Date(createdAt)) / 60000);
}

function urgencyBorder(mins) {
  if (mins < 15) return 'border-l-green-500';
  if (mins < 25) return 'border-l-yellow-500';
  return 'border-l-red-500';
}

export default function OrderCard({ order, actions }) {
  const mins = elapsed(order.createdAt);

  return (
    <div className={`bg-brand-card rounded-xl border border-brand-border border-l-4 ${urgencyBorder(mins)} p-4`}>
      <div className="flex justify-between items-start mb-2 gap-2">
        <div className="min-w-0">
          <span className="font-display text-brand-yellow text-xl tracking-wide">{order.orderNumber}</span>
          <span className="ml-2 text-xs text-brand-muted">{mins} min</span>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <p className="text-sm text-brand-text mb-1">
        <span className="font-medium">{order.clientName}</span>
        <span className="text-brand-muted"> · {order.deliveryType === 'delivery' ? '🛵 Delivery' : '🏠 Retiro'}</span>
      </p>

      {order.clientAddress && (
        <p className="text-xs text-brand-muted mb-1 truncate">📍 {order.clientAddress}</p>
      )}
      {order.locationUrl && !order.clientAddress && (
        <a href={order.locationUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-yellow underline">
          Ver en Maps 🗺️
        </a>
      )}

      <ul className="mt-2 text-sm space-y-0.5 text-brand-text">
        {order.items?.map((item) => (
          <li key={item.id} className="text-brand-muted">
            <span className="text-brand-text font-medium">{item.quantity}x</span> {item.product?.name}
          </li>
        ))}
      </ul>

      <p className="mt-2 font-bold text-right text-brand-yellow">
        ₲{order.totalAmount?.toLocaleString('es-PY')}
      </p>

      {actions && <div className="mt-3 flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
