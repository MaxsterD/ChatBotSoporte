# Soporte SismaSalud

Sistema de soporte inteligente y mesa de ayuda hospitalaria para el ERP **SismaSalud**:
- **App móvil** (`mobile/`): Expo + React Native + Expo Router. Atención asistencial directa para usuarios clínicos (`CLIENTE`).
- **Consola web** (`web/`): React 19 + Vite 8 + Tailwind CSS 4. Consola integral para consultores e ingenieros de soporte con monitoreo en vivo, copiloto técnico contextual y workspace de agente autónomo (`/agente`).
- **API Backend** (`server/`): Fastify 5 + Socket.IO 4 + Prisma ORM 6 + PostgreSQL 16 + Microsoft SQL Server.
- **Agente Cognitivo** (`agent/`): `AGENTS.md`, contrato JSON de escalamiento y base de conocimiento hospitalaria (13 manuales especializados).
- **Documentación Técnica Oficial**: Documento ejecutivo completo con arquitectura y evidencias visuales disponible en **[`docs/informe_tecnico_chatbotsoporte.pdf`](docs/informe_tecnico_chatbotsoporte.pdf)**.

---

## Qué hace

1. El cliente crea una conversación y pregunta; el agente responde con base en la KB hospitalaria de SismaSalud y consultas seguras de solo lectura en SQL Server.
2. Si el caso lo requiere o el usuario escribe algo como *“quiero hablar con un consultor”*, la conversación pasa automáticamente a la cola (`WAITING`).
3. El agente genera en segundo plano un **Análisis de Escalamiento estructurado** (resumen, causa probable, solución sugerida, datos faltantes) visible de inmediato para el equipo técnico.
4. El consultor toma el caso (`ASSIGNED`), conversa en tiempo real como humano y cuenta con el **Copiloto Técnico** para inspección de bases de datos.
5. El equipo de ingeniería dispone del **Workspace de Agente Autónomo (`/agente`)** con soporte multimodal (imágenes de errores) y capacidades de **Plan & Build** para ejecutar sentencias SQL transaccionales o parches en código fuente con copias de seguridad automáticas (`.bak`).
6. El sistema restringe la creación de chats fuera de **Horarios de Atención** configurables desde la consola web para proteger la disponibilidad del personal de soporte.

## Arquitectura

```
┌──────────────────┐        HTTP + WebSocket        ┌────────────────────────┐
│  App móvil       │ ─────────────────────────────► │  API Fastify :4000     │
│  Expo / RN       │ ◄───────────────────────────── │  Socket.IO + Prisma 6  │
└──────────────────┘                                └───────────┬────────────┘
                                                                │
┌──────────────────┐        HTTP + WebSocket                    │ SQL
│  Consola web     │ ─────────────────────────────►             ▼
│  React / Vite    │ ◄───────────────────────────── ┌────────────────────────┐
│  :5173           │                                │  PostgreSQL            │
└──────────────────┘                                │  chatbotsoporte        │
                                                    └────────────────────────┘
                                                                ▲
                                                                │ un proceso `agy` por turno
                                                    ┌───────────┴────────────┐
                                                    │  agent/                │
                                                    │  AGENTS.md · schema ·  │
                                                    │  knowledge/ (KB)       │
                                                    └────────────────────────┘
```

## Requisitos

- Node.js 22 o superior (probado con Node 24).
- PostgreSQL local (probado con PostgreSQL 18, puerto 5432).
- Opcional para respuestas reales: **Antigravity CLI** (`agy`) instalado y autenticado.
  Sin CLI se puede trabajar con `AGENT_MODE=mock`.
- Para ver la app móvil en el navegador: un navegador moderno (Chrome).
- Para Android/iOS: Expo Go o un development build.

## Puesta en marcha

```powershell
# 1. Crear la base de datos (una sola vez)
createdb -U postgres chatbotsoporte
#   o con psql:
#   & "D:\PostgresSql\bin\psql.exe" -U postgres -c "CREATE DATABASE chatbotsoporte;"

# 2. Instalar dependencias de los tres paquetes
cd D:\Repositorios\chatbotsoporte
npm run setup

# 3. Configurar la API
#    Copia el ejemplo y ajusta DATABASE_URL / JWT_SECRET si hace falta.
Copy-Item server\.env.example server\.env
#    El ejemplo arranca en AGENT_MODE=mock; cambia a "agy" cuando el CLI esté disponible.

# 4. Crear el esquema y cargar datos demo
npm run db:reset          # db push --force-reset + seed

# 5. Levantar API (4000) y consola web (5173)
npm run dev
```

La app móvil se levanta aparte:

```powershell
npm run dev:mobile        # npx expo start
# o directamente en web:
cd mobile; npx expo start --web --port 8081
```

> `npm run db:reset` borra y recrea el esquema. Úsalo cuando los datos de prueba hayan ensuciado la demo. Para solo recargar usuarios y chats demo sin borrar todo usa `npm run db:seed` (no duplica chats si ya existen).

## Credenciales demo

Contraseña para todas: **`demo1234`**.

| Correo | Rol | Dónde entra |
| --- | --- | --- |
| `cliente@sismasalud.demo` | CLIENTE | App móvil |
| `cliente2@sismasalud.demo` | CLIENTE | App móvil |
| `consultor1@sismasalud.demo` | CONSULTOR | Consola web |
| `consultor2@sismasalud.demo` | CONSULTOR | Consola web |
| `admin@sismasalud.demo` | ADMIN | Consola web (+ equipo) |

El seed crea 4 conversaciones de ejemplo: una `WAITING` con análisis listo, una `ASSIGNED`, una `BOT` y una `CLOSED`.

## Puertos y URLs

| Servicio | URL |
| --- | --- |
| API | `http://localhost:4000` |
| Health check | `http://localhost:4000/health` |
| Consola web | `http://localhost:5173` |
| App móvil en web | `http://localhost:8081` |
| PostgreSQL | `127.0.0.1:5432` |

## Variables de entorno (`server/.env`)

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | — | Cadena de conexión de PostgreSQL. |
| `HOST` / `PORT` | `0.0.0.0` / `4000` | Escucha de Fastify. |
| `CORS_ORIGIN` | `*` | Orígenes permitidos. |
| `JWT_SECRET` | — | Secreto de firma (mínimo 16 caracteres). |
| `ACCESS_TOKEN_TTL` | `30m` | Vida del access token. |
| `REFRESH_TOKEN_DAYS` | `14` | Vida del refresh token. |
| `AGENT_MODE` | `agy` | `agy` = CLI real; `mock` = respuestas simuladas sin cuota. |
| `AGY_BIN` | `agy.exe` | Binario o ruta completa del CLI. |
| `AGY_MODEL` | `gemini-3.8-flash-medium` | Modelo principal. |
| `AGY_FALLBACK_MODELS` | vacío | Modelos de respaldo separados por coma. Si se deja vacío, siempre usa el modelo principal. |
| `AGY_TIMEOUT_MS` | `900000` | Tiempo máximo por turno. |
| `AGENT_WORKSPACE` | `../agent` | Carpeta de trabajo del agente (AGENTS.md, schema, knowledge). |
| `AGENT_EXTRA_DIRS` | `C:\inetpub\wwwroot\SismaSalud` | Directorios extra de solo lectura para que el agente consulte el código. |
| `AGENT_MAX_CONCURRENCY` | `2` | Turnos simultáneos máximos. |
| `AGENT_MAX_MESSAGE_CHARS` | `4000` | Límite de mensaje del cliente. |

### Modo mock vs. CLI real

- **`AGENT_MODE=mock`** responde al instante con respuestas enlatadas según palabras clave (citas, RIPS, facturación, etc.). Ideal para desarrollo, demos y pruebas automatizadas.
- **`AGENT_MODE=agy`** ejecuta el CLI real. Con `gemini-3.8-flash-medium` cada turno puede tardar **~7–10 min** si el proveedor está saturado (se midieron 450–600 s con conocimiento y esquema). El bridge espera hasta `AGY_TIMEOUT_MS` (15 min) y no cambia de modelo.
- El análisis de escalamiento se genera en un turno aparte del agente; por eso un caso puede aparecer en la cola unos segundos antes de que el análisis esté listo (`ready: false`).

## Detalles del CLI `agy` (aprendidos en la integración)

- El prompt va **pegado** al flag: `--print="..."`, no como argumento separado.
- `--conversation <id>` mantiene el hilo entre turnos. El id se guarda en `Chat.agyConversationId`.
- `--json-schema` **rechaza archivos con BOM**. `agent/schema.json` está guardado como UTF-8 sin BOM.
- `--model` y `--effort` **no se pueden combinar**. Como el proyecto fija modelo explícito, el bridge no envía `--effort`.
- La respuesta estructurada llega en `structured_output`; los deltas de streaming que empiezan con `{` se ocultan para no mostrar el JSON al cliente.
- Errores `UNAVAILABLE (code 503): No capacity available` son transitorios: el bridge cambia de modelo y, si el CLI responde `ERROR` sin texto, el turno se marca como parcial y el chat se escala con `AGENT_ERROR`.

## Pruebas

```powershell
cd D:\Repositorios\chatbotsoporte

npm test                      # Suite completa de pruebas (67 tests, 100% efectividad)
npm run typecheck             # Verificación de tipos estricta (server + web)

# smoke de API/WebSocket con agente mock (23 comprobaciones)
cd server
$env:AGENT_MODE='mock'; npm run smoke

# móvil
cd ..\mobile
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

## Estructura del repositorio

```
chatbotsoporte/
├── agent/                 # Workspace del agente: AGENTS.md, schema.json, knowledge/
├── docs/                  # Documentación de arquitectura e informe técnico en PDF
├── mobile/                # App Expo (Expo Router en src/app)
├── server/                # API Fastify + Prisma + Socket.IO + puente al agente + SQL Server
├── web/                   # Consola de consultores (Vite + React 19 + Tailwind CSS)
├── package.json           # Scripts raíz (dev, db:reset, test, typecheck)
├── INSTRUCCIONES_ENTREGA.md# Guía para el docente y evaluador
└── README.md
```

## Rutas principales

**App móvil** (Expo Router):

| Ruta | Pantalla |
| --- | --- |
| `/login` | Ingreso / registro de cliente |
| `/` | Lista de conversaciones y banner de horario |
| `/chat/[id]` | Conversación en vivo (Bot IA y asesor humano) |

**Consola web**:

| Ruta | Pantalla |
| --- | --- |
| `/login` | Ingreso de consultores y administradores |
| `/` | Conversaciones en vivo (todas) |
| `/cola` | Cola de espera con panel de análisis de escalamiento |
| `/mios` | Mis casos tomados |
| `/agente` | Workspace de Agente Técnico Autónomo (Plan & Build) |
| `/entornos` | Gestión de entornos clínicos y BD local (solo admin) |
| `/horarios` | Configuración de horario de atención comercial (solo admin) |
| `/clientes` | Directorio y asignación de clientes a entornos (solo admin) |
| `/equipo` | Gestión de consultores (solo admin) |

**API** (resumen de endpoints):

- `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`
- `GET/POST /chats`, `GET /chats/:id`, `POST /chats/:id/messages`, `POST /chats/:id/request-human`, `POST /chats/:id/close`
- `GET /consultant/chats`, `/consultant/queue`, `/consultant/stats`, `/consultant/chats/:id`, `/consultant/chats/:id/analysis`
- `POST /consultant/chats/:id/take`, `/messages`, `/notes`, `/release`, `/close`
- `GET/POST /consultant/agent/sessions`, `/messages`, `/execute-plan`, `/plan` (Workspace de agente)
- `GET/POST/PUT/DELETE /consultant/environments` (Entornos clínicos y BD local con AES-256-GCM)
- `GET/PUT /business-hours` (Horarios de atención)
- `GET/POST /consultant/users` (solo `ADMIN`)

## Tiempo real

Socket.IO con autenticación por token. Salas:

- `user:<id>` — eventos de las conversaciones de un cliente.
- `chat:<id>` — mensajes de una conversación (solo cliente dueño y staff).
- `consultants` — nueva cola, chats nuevos/actualizados y asignaciones.

Eventos: `message:new`, `chat:new`, `chat:updated`, `chat:assigned`, `queue:updated`, `agent:typing`, `agent:delta`.

## Alcance y limitaciones

- Notificaciones solo dentro de la app (sin push).
- Un proceso `agy` por turno; sin streaming token a token desde el CLI, pero sí vista previa por deltas.
- La base de conocimiento se armó leyendo el código de SismaSalud en `C:\inetpub\wwwroot\SismaSalud`; hay temas marcados como pendientes en `agent/knowledge/_pendientes.md`.
- No hay panel de administración completo: solo alta/listado básico de consultores.
- Latencia real del agente y manejo de datos personales quedan fuera del alcance de esta entrega.

Más detalle en [`docs/arquitectura.md`](docs/arquitectura.md).
