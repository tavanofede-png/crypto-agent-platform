# Deploy en Railway

No se puede desplegar desde CI sin tu token. En tu PC:

## 1. Instalar CLI e iniciar sesión

```bash
npm i -g @railway/cli
railway login
```

## 2. Vincular este repo al proyecto

```bash
cd crypto-agent-platform
railway link -p <PROJECT_ID>
```

Proyecto creado en esta cuenta (si usás el mismo workspace): **`19b1e51d-fd41-4f33-9c8a-2fd0c7003e37`** (`crypto-agent-platform`).  
Si el UUID `f0763f57-0107-48d9-bce8-a37e695c5198` no existía en tu workspace, usá el ID anterior o el que veas en Railway → **Settings → General**.

## 3. Crear plugins de datos

En el dashboard del proyecto en Railway:

- **Add** → **Database** → **PostgreSQL**
- **Add** → **Database** → **Redis**

Copia las variables que Railway genera (`DATABASE_URL`, `REDIS_URL` o equivalentes) — las usarás en api + worker.

## 4. Crear cuatro servicios desde el mismo repositorio

Para cada uno: **New** → **GitHub Repo** → mismo repo → **Settings**:

| Servicio | Dockerfile path | Root directory |
|----------|-----------------|----------------|
| `api`    | `apps/api/Dockerfile` | `/` (repo root) |
| `web`    | `apps/web/Dockerfile` | `/` |
| `worker` | `apps/worker/Dockerfile` | `/` |
| `runtime`| `apps/runtime/Dockerfile` | `/` |

En **Build** → **Dockerfile path** (no Nixpacks si usas estos Dockerfiles).

## 5. Variables de entorno (resumen)

### API (`api`)

| Variable | Valor |
|----------|--------|
| `DATABASE_URL` | Referencia al Postgres del proyecto (`${{Postgres.DATABASE_URL}}` o copiar del plugin) |
| `REDIS_URL` | Del plugin Redis |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Otro secreto distinto |
| `JWT_ACCESS_EXPIRES_IN` | `1h` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `NONCE_TTL_MINUTES` | `10` |
| `RUNTIME_URL` | `http://${{runtime.RAILWAY_PRIVATE_DOMAIN}}:3002` (ajusta el nombre del servicio si lo renombraste) |
| `FRONTEND_URL` | URL pública del front, ej. `https://web-production-xxxx.up.railway.app` |
| `PORT` | `3001` (Railway suele inyectar `PORT`; el API Nest debe leerlo) |
| `NODE_ENV` | `production` |
| `TREASURY_ADDRESS` | Tu wallet de tesorería (si más adelante cobrás on-chain) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Si el API las usa indirectamente |

Comprueba que `apps/api` use `process.env.PORT || 3001` en `main.ts`.

### Web (`web`)

Build args / env en build time para Next:

| Variable | Valor |
|----------|--------|
| `NEXT_PUBLIC_API_URL` | `https://<tu-dominio-publico-del-api>` |
| `NEXT_PUBLIC_WS_URL` | `wss://<mismo-host-api>` o URL del socket |
| `NEXT_PUBLIC_CHAIN_ID` | `11155111` (o tu red) |

El Dockerfile de `web` ya pasa ARG; en Railway define estas como **variables disponibles en build** (checkbox “Available at build time”).

### Worker (`worker`)

| Variable | Valor |
|----------|--------|
| `DATABASE_URL` | Igual que API |
| `REDIS_URL` | Igual que API |
| `RUNTIME_URL` | Igual que API |
| `NODE_ENV` | `production` |

### Runtime (`runtime`)

| Variable | Valor |
|----------|--------|
| `OPENAI_API_KEY` | Obligatorio para chat |
| `ANTHROPIC_API_KEY` | Opcional |
| `RUNTIME_PORT` o `PORT` | `3002` |
| `WORKSPACE_BASE` | `/tmp/workspaces` o volumen si montás uno |
| `NODE_ENV` | `production` |

## 6. Dominios públicos

En cada servicio → **Settings** → **Networking** → **Generate domain** para `api` y `web`.

Actualiza `FRONTEND_URL`, `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_WS_URL` cuando tengas las URLs finales.

## 7. Migraciones

La imagen del API ejecuta `prisma migrate deploy` en el entrypoint. Asegurate de que `packages/db/prisma/migrations` esté commiteado en el branch que despliega Railway.

## 8. Despliegue por CLI (opcional)

Con el servicio seleccionado:

```bash
railway service  # elegir api / web / worker / runtime
railway up
```

O deja el deploy automático en cada push a `main`.

---

## Orden recomendado

1. Postgres + Redis  
2. Desplegar `runtime`  
3. Desplegar `api` (referencia `RUNTIME_URL` al runtime)  
4. Desplegar `worker`  
5. Desplegar `web` con URLs públicas del API  

Si algo falla, revisá **Deployments** → logs del contenedor y **Variables** faltantes.

---

## 9. Sobre el email “Deploy Crashed!” de Railway

Ese correo es **genérico**: no dice la causa. Siempre mirá **Deploy logs** del servicio.

Errores típicos de este proyecto:

| Síntoma en logs | Qué hacer |
|-----------------|-----------|
| `CHAIN_*_RPC_URL is required` | Ya corregido en código: sin `ACTIVE_CHAINS` no hace falta RPC. Si definís `ACTIVE_CHAINS=11155111`, tenés que agregar `CHAIN_11155111_RPC_URL` (Infura/Alchemy). |
| `DATABASE_URL` no encontrada | Variable en el servicio **api**, no solo en Postgres. Usá referencia `${{Postgres.DATABASE_URL}}`. |
| `ECONNREFUSED` puerto **6379** | Falta **Redis**. En el proyecto: **Add** → **Redis**, luego en **api** → Variables → `REDIS_URL` = `${{Redis.REDIS_URL}}` (nombre del servicio según Railway). |
| `JWT_SECRET` / auth | Definí `JWT_SECRET` y `JWT_REFRESH_SECRET` en **api**. |

Tras agregar Redis en el dashboard, en la carpeta del repo (con `api` linkeado):

```bash
railway variable set "REDIS_URL=`${{Redis.REDIS_URL}}"
```

(Ajustá `Redis` si renombraste el plugin.) Luego **Redeploy** del servicio `api`.
