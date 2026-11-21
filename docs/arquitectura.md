# Arquitectura — Soporte SismaSalud

Este documento explica cómo está construido `chatbotsoporte`, qué decisiones se tomaron y dónde están los límites del diseño. Para instalación y credenciales, ver el [`README.md`](../README.md).

## 1. Vista general

El sistema tiene cuatro piezas desplegables por separado:

| Pieza | Tecnología | Responsabilidad |
| --- | --- | --- |
| `mobile/` | Expo SDK 58, React Native 0.88, React 19, Expo Router | Experiencia del cliente: login, conversaciones, solicitud de asesor. |
| `web/` | Vite 8, React 19, React Router 7, Tailwind 4 | Consola del consultor: chats en vivo, cola, análisis, notas, equipo. |
| `server/` | Fastify 5, Socket.IO 4, Prisma 6, Zod 4, JWT | API REST, tiempo real, reglas de negocio, orquestación del agente. |
| `agent/` | Antigravity CLI (`agy`) + archivos | Personalidad, contrato de salida y base de conocimiento del agente. |

La API es el único componente con acceso a PostgreSQL. Las dos interfaces hablan HTTP y WebSocket contra ella.

## 2. Estructura del servidor

```
server/src/
├── index.ts              # arranque (Fastify + Socket.IO)
├── app.ts                # registro de rutas, CORS, rate limit, errores
├── env.ts                # validación de configuración con Zod
├── db.ts                 # cliente Prisma
├── auth/routes.ts        # registro, login, refresh, logout, /me
├── lib/auth.ts           # hash de contraseñas y utilidades JWT
├── lib/errors.ts         # errores HTTP tipados
├── routes/chats.ts       # endpoints del cliente
├── routes/consultant.ts  # endpoints del consultor/admin
├── chats/service.ts      # máquina de estados y orquestación del agente
├── realtime/io.ts        # salas y emisión de eventos
└── agent/
    ├── bridge.ts         # spawn de `agy`, parsing NDJSON, modelo principal
    ├── prompt(s).ts      # construcción de prompts de turno y de análisis
    ├── intent.ts         # detección de “quiero hablar con un humano”
    ├── queue.ts          # serialización por chat + concurrencia global
    ├── mock.ts           # proveedor simulado para desarrollo
    ├── sanitize.ts       # limpieza de texto del agente
    └── types.ts          # tipos del dominio del agente
```

## 3. Modelo de datos

```
User 1──N Chat (como cliente)
User 1──N Chat (como consultor asignado)
Chat 1──N Message
Chat 1──1 Escalation
Chat 1──N ConsultantNote
Chat 1──N ChatEvent
User 1──N RefreshToken
```

Campos relevantes de `Chat`:

- `status`: `BOT | WAITING | ASSIGNED | CLOSED`.
- `agyConversationId`: hilo del CLI para continuidad entre turnos.
- `assignedConsultantId`, `takenAt`, `queueEnteredAt`, `closedAt`.
- `unreadCount`, `lastMessagePreview`, `lastMessageAt`: soporte de la lista móvil.

`Message.internal` distingue notas internas (nunca salen al cliente). `AuthorType` es `USER | BOT | CONSULTANT | SYSTEM`.

`Escalation` guarda el análisis: `summary`, `probableCause`, `suggestedSolution`, `missingInfo` y `ready`. Solo se expone por endpoints de staff.

`ChatEvent` es una bitácora técnica (`escalated`, `agent_turn_done`, etc.) útil para depurar; no se muestra al cliente.

## 4. Máquina de estados

```
        crear chat
            │
            ▼
        ┌───────┐   pide humano / agente escala / error   ┌─────────┐
        │  BOT  │ ───────────────────────────────────────► │ WAITING │
        └───────┘                                          └─────────┘
            ▲                                                   │
            │                                                   │ consultor toma
            │                                                   ▼
            │                liberar                       ┌──────────┐
            └────────────────────────────────────────────── │ ASSIGNED │
                                                            └──────────┘
                                                                 │ cerrar
                                                                 ▼
                                                            ┌────────┐
                                                            │ CLOSED │
                                                            └────────┘
```

Reglas:

- **BOT**: el agente responde cada mensaje del cliente. El cliente puede pedir asesor explícitamente.
- **WAITING**: el agente ya no responde. El chat entra a la cola ordenada por `queueEnteredAt`.
- **ASSIGNED**: solo el consultor asignado puede escribir; el cliente también puede. El agente queda fuera.
- **CLOSED**: nadie puede escribir. El historial se conserva.
- `takeChat` cancela el turno del agente en curso (`agentQueue.cancel`) y marca `takenAt`.
- `releaseChat` devuelve un `ASSIGNED` a `WAITING`, conservando el análisis.
- Enviar un mensaje de consultor sobre un chat `WAITING` lo toma automáticamente.

## 5. Ciclo de un turno del agente

```
Cliente        API                      AgentQueue            agy
   │            │                           │                  │
   │ POST msg   │                           │                  │
   ├───────────►│ guarda Message(USER)      │                  │
   │ 201        │ emite message:new         │                  │
   │◄───────────┤                           │                  │
   │            │ enqueueAgentTurn          │                  │
   │            ├──────────────────────────►│                  │
   │            │                           │ spawn --print    │
   │            │                           ├─────────────────►│
   │            │   agent:typing / delta    │                  │
   │◄───────────┼───────────────────────────┤ NDJSON           │
   │            │                           │◄─────────────────┤
   │            │ guarda Message(BOT)       │                  │
   │            ├───────────────────────────┤                  │
   │            │ emite message:new         │                  │
   │◄───────────┼───────────────────────────┤                  │
```

Detalles:

- `AgentQueue` serializa turnos **por chat** y limita la concurrencia **global** (`AGENT_MAX_CONCURRENCY`).
- Un turno nuevo puede llegar mientras el anterior corre: se encola y se ejecuta después.
- Si el cliente pide humano, `agentQueue.cancel(chatId)` aborta el turno en curso antes de escalar.
- El CLI se invoca como un proceso nuevo por turno, con `--conversation` para continuidad.
- La salida se lee como NDJSON (`init`, `step_update`, `result`). Los deltas se reenvían como vista previa (`agent:typing`, `agent:delta`).
- La respuesta final se toma de `structured_output`; si no existe, se intenta extraer JSON del texto; si tampoco, se usa el texto limpio como respuesta parcial.

## 6. Escalamiento y análisis

Hay tres motivos (`EscalationReason`):

| Motivo | Cuándo |
| --- | --- |
| `USER_REQUEST` | El cliente escribe una frase equivalente a “quiero hablar con un asesor”. Lo detecta `intent.ts` antes de llamar al agente. |
| `BOT` | El agente decide `escalate: true` y devuelve `analysis`. |
| `AGENT_ERROR` | El turno falló (timeout, CLI no disponible, error de capacidad). Se crea un análisis de contingencia. |

Flujo:

1. Se crea o actualiza `Escalation` con `ready: false` y, si ya hay análisis del turno, se completa de inmediato.
2. El chat pasa a `WAITING` y entra a la cola.
3. Si el análisis no vino en el turno, se lanza `generateCaseAnalysis` en segundo plano (otro turno del agente con la transcripción reciente).
4. Al terminar, se marca `ready: true` y se emite `queue:updated`.
5. La consola muestra “Análisis en preparación” hasta que `ready` sea verdadero.

El análisis **nunca** se serializa en los payloads del cliente. `serializeChat` solo incluye `reason` y `ready` para el staff; el detalle completo solo sale por `/consultant/chats/:id/analysis`.

## 7. Tiempo real

Socket.IO autentica con el access token en el handshake. Salas:

- `user:<userId>`: cliente dueño de las conversaciones.
- `chat:<chatId>`: mensajes de una conversación. Se une el cliente dueño y el staff.
- `consultants`: todos los consultores/admin.

Eventos emitidos:

| Evento | Destino | Contenido |
| --- | --- | --- |
| `message:new` | chat + user | Mensaje recién creado. |
| `chat:new` | user + consultants | Chat creado. |
| `chat:updated` | chat + consultants | Cambio de estado o metadatos. |
| `chat:assigned` | chat + consultants | Asignación a un consultor. |
| `queue:updated` | consultants | Cola completa recalculada. |
| `agent:typing` | chat | El agente empezó/terminó de escribir. |
| `agent:delta` | chat | Vista previa del texto en streaming. |

Las dos interfaces usan un contador de versión: al recibir cualquier evento recargan el recurso afectado. Es simple y evita inconsistencias entre eventos.

## 8. Seguridad y roles

- Contraseñas con bcrypt (`bcryptjs`).
- Access token JWT de 30 minutos; refresh token opaco de 14 días, guardado como hash y revocable.
- El cliente móvil renueva el access token automáticamente ante un `401` y reintenta la petición una vez.
- `requireUser` exige sesión; `requireStaff` exige `CONSULTOR` o `ADMIN`.
- El alta de consultores (`POST /consultant/users`) y el listado interno son solo para `ADMIN`.
- La app móvil rechaza cuentas que no sean `CLIENTE`; la consola web rechaza `CLIENTE`.
- Todas las entradas pasan por esquemas Zod.
- La API aplica rate limit global y CORS configurable.
- Regla de oro del contrato: el análisis de escalamiento no viaja al cliente.

## 9. Contrato del agente

`agent/AGENTS.md` define el rol, el tono, los criterios de escalamiento y las reglas de la base de conocimiento. `agent/schema.json` define la salida estructurada:

```json
{
  "answer": "texto para el cliente",
  "escalate": true,
  "analysis": {
    "summary": "...",
    "probableCause": "...",
    "suggestedSolution": "...",
    "missingInfo": "..."
  }
}
```

El servidor normaliza variantes en español/camelCase/snake_case para no depender del modelo (`normalizeOutput`).

El prompt de turno incluye cliente, título, estado, fecha, transcripción previa (si es un hilo nuevo) y el mensaje del cliente. El prompt de análisis incluye la transcripción reciente y el motivo del escalamiento.

## 10. Base de conocimiento

`agent/knowledge/` contiene 13 documentos construidos leyendo el código del producto SismaSalud en `C:\inetpub\wwwroot\SismaSalud` (solo lectura):

1. Producto
2. Roles y permisos
3. Afiliación y autorizaciones
4. Citas y Digiturno
5. Historia clínica
6. Farmacia e inventario
7. Facturación, RIPS y caja
8. Paraclínicos y quirófanos
9. PyP, RIAS y vacunación
10. Portal del paciente
11. Informes y administración
12. Errores frecuentes
13. Glosario

`_pendientes.md` registra los temas que no se pudieron confirmar en el código y que conviene validar con el equipo funcional.

El agente trabaja con `cwd = agent/` y recibe `C:\inetpub\wwwroot\SismaSalud` como directorio adicional de solo lectura (`--add-dir`).

## 11. Decisiones de diseño

| Decisión | Motivo |
| --- | --- |
| Un proceso `agy` por turno | El CLI no ofrece un modo servidor estable; `--conversation` da continuidad suficiente. |
| Cola por chat + concurrencia global | Evita respuestas fuera de orden y limita el costo/cuota del modelo. |
| Análisis en tabla aparte | Permite mostrarlo solo al staff y generarlo después del escalamiento sin bloquear la cola. |
| Estados explícitos | Hace triviales las reglas de quién puede escribir y cuándo interviene el agente. |
| Contador de versión en el cliente | Menos código que un store normalizado y suficientemente rápido para este volumen. |
| `AGENT_MODE=mock` | Permite desarrollar y probar sin gastar cuota ni esperar varios minutos por turno. |
| Expo Router con rutas en `src/app` | Navegación declarativa, deep links (`/chat/[id]`) y guardas por layout. |

## 12. Límites conocidos y siguientes pasos

- **Latencia**: el CLI real tarda decenas de segundos por turno. La interfaz muestra “escribiendo…” y vista previa, pero no hay streaming token a token desde el modelo.
- **Adjuntos**: no se soportan imágenes ni archivos.
- **Notificaciones**: solo dentro de la app; no hay push.
- **Panel de administración**: mínimo (alta y listado de consultores). No hay edición, desactivación ni métricas históricas.
- **KB**: es una primera versión; `_pendientes.md` debe cerrarse con el equipo de SismaSalud.
- **Privacidad**: no se implementó anonimización ni retención de datos; queda fuera del alcance acordado.
- **Pruebas**: hay unitarias del servidor y un smoke de API/WebSocket. No hay pruebas E2E automatizadas de las interfaces.
- **Escalabilidad**: Socket.IO y Prisma corren en una sola instancia. Para varias réplicas haría falta un adaptador de Socket.IO y una cola distribuida.
