# Guía de Instalación, Configuración y Revisión Académica
## Sistema Chatbot Soporte SismaSalud

Este paquete contiene el código fuente completo y sanitizado del proyecto **Chatbot Soporte SismaSalud**, desarrollado con arquitectura monorepo modular:
- **Backend API (`server/`)**: Fastify 5, TypeScript, Socket.IO 4, Prisma ORM 6, PostgreSQL 16.
- **Frontend Web (`web/`)**: React 19, TypeScript, Vite 8, Tailwind CSS 4.
- **Frontend Móvil (`mobile/`)**: React Native 0.88, Expo SDK 58, Expo Router.
- **Agente Cognitivo (`agent/`)**: Reglas maestras y base de conocimiento hospitalaria (13 manuales técnicos).
- **Documento PDF Oficial**: `informe_tecnico_chatbotsoporte.pdf` (incluido en la raíz y en `docs/`).

---

## 1. Requisitos Previos

- **Node.js**: Versión 20.x, 22.x o 24.x LTS.
- **npm**: Versión 10.x o superior.
- **PostgreSQL**: Versión 14, 15 o 16 (puerto predeterminado `5432`).

---

## 2. Puesta en Marcha Rápida (Paso a Paso)

### Paso 1: Configurar Variables de Entorno
Copia los archivos de plantilla de entorno:

```bash
# En el directorio server
cp server/.env.example server/.env

# En el directorio web
cp web/.env.example web/.env

# En el directorio mobile
cp mobile/.env.example mobile/.env
```

> **Nota de Configuración**: En `server/.env`, ajusta la variable `DATABASE_URL` con tu usuario y contraseña local de PostgreSQL:
> ```env
> DATABASE_URL="postgresql://postgres:tu_password@127.0.0.1:5432/chatbotsoporte?schema=public"
> ```
> Por defecto, `AGENT_MODE=mock` viene activado para permitir la ejecución inmediata del agente de inteligencia artificial sin requerir credenciales ni cuota externa de API.

---

### Paso 2: Instalar Dependencias
Desde la raíz del proyecto, ejecuta el comando que instala las dependencias de todos los paquetes de manera orquestada:

```bash
npm run setup
```

---

### Paso 3: Inicializar Base de Datos y Datos de Prueba
Crea la base de datos `chatbotsoporte` en PostgreSQL y ejecuta las migraciones junto con el semillero (seed) inicial:

```bash
# Crear base de datos en psql (si no existe):
# CREATE DATABASE chatbotsoporte;

# Aplicar migraciones y poblar datos iniciales:
npm run db:reset
```

Este comando creará automáticamente:
- Tablas relacionales con índices y restricciones.
- Usuarios demostrativos con contraseñas seguras (`demo1234`).
- Tickets de soporte iniciales en cola y asignados con diagnósticos de IA.

---

### Paso 4: Ejecución de Pruebas Automatizadas
Para verificar la integridad del código fuente y validar que todos los módulos y reglas de negocio operan al 100%:

```bash
npm test
```
*Ejecutará la batería completa de 67 tests unitarios y de integración.*

---

### Paso 5: Iniciar los Servicios

Puedes iniciar los servicios de manera conjunta o independiente:

```bash
# Iniciar Servidor Backend (Puerto 4000)
npm run dev:server

# Iniciar Consola Web (Puerto 5173)
npm run dev:web

# Iniciar Aplicación Móvil (Puerto 8081 / Expo)
npm run dev:mobile
```

---

## 3. Credenciales de Prueba (Demostración)

| Rol | Correo Electrónico | Contraseña | Descripción |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@sismasalud.demo` | `demo1234` | Acceso total: Horarios, Entornos Clínicos, Clientes y Agente. |
| **CONSULTOR** | `consultor1@sismasalud.demo` | `demo1234` | Perfil de Laura Gómez: Cola en vivo, Chats, Notas y Agente. |
| **CLIENTE** | `cliente@sismasalud.demo` | `demo1234` | Clínica San Rafael: Acceso desde la app móvil. |
| **CLIENTE** | `cliente2@sismasalud.demo` | `demo1234` | IPS Salud Total: Acceso desde la app móvil. |

---

## 4. Documentación Adjunta

- **`informe_tecnico_chatbotsoporte.pdf`**: Documento ejecutivo con arquitectura detallada, modelos de datos, evidencias visuales con capturas reales y resultados de pruebas.
- **`docs/arquitectura.md`**: Explicación de la máquina de estados y orquestación del agente.
