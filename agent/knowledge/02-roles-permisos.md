# Roles, usuarios y permisos

## Perfiles típicos

| Perfil | Uso principal |
| --- | --- |
| Administrador del sistema | Usuarios, perfiles, licencias, equipos, parámetros, respaldos |
| Admisión / censo | Registro de pacientes, ingreso, camas, traslados, egresos |
| Citas / agendamiento | Agendas, apartar y confirmar citas, recordatorios |
| Facturación | Facturas, notas, agrupación, tarifas, contratos |
| Caja / punto de venta | Pagos, copagos, cierre y arqueo |
| Auditoría / RIPS | Auditoría de facturas y RIPS, glosas, correcciones |
| Médico | Historia clínica, evolución, órdenes, resultados |
| Enfermería | Evolución, administración de medicamentos, censo |
| Farmacia | Dispensación, devoluciones, pedidos, inventario de farmacia |
| Laboratorio / imágenes | Órdenes y resultados de paraclínicos |
| Gerencia | Informes, estadísticas e indicadores |
| Paciente (portal) | Sus citas, recetas, PQRS y trámites |

## Dónde se administran

- **Sistemas → Usuarios** y **Sistemas → Perfiles/roles**: creación de usuarios, asignación
  de perfil, estado activo/inactivo.
- **Configuración → Equipos / Licencias**: equipos autorizados y licencias del sistema.
- Cambios de perfil requieren cerrar sesión y volver a entrar para reflejarse.

## Síntomas frecuentes de permisos

- "No me aparece el módulo": el perfil del usuario no tiene la opción habilitada, o el
  usuario está asociado a otra sede.
- "No puedo guardar / no puedo ver": permiso de escritura o de consulta faltante.
- "El usuario está bloqueado": intentos fallidos o usuario inactivo; lo revisa un
  administrador en Sistemas → Usuarios.
- "No veo la sede correcta": el usuario está creado en otra sede o con otro centro de
  costo.

## Reglas de soporte

- Nunca compartas credenciales ni pidas la contraseña completa al cliente.
- Un cambio de permisos lo autoriza el administrador de la institución, no el soporte.
- Si el usuario no existe o está inactivo, escala: la creación/corrección se hace con
  autorización de la institución.
- Los permisos de historia clínica y facturación son sensibles: confirma siempre sede,
  usuario y perfil antes de proponer cambios.

_Pendiente de validar con el equipo: nombres exactos de las pantallas de perfiles y la
matriz de permisos por perfil en la versión instalada._
