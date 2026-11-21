# Portal del paciente y app móvil

## Portal del paciente

El portal permite al paciente gestionar sin ir a la IPS:

- **Citas**: consultar, agendar y cancelar citas.
- **Recetas y fórmulas médicas**: consultar la fórmula vigente.
- **Trámites y solicitudes**: peticiones administrativas.
- **PQRS**: peticiones, quejas, reclamos y sugerencias, con radicado y seguimiento.
- **Tamizajes**: encuestas o cuestionarios de riesgo.
- **Atención**: consulta de atenciones e historia resumida según configuración.

Acceso: el paciente ingresa con su documento y los datos definidos por la institución
(documento, fecha de nacimiento o correo). Si no puede ingresar:

1. Confirme que el paciente esté registrado en Afiliación con el correo correcto.
2. Verifique que el portal esté habilitado para la sede.
3. Si el sistema indica que el usuario no existe, no lo cree de nuevo: revise el registro
   de afiliación y escale si hay duplicados.

Errores frecuentes:

- **"No existe una agenda disponible"** al agendar: el profesional no tiene agenda
  configurada para esa fecha o sede.
- El paciente no ve sus resultados: la entrega no se marcó o el portal no expone ese tipo
  de resultado.
- No llega el código de verificación: correo mal registrado o bloqueo del proveedor de
  correo; requiere revisión de un asesor.

## App móvil

La app móvil institucional permite consultar citas, censo, auditoría y reportes según el
perfil habilitado. Requiere:

- Usuario activo y permisos para cada módulo.
- Conectividad con el servidor de la institución (red o VPN).
- Versión de la app compatible con la versión del sistema.

Si la app no conecta: verifique red/VPN, que el servidor esté disponible y que el usuario
tenga permisos móviles. Si el problema es solo de un usuario, escale para revisar permisos.

## Datos sensibles

En el portal y la app el paciente ve su propia información. El soporte nunca debe consultar
ni compartir datos clínicos de un paciente con terceros. Ante una solicitud de acceso,
valide identidad y escale según el procedimiento de la institución.
