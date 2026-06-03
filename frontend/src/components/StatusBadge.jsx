const STATUS_CONFIG = {
  pending:    { label: 'Pendiente',  color: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30' },
  assigned:   { label: 'Confirmado', color: 'bg-blue-500/10 text-blue-400 border border-blue-500/30' },
  delivering: { label: 'En camino',  color: 'bg-orange-500/10 text-orange-400 border border-orange-500/30' },
  delivered:  { label: 'Entregado',  color: 'bg-green-500/10 text-green-400 border border-green-500/30' },
  cancelled:  { label: 'Cancelado',  color: 'bg-red-500/10 text-red-400 border border-red-500/30' },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-brand-surface text-brand-muted border border-brand-border' };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}
