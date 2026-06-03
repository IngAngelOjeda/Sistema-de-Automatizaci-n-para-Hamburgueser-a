# Product Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subir una imagen por producto del menú, almacenarla como base64 en PostgreSQL, servirla vía endpoint REST, y mostrarla en el panel admin con preview en el formulario y thumbnail en cada card.

**Architecture:** Nueva tabla `ProductImage` con relación `1:1` a `Product`. El backend recibe el archivo con multer (memory storage), convierte a base64 y hace upsert. El campo `imageUrl` existente en `Product` se actualiza a `/api/menu/:id/image` para que el frontend la consuma igual que antes.

**Tech Stack:** `multer` (memory storage), Prisma (PostgreSQL), React con `FileReader` API para preview local.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `backend/prisma/schema.prisma` | Modificar | Agregar modelo `ProductImage` y relación en `Product` |
| `backend/src/routes/menu.js` | Modificar | Agregar endpoints POST/GET/DELETE `/:id/image` con multer |
| `backend/package.json` | Modificar | Agregar dependencia `multer` |
| `frontend/src/pages/Admin.jsx` | Modificar | `MenuTab`: reemplazar input URL por file picker + preview en form y cards |

---

## Task 1: Instalar multer y migrar schema

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Instalar multer**

Desde la carpeta `backend/`:
```bash
cd backend && npm install multer
```
Resultado esperado: `added 1 package` (o similar), `multer` aparece en `dependencies` de `package.json`.

- [ ] **Step 2: Agregar `ProductImage` al schema y la relación en `Product`**

En `backend/prisma/schema.prisma`, agregar el nuevo modelo al final del archivo y la línea `image` dentro de `Product`:

```prisma
model Product {
  id          Int           @id @default(autoincrement())
  name        String
  description String?
  price       Float
  category    String
  imageUrl    String?
  available   Boolean       @default(true)
  createdAt   DateTime      @default(now())
  orderItems  OrderItem[]
  image       ProductImage?
}

// ... resto de modelos existentes sin cambios ...

model ProductImage {
  id        Int     @id @default(autoincrement())
  productId Int     @unique
  data      String  // base64 del archivo
  mimeType  String  // "image/jpeg" | "image/png" | "image/webp"
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 3: Ejecutar la migración**

```bash
cd backend && npx prisma migrate dev --name add-product-image
```
Resultado esperado:
```
✔ Generated Prisma Client
The following migration(s) have been created and applied from new schema changes:
migrations/YYYYMMDDHHMMSS_add_product_image/migration.sql
```

- [ ] **Step 4: Verificar la tabla en la BD**

```bash
cd backend && npx prisma studio
```
Abrir `http://localhost:5555` y confirmar que existe la tabla `ProductImage`.  
Cerrar Prisma Studio (Ctrl+C) antes de continuar.

- [ ] **Step 5: Commit**

```bash
cd backend && git add prisma/schema.prisma package.json package-lock.json prisma/migrations/
git commit -m "feat: add ProductImage schema and multer dependency"
```

---

## Task 2: Agregar endpoints de imagen en menu route

**Files:**
- Modify: `backend/src/routes/menu.js`

- [ ] **Step 1: Agregar import de multer y configurar instancia**

Al principio de `backend/src/routes/menu.js`, después de los imports existentes:

```javascript
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';

const router = Router();
const prisma = new PrismaClient();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIME_TYPES.includes(file.mimetype));
  },
});
```

- [ ] **Step 2: Agregar `POST /:id/image`**

Agregar antes del bloque `export default router;`:

```javascript
// POST /api/menu/:id/image
router.post('/:id/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagen no proporcionada o tipo inválido (jpeg/png/webp)' });
    const id = Number(req.params.id);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const data = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    await prisma.productImage.upsert({
      where: { productId: id },
      update: { data, mimeType },
      create: { productId: id, data, mimeType },
    });

    const updated = await prisma.product.update({
      where: { id },
      data: { imageUrl: `/api/menu/${id}/image` },
      include: { image: false },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Agregar `GET /:id/image`**

Agregar después del endpoint POST de imagen y antes del `export default`:

```javascript
// GET /api/menu/:id/image
router.get('/:id/image', async (req, res) => {
  try {
    const image = await prisma.productImage.findUnique({
      where: { productId: Number(req.params.id) },
    });
    if (!image) return res.status(404).json({ error: 'Image not found' });

    const buffer = Buffer.from(image.data, 'base64');
    res.set('Content-Type', image.mimeType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Agregar `DELETE /:id/image`**

```javascript
// DELETE /api/menu/:id/image
router.delete('/:id/image', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.productImage.delete({ where: { productId: id } });
    await prisma.product.update({ where: { id }, data: { imageUrl: null } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 5: Verificar manualmente los endpoints**

Con el servidor corriendo (`cd backend && npm run dev`):

```bash
# Subir imagen de prueba (reemplazar cualquier .jpg disponible)
curl -X POST http://localhost:3000/api/menu/1/image \
  -F "image=@/ruta/a/imagen.jpg"
# Esperado: JSON del producto con imageUrl: "/api/menu/1/image"

# Servir imagen
curl -I http://localhost:3000/api/menu/1/image
# Esperado: Content-Type: image/jpeg, status 200

# Eliminar imagen
curl -X DELETE http://localhost:3000/api/menu/1/image
# Esperado: {"ok":true}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/menu.js
git commit -m "feat: add POST/GET/DELETE image endpoints for menu products"
```

---

## Task 3: Actualizar formulario del menú en Admin

**Files:**
- Modify: `frontend/src/pages/Admin.jsx` — función `MenuTab` y su estado

- [ ] **Step 1: Reemplazar el estado `imageUrl` del form por estados de imagen**

En `MenuTab`, reemplazar el estado `form` y agregar estados de imagen:

```javascript
function MenuTab() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', price: '', category: 'hamburguesa' });
  const [editId, setEditId] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
```

- [ ] **Step 2: Actualizar `startEdit` para cargar la imagen actual**

```javascript
  function startEdit(p) {
    setEditId(p.id);
    setForm({ name: p.name, description: p.description || '', price: String(p.price), category: p.category });
    setImageFile(null);
    setImagePreview(p.imageUrl || null);
  }
```

- [ ] **Step 3: Actualizar `save` para subir la imagen tras guardar el producto**

```javascript
  async function save(e) {
    e.preventDefault();
    const body = { name: form.name, description: form.description, price: Number(form.price), category: form.category };
    let saved;
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

    if (imageFile) {
      const fd = new FormData();
      fd.append('image', imageFile);
      await fetch(`/api/menu/${saved.id}/image`, { method: 'POST', body: fd });
    }

    setEditId(null);
    setForm({ name: '', description: '', price: '', category: 'hamburguesa' });
    setImageFile(null);
    setImagePreview(null);
    fetchProducts();
  }
```

- [ ] **Step 4: Agregar función para manejar selección de archivo**

```javascript
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
```

- [ ] **Step 5: Actualizar función `del` para limpiar estado de imagen al cancelar edición**

```javascript
  function cancelEdit() {
    setEditId(null);
    setForm({ name: '', description: '', price: '', category: 'hamburguesa' });
    setImageFile(null);
    setImagePreview(null);
  }
```

Y reemplazar el botón "Cancelar" existente en el form:

```jsx
{editId && (
  <button type="button" onClick={cancelEdit} className="border px-4 py-2 rounded-lg text-sm">
    Cancelar
  </button>
)}
```

- [ ] **Step 6: Reemplazar el input de URL por el picker de imagen en el formulario**

Dentro del `<form>`, reemplazar el `<input placeholder="URL imagen (opcional)">` por:

```jsx
{/* Imagen */}
<div className="flex items-center gap-3 col-span-2 md:col-span-1">
  <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
    {imagePreview
      ? <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
      : <span className="text-2xl">🍔</span>
    }
  </div>
  <div className="flex flex-col gap-1">
    <label className="cursor-pointer text-xs text-blue-600 hover:underline">
      {imagePreview ? 'Cambiar imagen' : 'Subir imagen'}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleImageChange}
      />
    </label>
    {imagePreview && editId && (
      <button
        type="button"
        onClick={() => removeImage(editId)}
        className="text-xs text-red-500 hover:underline text-left"
      >
        Quitar imagen
      </button>
    )}
    {imagePreview && !editId && (
      <button
        type="button"
        onClick={() => { setImagePreview(null); setImageFile(null); }}
        className="text-xs text-red-500 hover:underline text-left"
      >
        Quitar
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 7: Verificar formulario en el navegador**

1. Levantar frontend: `cd frontend && npm run dev`
2. Ir a `http://localhost:5173/admin`, ingresar PIN.
3. Tab "Menú" → verificar que el input de URL desapareció y hay un picker.
4. Agregar producto nuevo, subir imagen → verificar que se guarda y aparece en la card.
5. Editar producto existente con imagen → verificar que la preview carga correctamente.
6. Click "Quitar imagen" → verificar que se elimina.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Admin.jsx
git commit -m "feat: replace imageUrl input with file upload picker and local preview in MenuTab"
```

---

## Task 4: Agregar thumbnail de imagen en cards de producto

**Files:**
- Modify: `frontend/src/pages/Admin.jsx` — sección del grid de products en `MenuTab`

- [ ] **Step 1: Agregar constante de emojis por categoría antes de `MenuTab`**

```javascript
const CATEGORY_EMOJI = {
  hamburguesa: '🍔',
  lomito: '🥩',
  gaseosa: '🥤',
  extra: '➕',
};
```

- [ ] **Step 2: Actualizar las cards del grid para mostrar la imagen**

Reemplazar el contenido del `<div>` interior de cada card (el bloque con `<p className="font-semibold">...`) para incluir el thumbnail:

```jsx
<div key={p.id} className={`bg-white rounded-xl shadow p-4 flex justify-between items-start gap-3 ${!p.available ? 'opacity-50' : ''}`}>
  {/* Thumbnail */}
  <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
    {p.imageUrl
      ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
      : <span className="text-2xl">{CATEGORY_EMOJI[p.category] || '🍽️'}</span>
    }
  </div>
  {/* Info */}
  <div className="flex-1 min-w-0">
    <p className="font-semibold truncate">{p.name}</p>
    <p className="text-xs text-gray-500">{p.category} · {SYMBOL}{p.price?.toLocaleString('es-PY')}</p>
    {p.description && <p className="text-xs text-gray-400 truncate">{p.description}</p>}
  </div>
  {/* Acciones */}
  <div className="flex flex-col gap-1 items-end flex-shrink-0">
    <button onClick={() => toggle(p.id)} className={`text-xs px-2 py-1 rounded-full font-medium ${p.available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {p.available ? 'Activo' : 'Inactivo'}
    </button>
    <button onClick={() => startEdit(p)} className="text-xs text-blue-600 hover:underline">Editar</button>
    <button onClick={() => del(p.id)} className="text-xs text-red-600 hover:underline">Eliminar</button>
  </div>
</div>
```

- [ ] **Step 3: Verificar en el navegador**

1. Ir al Tab "Menú".
2. Productos con imagen → verificar que se ve el thumbnail 56×56px.
3. Productos sin imagen → verificar que se ve el emoji de la categoría.
4. Verificar que la card no se rompe con nombres largos (`truncate`).

- [ ] **Step 4: Commit final**

```bash
git add frontend/src/pages/Admin.jsx
git commit -m "feat: add image thumbnail to product cards in MenuTab"
```

---

## Checklist de verificación final

- [ ] Subir imagen JPEG → se guarda en BD, se sirve correctamente, `imageUrl` se actualiza
- [ ] Subir imagen PNG → mismo resultado
- [ ] Subir imagen > 2MB → backend responde 400
- [ ] Producto sin imagen → se ve emoji de categoría en card y en formulario
- [ ] Editar producto con imagen → la preview carga al abrir el form
- [ ] "Quitar imagen" → imagen se elimina de BD, card vuelve a mostrar emoji
- [ ] Eliminar producto → la imagen se elimina en cascada (verificar tabla `ProductImage` vacía para ese id)
- [ ] Reiniciar el backend → imágenes siguen disponibles (persistencia en BD)
