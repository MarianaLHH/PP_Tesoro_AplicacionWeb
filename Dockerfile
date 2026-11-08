# Imagen única: API NestJS + PWA compilada.
# Funciona igual en cualquier proveedor que acepte Docker (Railway, Render, Fly.io, VPS, Azure, AWS...).

# ---------------------------------------------------------------- Compilación
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Primero sólo los manifiestos: la capa de dependencias se reutiliza si el código cambia.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

COPY . .
RUN npx prisma generate --schema backend/prisma/schema.prisma \
 && npm run build

# ---------------------------------------------------------------- Ejecución
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/package.json ./shared/
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/backend/package.json ./backend/
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/frontend/dist ./frontend/dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Aplica las migraciones pendientes y arranca. Es idempotente: si no hay nada nuevo, no hace nada.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy --schema backend/prisma/schema.prisma && node backend/dist/main.js"]
