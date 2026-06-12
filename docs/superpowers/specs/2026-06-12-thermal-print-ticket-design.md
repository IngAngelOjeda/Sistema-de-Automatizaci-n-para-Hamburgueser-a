# Diseño: Impresión de ticket térmico

**Fecha:** 2026-06-12
**Alcance:** Frontend únicamente — sin cambios en backend ni base de datos

## Contexto

El sistema de hamburguesería tiene un panel admin (React/Vite) donde los operadores gestionan pedidos en tiempo real. Se necesita imprimir cada pedido en una ticketera térmica 58IIB conectada por Bluetooth a una PC Windows. La impresora está registrada como impresora del sistema en Windows, por lo que aparece en el diálogo estándar de impresión del navegador.

## Decisiones tomadas

- **Método de impresión:** `window.print()` con ventana popup — sin dependencias nuevas
- **Disparador:** Botón "Imprimir" en la columna de acciones de cada fila de pedido en el panel admin
- **Sin auto-print silencioso:** El diálogo del navegador es aceptable para el operador
- **Sin cambios de backend:** Todo el formateo del ticket ocurre en el frontend
- **Oculto en móvil:** El botón no se renderiza en pantallas < 768px — la ticketera Bluetooth está pareada con la PC, no con el celular; mostrarlo en móvil solo generaría confusión

## Archivos

### Nuevo: `frontend/src/utils/printTicket.js`

Función exportada `printTicket(order)` que:
1. Abre `window.open('', '_blank', 'width=320,height=600')`
2. Escribe el HTML del ticket con `doc.write()`
3. Llama a `win.print()`
4. Escucha el evento `afterprint` para cerrar la ventana

### Modificado: `frontend/src/pages/Admin.jsx`

- En `OrdersTab`, agregar el botón "Imprimir" en el prop `actions` de cada `OrderRow` para las secciones "Nuevos pedidos", "En curso" e "Historial"
- El botón usa el estilo `BTN_OUTLINE` existente
- El botón se envuelve en `<span className="hidden md:inline">` para ocultarse en pantallas móviles (< 768px), ya que la ticketera solo está disponible en la PC

## Formato del ticket (58mm)

```
================================
     [VITE_STORE_NAME]
================================
Pedido: ORD-001
12/06/2026  14:30 hs
--------------------------------
Cliente: Juan Pérez
Tel:     0981 123456
Tipo:    DELIVERY
Dir:     Av. España 1234
--------------------------------
  2  Hamburguesa Clásica
                    G 45.000
  1  Gaseosa 500ml
                    G  8.000
--------------------------------
Notas: Sin cebolla
--------------------------------
TOTAL:             G 98.000
================================
    ¡Gracias por tu pedido!
================================
```

### CSS del ticket

```css
@page { size: 58mm auto; margin: 2mm 3mm; }
body {
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
  width: 52mm;
  margin: 0;
  padding: 0;
}
```

### Variable de entorno

`VITE_STORE_NAME` en `frontend/.env` — nombre del local que aparece en el encabezado. Si no está definida, usa `"MI LOCAL"` como fallback.

## Contenido del ticket

| Campo | Condición |
|---|---|
| Nombre del local | Siempre (desde `VITE_STORE_NAME`) |
| Número de pedido | Siempre |
| Fecha y hora | Siempre (formateada en `es-PY`) |
| Nombre del cliente | Siempre |
| Teléfono del cliente | Siempre |
| Tipo: DELIVERY / RETIRO | Siempre |
| Dirección | Solo si `deliveryType === 'delivery'` |
| Líneas de items (qty + nombre + precio) | Siempre |
| Notas | Solo si existen |
| Total | Siempre |
| Pie: mensaje de agradecimiento | Siempre |

## Fuera de alcance

- Impresión automática sin diálogo (requeriría QZ Tray u otra app auxiliar)
- Generación desde el backend
- Configuración del pie del ticket desde el panel admin
- Logo gráfico (las ticketeras 58mm de bajo costo tienen soporte limitado para imágenes)
