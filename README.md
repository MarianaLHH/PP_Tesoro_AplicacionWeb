# Tesoro — Registro de compra y venta de oro

Monorepo con tres paquetes:

| Carpeta | Qué es |
|---|---|
| [shared/](shared/) | `@tesoro/dominio` — reglas de cálculo. **Fuente única de las fórmulas.** |
| [backend/](backend/) | API NestJS + PostgreSQL (Prisma) |
| [frontend/](frontend/) | PWA React que funciona sin conexión |

El paquete compartido existe para que la PWA liquide una compra offline con
**exactamente el mismo código** que el servidor. Si la fórmula viviera en dos
lugares, tarde o temprano darían resultados distintos.

## Puesta en marcha

```bash
npm install
npm run build:shared     # obligatorio antes de levantar backend o frontend
```

```bash
npm run dev:web          # PWA en http://localhost:5173
npm run dev:api          # API en http://localhost:3000
```

Pruebas del dominio (incluyen el caso real del Excel):

```bash
npm test
```

## Base de datos y despliegue (Docker)

Todo el sistema es **una sola imagen Docker** (API + PWA) más un PostgreSQL.
Al arrancar, el contenedor aplica las migraciones pendientes de
[backend/prisma/migrations/](backend/prisma/migrations/).

Local, con un comando:

```bash
docker compose up --build        # http://localhost:3000  ·  salud: /api/salud
```

Sólo la base, para desarrollar con `dev:api` / `dev:web`:

```bash
docker compose up -d db          # PostgreSQL en localhost:5433 (tesoro/tesoro)
cp backend/.env.example backend/.env
```

En la nube (Railway, Render, Fly.io, un VPS…): crear un PostgreSQL gestionado,
desplegar este repositorio con su `Dockerfile` y definir las variables:

| Variable | Ejemplo |
|---|---|
| `DATABASE_URL` | `postgresql://usuario:clave@host:5432/tesoro?schema=public` |
| `JWT_SECRET` | cadena larga y aleatoria |
| `PORT` | la que indique la plataforma (por defecto 3000) |

Cambios al modelo: editar `schema.prisma` y ejecutar
`npm run prisma:migrate --workspace backend -- --name descripcion`.
La migración generada se versiona y se aplica sola en el siguiente despliegue.

## Documentación

- [docs/arquitectura.md](docs/arquitectura.md) — diseño general y modelo de datos
- [docs/reglas-de-calculo.md](docs/reglas-de-calculo.md) — fórmulas extraídas del Excel

## Estado

Hecho:

- Modelo de datos completo ([backend/prisma/schema.prisma](backend/prisma/schema.prisma))
- Dominio de cálculo con pruebas ([shared/src/calculo-oro.ts](shared/src/calculo-oro.ts))
- PWA: cotización, clientes, compras, inventario de lotes, fundición conjunta
  y ventas por lote con ganancia, todo contra IndexedDB

Pendiente:

- API NestJS: Prisma, autenticación, endpoints, correlativos
- Worker de sincronización (la cola `outbox` ya se llena, todavía no se vacía)
- Anulación de compras, fundiciones y ventas
- Caja y reportes
