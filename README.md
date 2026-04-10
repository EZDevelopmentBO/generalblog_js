# Blog multiuso (sitio + noticias + pagos)

Aplicación **full stack** en TypeScript: API **Express** + SPA **React (Vite)** con una sola base de datos **PostgreSQL**. Incluye blog por categorías, **venta de descargas** (PayPal, Binance Pay, transferencia USDT), **cupones**, **RBAC** por roles/permisos, **páginas estáticas** editables (tipo WordPress “Pages”) y generación opcional de borradores con **LLM** (Groq / SiliconFlow).

Los cambios entre versiones publicadas se resumen en [CHANGELOG.md](CHANGELOG.md).

---

## Stack

| Capa | Tecnología |
|------|------------|
| Backend | Node.js 24+, Express, `pg`, Passport (Google OAuth), sesiones en PostgreSQL (`connect-pg-simple`) |
| Frontend | React 18, React Router, Bootstrap, ReactQuill, i18n es/en |
| Datos | PostgreSQL 16+ (única instancia; `DATABASE_URL`) |

**No se usa Redis:** sesiones y datos van a PostgreSQL. No hay cola ni caché Redis en el proyecto.

---

## Arquitectura

- **Un solo PostgreSQL:** usuarios, sesiones (`session`), posts, categorías, pagos, tokens de descarga, cupones, ajustes, plantillas de email, log de notificaciones, roles/permisos y **páginas del sitio** (`site_pages`).
- **API:** rutas públicas bajo `/api/blog/*`, administración bajo `/api/blog/admin/*` (requiere sesión y permisos), `/api/payments/*`, `/api/download/*`, `/auth/*`.
- **Frontend:** rutas públicas (`/`, `/noticias/...`, `/news/...`, `/paginas/:slug`, `/pages/:slug`), panel `/app/*` (dashboard, blog admin, páginas estáticas, pagos, etc.).
- **SEO:** sitemap en el backend; HTML con meta OG para crawlers en URLs de posts cuando se sirve el build del frontend desde el backend (`FRONTEND_DIST`).

No hay segunda base de datos ni integraciones MySQL/P2P ni módulo de trading.

---

## Estructura del repositorio

```
├── backend/
│   ├── migrations/           # Esquema SQL consolidado (01 → 04, ver abajo)
│   ├── src/
│   │   ├── config/           # database, env, runMigrations
│   │   ├── constants/        # p. ej. email del autor semilla (OAuth)
│   │   ├── middlewares/      # auth, uploads
│   │   ├── routes/           # auth, blog, blogAdmin, payments, download, webhooks, …
│   │   ├── services/         # dominio (blog, payment, rbac, sitePages, llm, …)
│   │   └── scripts/          # create-post, promote-superuser, delete-user
│   ├── .env.example          # Plantilla comentada de todas las variables relevantes
│   └── package.json
├── frontend/
│   ├── public/
│   │   └── favicon.svg       # Icono EZ / circuito (sustituible)
│   ├── src/
│   └── vite.config.ts        # proxy /api y /auth → backend
├── docker-compose.yml        # db + backend + frontend (dev)
├── CHANGELOG.md              # Historial de versiones (breve)
└── README.md                 # Este archivo
```

---

## Requisitos

- **Node.js 24+** (según `engines` en los `package.json`).
- **PostgreSQL** accesible con una cadena `DATABASE_URL`.

---

## Puesta en marcha (sin Docker)

1. Variables de entorno:
   ```bash
   cd backend && cp .env.example .env
   ```
   Edita `DATABASE_URL`, `SESSION_SECRET`, OAuth Google y, si aplica, claves de pago y LLM. Cada variable está comentada en `.env.example`.

2. Migraciones (se ejecutan **todos** los `.sql` de `migrations/` en orden alfabético numérico):
   ```bash
   cd backend && npm install && npm run migrate
   ```

3. API:
   ```bash
   npm run dev
   ```

4. Frontend:
   ```bash
   cd frontend && npm install && npm run dev
   ```
   Vite en `http://localhost:5173` con proxy a la API.

### Primer superusuario (Google OAuth)

El **primer usuario real** que inicia sesión con Google cuando no hay otros usuarios “reales” recibe rol **superuser**.

- En la base existe un usuario de demostración **`seed-author@blog.local`** (creado por la migración `04`), solo como autor del post de ejemplo. **No cuenta** para esa regla (definido en `backend/src/constants/seedDemo.ts`).
- Si necesitas promover un email concreto: `npm run promote-superuser -- tu@email.com`

### Datos de ejemplo tras `migrate`

La migración **`04_seed_demo_content.sql`** (idempotente) puede crear:

| Qué | Detalle |
|-----|---------|
| Ajustes `site_title` / `site_slogan` | Solo si la clave no existía (`ON CONFLICT DO NOTHING`) |
| Categoría `general` | Rutas `/noticias/general` y `/news/general` |
| Usuario semilla | `seed-author@blog.local`, nombre “Autor de ejemplo”, rol `user` |
| Post publicado | Slug `2026-01-15-bienvenida-a-tu-blog`, sin descarga de pago |

Si ya tenías título/eslogan guardados, no se sobrescriben. Puedes editar o borrar el post y el usuario desde el admin.

---

## Docker

El `docker-compose.yml` levanta tres servicios:

| Servicio | Qué hace |
|----------|-----------|
| **db** | PostgreSQL 16. En el host: puerto **5433** (el 5432 queda para Postgres local si lo tienes). Usuario / contraseña / base: `blog` / `blog_secret` / `blog`. Datos en volumen `pgdata_dev`. |
| **backend** | API en **4000**, código en volumen (hot reload). Carga `backend/.env` (`env_file`). |
| **frontend** | Vite en **5173**; `VITE_PROXY_TARGET` apunta a `http://backend:4000`. |

```bash
docker compose up --build
```

**`DATABASE_URL` en el contenedor:** `localhost` es el propio contenedor. Con el servicio `db` del compose debe ser:

`DATABASE_URL=postgresql://blog:blog_secret@db:5432/blog`

Si Postgres está solo en tu máquina (sin servicio `db`), usa `host.docker.internal` (Docker Desktop) o la IP del host en Linux. Desde el host hacia el Postgres del compose: `localhost:5433`.

**Migraciones (primera vez o tras cambios SQL):**

```bash
docker compose run --rm backend npm run migrate
```

El `environment:` del servicio `backend` solo fija `NODE_ENV`, `PORT` y un `SESSION_SECRET` de desarrollo; el resto sale de `backend/.env`.

**Aviso Bake/buildx:** si aparece un warning de Buildx al hacer `compose up --build`, suele ser informativo; la imagen se construye igual con el builder por defecto.

---

## Migraciones SQL

Archivos en `backend/migrations/` (orden `01` … `04`):

| Archivo | Contenido |
|---------|-----------|
| `01_core_schema.sql` | Usuarios, posts, descargas, tokens, pagos, ajustes, notificaciones, plantillas email, cupones (histórico consolidado). La tabla `post_downloads` se crea antes de cualquier `ALTER` sobre ella. |
| `02_rbac_and_extensions.sql` | Pagos libres, soft-delete usuario, categorías blog (`blog_posts.category` → FK), RBAC (`roles`, `role_permissions`). |
| `03_cleanup_and_site_pages.sql` | Limpieza legacy y tabla `site_pages`. |
| `04_seed_demo_content.sql` | Opcional: marca por defecto, categoría `general`, usuario semilla, post de bienvenida. |

Están pensadas para ser **re-ejecutables** en muchos casos (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, etc.). Si una migración falló a medias en una base antigua, lo más seguro es volver a crear el volumen de Postgres (`docker compose down -v`) y ejecutar `migrate` de nuevo en desarrollo.

---

## Variables de entorno

Resumen; **la referencia completa con comentarios** está en `backend/.env.example`.

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | PostgreSQL (obligatoria para datos reales) |
| `PORT`, `API_URL`, `FRONTEND_URL` | API y orígenes (CORS, cookies, emails, redirects) |
| `FRONTEND_DIST` | Servir el build del SPA desde el backend + OG para bots (opcional) |
| `SITE_TIMEZONE` | Zona horaria para fechas en contenido |
| `SESSION_SECRET` | Firma de cookies |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login Google |
| `LLM_PROVIDER`, `GROQ_*`, `SILICONFLOW_*` | Borradores con IA en el admin (opcional) |
| `PAYPAL_*`, `BINANCE_PAY_*`, `BINANCE_*` | Pagos y transferencia USDT |

**Secretos:** no subas `backend/.env`. El archivo `.env.test` está en `.gitignore` para evitar credenciales en el repositorio.

---

## Marca, favicon y textos

- **Favicon:** `frontend/public/favicon.svg` (icono tipo circuito **EZ**; puedes sustituirlo).
- **Título y eslogan del sitio:** se pueden editar en **Configuración** del admin (`system_settings`); si no hay valor, el frontend usa valores por defecto genéricos (“Mi blog”, etc.).
- **Plantillas de email:** textos por defecto en código (`emailTemplates.ts`); si ya existen filas en BD, mandan las filas.

---

## Funcionalidades principales

### Blog y categorías

- Posts multiidioma, categorías en BD (`blog_categories`), imagen destacada, galería, vídeo, conclusión, SEO, vistas.
- Rutas: `/noticias/...` (es), `/news/...` (en).

### Contenido de pago

- ZIP por post, precio USD, métodos por post, token de descarga con caducidad y límite de usos (ajustes globales).
- Cupones, campañas `?ref=`, descarga gratuita registrada con límite.

### Páginas estáticas (CMS)

- `site_pages`: `/paginas/:slug`, `/pages/:slug`; admin `/app/site-pages` (`blog.manage`).

### Panel y RBAC

- Permisos: `blog.manage`, `discount.manage`, `payments.view`, `users.manage`, `settings.manage`, etc.
- Roles en BD; gestión avanzada en `/app/users` (superuser).

### LLM (opcional)

- Groq (por defecto) o SiliconFlow para generar borradores desde el admin. Sin API key, el resto del sitio funciona.

---

## Scripts útiles (`backend`)

| Script | Descripción |
|--------|-------------|
| `npm run migrate` | Ejecuta todas las migraciones SQL |
| `npm run create-post -- archivo.json` | Crea post desde JSON |
| `npm run promote-superuser -- email@...` | Asigna superuser |
| `npm run delete-user -- email@...` | Elimina usuario por email |

---

## Despliegue detrás de proxy

- Misma cookie de sesión: un origen coherente o proxy que unifique `/api` y `/auth` con el dominio del frontend.
- **HTTPS** en producción; cookies `secure` con `NODE_ENV=production`.
- Para OG en posts sin ejecutar JS: `FRONTEND_DIST` o reglas equivalentes en el proxy.

Ejemplo mínimo **Nginx:**

```nginx
location /api/ { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
location /auth/ { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
location / { root /var/www/tu-spa/dist; try_files $uri $uri/ /index.html; }
```

---

## Solución de problemas

| Síntoma | Qué revisar |
|---------|-------------|
| `ECONNREFUSED` a Postgres en Docker | `DATABASE_URL` con host `db` y puerto `5432` **dentro** de la red compose, no `localhost`. |
| Error `relation "post_downloads" does not exist` al migrar | Asegúrate de tener el `01_core_schema.sql` actual (el `ALTER` de `whatsapp_sent_at` va **después** del `CREATE TABLE post_downloads`). En dev, volumen de BD limpio + `migrate`. |
| 500 en API | `DATABASE_URL` y que `migrate` haya terminado bien. |
| Sesión no persiste | `SESSION_SECRET`, `X-Forwarded-Proto`, dominio de cookie. |
| Google OAuth | Callback exacto: `https://TU_API/auth/google/callback`. |
| LLM no responde | Claves `GROQ_API_KEY` o SiliconFlow + `LLM_PROVIDER`. |
| Push bloqueado en GitHub | Historial con secretos en commits: rotar claves; no versionar `.env` ni `.env.test` con datos reales. |

---

## Licencia y uso

Adapta marca, textos legales y políticas de privacidad a tu caso de uso.
