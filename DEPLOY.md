# Despliegue en producción (DigitalOcean)

## 1. Autenticarse en el registry

```bash
doctl registry login
```

## 2. Build y push de imágenes (reemplazar `X.X` con la versión)

```bash
docker build -t registry.digitalocean.com/stacklabregistry/burger-backend:X.X \
             -t registry.digitalocean.com/stacklabregistry/burger-backend:latest ./backend

docker build -t registry.digitalocean.com/stacklabregistry/burger-frontend:X.X \
             -t registry.digitalocean.com/stacklabregistry/burger-frontend:latest ./frontend

docker push registry.digitalocean.com/stacklabregistry/burger-backend:X.X
docker push registry.digitalocean.com/stacklabregistry/burger-backend:latest

docker push registry.digitalocean.com/stacklabregistry/burger-frontend:X.X
docker push registry.digitalocean.com/stacklabregistry/burger-frontend:latest
```

## 3. En el servidor de producción (`/opt/burgerhouse`)

```bash
# Pullear las nuevas imágenes
docker pull registry.digitalocean.com/stacklabregistry/burger-backend:latest
docker pull registry.digitalocean.com/stacklabregistry/burger-frontend:latest

# Reiniciar los contenedores
docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d

# Aplicar migraciones pendientes si es que necesita
docker exec burgerhouse-backend-1 npx prisma migrate deploy
```
