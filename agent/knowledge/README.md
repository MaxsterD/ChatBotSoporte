# Base de conocimiento del agente

Estos documentos son la fuente principal de respuestas del agente de soporte. Se cargan
desde el workspace `agent/`, que es el directorio de trabajo del CLI de Antigravity.

## Cómo se usa

El agente lee `AGENTS.md` como instrucciones y consulta estos archivos con sus herramientas
de lectura (`read_file`, `grep_search`) cuando el mensaje del cliente lo requiere. Por eso:

- Un archivo por tema, con títulos claros y rutas de menú reales.
- Sin credenciales, IPs, nombres de tablas ni datos de pacientes.
- Mensajes de error entre comillas para que se puedan buscar.
- Al final de cada documento, los datos que hay que pedir para revisar un caso.

## Cómo ampliarlo

1. Agregue o edite un `.md` en esta carpeta con el mismo estilo.
2. Mantenga el índice de `AGENTS.md` coherente si crea un tema nuevo.
3. Nunca incluya contraseñas, cadenas de conexión ni datos personales reales.
4. Si un procedimiento no está confirmado, anótelo en `_pendientes.md` y use lenguaje
   cauteloso ("por confirmar", "según configuración").
5. Después de un cambio, reinicie el servidor de la API si desea invalidar conversaciones
   existentes: el agente conserva el contexto de cada chat, pero lee los archivos en cada
   turno.

## Estructura

| Archivo | Tema |
| --- | --- |
| 01-producto.md | Qué es SismaSalud, módulos y arquitectura |
| 02-roles-permisos.md | Perfiles, usuarios y permisos |
| 03-afiliacion-autorizaciones.md | Registro de pacientes y autorizaciones |
| 04-citas-digiturno.md | Agendas, citas, turnos |
| 05-historia-clinica.md | HC, evolución, cierre |
| 06-farmacia-inventario.md | Dispensación, bodegas, existencias |
| 07-facturacion-rips-caja.md | Facturación, caja y RIPS |
| 08-paraclinicos-quirofanos.md | Laboratorio, imágenes y cirugías |
| 09-pyp-rias-vacunacion.md | Programas, rutas y vacunas |
| 10-portal-paciente.md | Portal y app móvil del paciente |
| 11-informes-admin.md | Informes, contabilidad, nómina |
| 12-errores-frecuentes.md | Mensajes de error y solución |
| 13-glosario.md | Términos del sector |
