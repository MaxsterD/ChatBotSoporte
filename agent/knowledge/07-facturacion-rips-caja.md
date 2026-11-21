# Facturación, caja y RIPS

## Admisión

Antes de facturar debe existir una atención. Flujo: **Facturación → Admisión** → buscar
paciente → seleccionar contrato/EPS → registrar el ingreso → imprimir o generar la orden
de atención.

- Admisión hospitalaria y ambulatoria usan pantallas distintas; elija la correcta.
- El contrato determina tarifas, copagos y validaciones de RIPS.
- Si el paciente no aparece, primero revise su afiliación.

## Facturación

- **Facturar atención**: genera la factura con los servicios registrados en la HC.
- **Notas crédito / notas de ajuste**: se usan para corregir o anular total o parcialmente
  una factura ya emitida; requieren motivo.
- **Agrupar facturas**: consolida varias facturas del mismo contrato o paciente según
  parametrización.
- **Tarifas y contratos**: si un procedimiento no tiene precio, la factura queda en cero o
  bloqueada.
- La factura cerrada no se modifica: se corrige con nota y, si aplica, nueva factura.

## Caja

- **Caja → Punto de venta**: registrar pagos de factura, copagos y cuotas moderadoras.
- Medios de pago: efectivo, tarjeta, transferencia y los configurados por la institución.
- **Cierre de caja**: se hace por turno o por día; valida que los pagos registrados
  coincidan con el arqueo.
- Si el cierre no cuadra, revise pagos anulados, duplicados o registrados en otra caja.

## RIPS

Ruta habitual: **Facturación → Generación RIPS**.

1. Seleccione periodo, contrato/EPS y tipo de RIPS.
2. Genere el archivo y revise el resultado de la validación.
3. Audite las facturas incluidas y corrija lo que el sistema marque.
4. Envíe a la EPS o al mecanismo de radicación definido por la institución.

Errores frecuentes y su significado:

- **"Algunas facturas poseen valores incorrectos. Debe corregirlas antes de continuar."**:
  hay facturas con valores en cero, sin tarifa o con datos inconsistentes. Corrija la
  factura antes de generar el RIPS.
- **"No se puede mostrar. El número de factura no existe, la factura está abierta o ya
  tiene una remisión generada."**: la factura no está cerrada, no existe o ya fue incluida
  en otro RIPS. Cierre la factura o consulte la remisión existente.
- **"Esta solicitud genera 0 registros."**: el filtro no encontró facturas válidas para ese
  periodo/contrato; revise fechas, estado de las facturas y contrato.
- **"El número de remisión no existe."**: se intentó anular o consultar una remisión con un
  número equivocado.
- **"Debe ingresar motivo de reversión."**: complete el motivo al revertir o anular.
- RIPS rechazado por la EPS: revise el detalle del rechazo (código de glosa), corrija y
  regenere; no reenvíe el mismo archivo sin corregir.

## Facturación electrónica

- La factura electrónica se genera desde la interfaz de facturación electrónica y se envía
  a la DIAN según la configuración de la institución.
- Estados típicos: pendiente, enviada, aceptada, rechazada.
- Si la DIAN rechaza, el detalle indica el motivo (resolución, CUFE, datos del adquiriente,
  valor). Corrija y regenere.
- No se debe anular una factura electrónica aceptada sin nota crédito.

## Qué pedir para escalar

Número de factura, documento del paciente, contrato/EPS, fecha de la atención, tipo de
RIPS, mensaje exacto y captura de pantalla cuando sea posible. Sin estos datos el caso no
se puede revisar.
