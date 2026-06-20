export function printTicket(order) {
  const storeName = (import.meta.env.VITE_STORE_NAME || 'LOMI LIZ').toUpperCase();
  const date = new Date(order.createdAt);
  const dateStr = date.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });

  const W = 32;
  const LINE = '='.repeat(W);
  const DASH = '-'.repeat(W);

  function center(str) {
    const pad = Math.max(0, Math.floor((W - str.length) / 2));
    return ' '.repeat(pad) + str;
  }

  function rpad(left, right) {
    const gap = Math.max(1, W - left.length - right.length);
    return left + ' '.repeat(gap) + right;
  }

  const lines = [
    LINE,
    center(storeName),
    LINE,
    `Pedido: ${order.orderNumber}`,
    `${dateStr}  ${timeStr} hs`,
    DASH,
    `Cliente: ${order.clientName}`,
    `Tel:     ${order.clientPhone}`,
    `Tipo:    ${order.deliveryType === 'delivery' ? 'DELIVERY' : 'RETIRO EN LOCAL'}`,
  ];

  if (order.deliveryType === 'delivery' && order.clientAddress) {
    lines.push(`Dir:     ${order.clientAddress}`);
  }

  lines.push(DASH);

  order.items?.forEach((item) => {
    const qty = String(item.quantity).padStart(2, ' ');
    const name = item.product?.name || 'Producto';
    const subtotal = `G ${(item.unitPrice * item.quantity).toLocaleString('es-PY')}`;
    lines.push(`${qty}  ${name}`);
    lines.push(subtotal.padStart(W, ' '));
  });

  lines.push(DASH);

  if (order.notes) {
    lines.push(`Notas: ${order.notes}`);
    lines.push(DASH);
  }

  const totalStr = `G ${order.totalAmount?.toLocaleString('es-PY')}`;
  lines.push(rpad('TOTAL:', totalStr));
  lines.push(LINE);
  lines.push(center('¡Gracias por tu pedido!'));
  lines.push(LINE);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: 58mm auto; margin: 2mm 3mm; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 13px; font-weight: bold; width: 52mm; margin: 0; padding: 0; white-space: pre; }
</style>
</head>
<body>${lines.join('\n')}</body>
</html>`;

  const win = window.open('', '_blank', 'width=320,height=600');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  win.addEventListener('afterprint', () => win.close());
}
