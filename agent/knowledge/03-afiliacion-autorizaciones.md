# Afiliación y autorizaciones

## Registro y actualización de un paciente (Afiliación)

Datos obligatorios que el sistema valida al guardar:

1. Tipo de documento y número.
2. Primer nombre y primer apellido.
3. Sexo.
4. Fecha de nacimiento.
5. Tipo de afiliación (contributivo, subsidiado, particular, SOAT, otro).
6. Departamento, ciudad y barrio.

Si falta uno de estos campos el sistema muestra un mensaje del tipo "Seleccione tipo de
documento", "Ingrese número de documento", "Seleccione sexo", "Seleccione la fecha de
nacimiento", "Seleccione el tipo de afiliación", "Seleccione el departamento/ciudad/barrio".
La solución es completar el dato en la misma pantalla, no crear un paciente nuevo.

Recomendaciones:

- Antes de crear un paciente, búsquelo por número de documento en Afiliación → Búsqueda de
  pacientes para evitar duplicados.
- Cambiar tipo o número de documento de un paciente con atenciones genera inconsistencia;
  requiere autorización y se escala.
- Si el paciente cambia de EPS o régimen, actualice la afiliación y verifique el contrato
  vigente antes de facturar.

## Autorizaciones

Flujo general:

1. Admisión o el área clínica registra la **solicitud de autorización** con el servicio o
   procedimiento requerido.
2. Se envía a la EPS o auditor y se registra el número de autorización.
3. En **Autorizaciones** se aprueba y se cargan los ítems autorizados (procedimientos,
   medicamentos, cantidades y vigencias).
4. Al facturar, el sistema valida que el servicio esté cubierto por una autorización
   vigente.

Errores frecuentes:

- "No hay autorización vigente": la autorización está vencida, no cubre el ítem o quedó en
  estado pendiente.
- El ítem facturado no coincide con el código autorizado (CUPS diferente) y el sistema lo
  rechaza.
- La autorización pertenece a otro paciente o a otra sede.

Qué pedir para revisar un caso: número de autorización, documento del paciente, fecha de
la atención, código del servicio y mensaje exacto.

_Pendiente de validar: nombres de las pantallas de solicitud y aprobación en la versión
instalada de cada institución._
