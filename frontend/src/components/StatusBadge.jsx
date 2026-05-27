const STATUS_CONFIG = {
  pending:    { label: 'Pendiente',   color: 'bg-yellow-100 text-yellow-800' },
  assigned:   { label: 'Confirmado',  color: 'bg-blue-100 text-blue-800' },
  delivering: { label: 'En camino',   color: 'bg-orange-100 text-orange-800' },
  delivered:  { label: 'Entregado',   color: 'bg-gray-100 text-gray-600' },
  cancelled:  { label: 'Cancelado',   color: 'bg-red-100 text-red-800' },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}
