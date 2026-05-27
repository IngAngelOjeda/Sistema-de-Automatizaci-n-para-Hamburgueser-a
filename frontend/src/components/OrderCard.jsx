import StatusBadge from './StatusBadge.jsx';

function elapsed(createdAt) {
  const mins = Math.floor((Date.now() - new Date(createdAt)) / 60000);
  return mins;
}

function urgencyClass(mins) {
  if (mins < 15) return 'border-green-400';
  if (mins < 25) return 'border-yellow-400';
  return 'border-red-500';
}

export default function OrderCard({ order, actions }) {
  const mins = elapsed(order.createdAt);
  const symbol = '₲';

  return (
    <div className={`bg-white rounded-xl shadow border-l-4 p-4 ${urgencyClass(mins)}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <span className="font-bold text-lg">{order.orderNumber}</span>
          <span className="ml-2 text-sm text-gray-500">{mins} min</span>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <p className="text-sm text-gray-600 mb-1">
        <span className="font-medium">{order.clientName}</span>
        {order.deliveryType === 'delivery' ? ' · 🛵 Delivery' : ' · 🏠 Retiro'}
      </p>

      {order.clientAddress && (
        <p className="text-xs text-gray-500 mb-1">📍 {order.clientAddress}</p>
      )}
      {order.locationUrl && (
        <a
          href={order.locationUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-600 underline"
        >
          Ver en Maps 🗺️
        </a>
      )}

      <ul className="mt-2 text-sm space-y-0.5">
        {order.items?.map((item) => (
          <li key={item.id}>
            {item.quantity}x {item.product?.name}
          </li>
        ))}
      </ul>

      <p className="mt-2 font-semibold text-right text-orange-700">
        {symbol}{order.totalAmount?.toLocaleString('es-PY')}
      </p>

      {actions && <div className="mt-3 flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
