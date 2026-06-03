# Product Images — Design Spec
**Date:** 2026-06-03  
**Status:** Approved

## Objetivo

Permitir que cada producto del menú tenga una imagen asociada, almacenada como base64 en PostgreSQL. La persistencia en BD garantiza que las imágenes sobreviven reinicios y redeploys en Railway/Render sin necesidad de filesystem persistente ni servicios externos.

---

## Schema — Nueva tabla `ProductImage`

```prisma
model ProductImage {
  id        Int     @id @default(autoincrement())
  productId Int     @unique
  data      String  // base64 del archivo (ej: "/9j/4AAQSkZJRgAB...")
  mimeType  String  // "image/jpeg" | "image/png" | "image/webp"
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
}
```

- Relación `1:1` opcional con `Product` (un producto puede no tener imagen).
- `onDelete: Cascade`: si se elimina el producto, la imagen se elimina automáticamente.
- El campo `imageUrl` existente en `Product` se actualiza a `/api/menu/:id/image` cuando se sube una imagen, y se limpia a `null` cuando se elimina. Esto mantiene compatibilidad con el resto del sistema que ya usa `imageUrl`.

---

## Backend

### Dependencia nueva
- `multer` con **memory storage** (no escribe a disco). Solo se usa para recibir el archivo multipart y convertirlo a base64 en memoria.

### Endpoints nuevos en `routes/menu.js`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/menu/:id/image` | Sube imagen. Recibe `multipart/form-data` con campo `image`. Convierte buffer a base64, hace upsert en `ProductImage`, actualiza `imageUrl` del producto. |
| `GET` | `/api/menu/:id/image` | Sirve la imagen. Lee `ProductImage`, decodifica base64 a Buffer, responde con `Content-Type` correcto y header `Cache-Control: public, max-age=86400`. |
| `DELETE` | `/api/menu/:id/image` | Elimina la fila de `ProductImage` y pone `imageUrl = null` en `Product`. |

### Límite de tamaño
- Multer rechaza archivos mayores a **2 MB** (`limits: { fileSize: 2 * 1024 * 1024 }`).
- Solo se aceptan MIME types: `image/jpeg`, `image/png`, `image/webp`.

### Error handling
- `404` si no existe la imagen al hacer GET.
- `400` si el archivo supera el límite o el tipo no es válido.
- `404` si el producto no existe al hacer POST.

---

## Frontend — Formulario de menú (`MenuTab` en `Admin.jsx`)

El input de texto "URL imagen (opcional)" se reemplaza por:

1. **Preview + botón de carga**: si el producto ya tiene `imageUrl`, muestra la imagen actual (40×40px). Si no, muestra un placeholder gris.
2. **Botón "Cambiar imagen"**: abre un `<input type="file">` oculto que acepta `image/jpeg,image/png,image/webp`.
3. **Preview local inmediata**: al seleccionar un archivo, `FileReader` muestra la preview antes de subir.
4. **Botón "Quitar"**: visible solo si hay imagen actual, llama a `DELETE /api/menu/:id/image`.
5. **Flujo de guardado**:
   - Al hacer submit del formulario: primero POST/PATCH del producto (flujo existente).
   - Si hay imagen nueva pendiente: llama `POST /api/menu/:id/image` con el archivo.
   - El campo `imageUrl` en la respuesta del producto se actualiza automáticamente.

---

## Frontend — Card de producto (`MenuTab`)

Cada card en el grid agrega una imagen pequeña:
- Tamaño: **56×56px**, `object-cover`, bordes redondeados (`rounded-lg`).
- Si `p.imageUrl` existe: `<img src={p.imageUrl} />`.
- Si no: placeholder con emoji de la categoría sobre fondo gris (`bg-gray-100`).
- La imagen se ubica a la izquierda del nombre/precio dentro de la card.

---

## Restricciones y consideraciones

- **Tamaño máximo**: 2 MB por imagen. Suficiente para fotos de comida en alta calidad.
- **Formatos aceptados**: JPEG, PNG, WebP.
- **Sin redimensionado automático**: se guarda el archivo tal como viene. Si en el futuro se quiere optimizar, se puede agregar `sharp` para comprimir antes de guardar.
- **No se cambia el resto del schema**: `imageUrl` en `Product` sigue siendo `String?`, solo se actualiza su valor.
- **Migración necesaria**: `prisma migrate dev` para crear la tabla `ProductImage`.
