# Farmacia e inventario

## Farmacia

Flujo típico de dispensación:

**Farmacia → Dispensación / Órdenes médicas** → buscar la orden del paciente → validar
medicamento, dosis y cantidad → despachar → registrar la entrega.

- **Censo de farmacia**: pacientes hospitalizados y medicamentos en curso.
- **Administración de medicamentos**: registro de enfermería sobre la orden médica.
- **Devoluciones**: se registran con motivo y quedan asociadas al movimiento de inventario.
- **Pedidos**: solicitud de medicamentos desde servicios o bodegas.
- **Agenda de farmacia**: programación de entregas o aplicaciones.

Si el medicamento no aparece al dispensar:

1. Verifique que exista la orden médica y esté vigente.
2. Confirme que el código del artículo sea el mismo del catálogo de inventario.
3. Revise existencias en la bodega de farmacia de esa sede.

## Inventario

- **Inventario → Existencias**: consulta por bodega, artículo y lote.
- **Movimientos**: entradas por compra, salidas por dispensación o consumo, traslados entre
  bodegas, ajustes por novedad.
- **Traslados**: requieren autorización cuando la institución lo tiene parametrizado.
- **Artículos**: catálogo con código interno, código de barras, presentación y unidad.
- **Costos**: valorización del inventario y costo promedio.

## Errores frecuentes

- "No hay existencias" pero el medicamento llegó: el ingreso se registró en otra bodega o
  no se confirmó el movimiento de entrada.
- El stock no cuadra: movimientos duplicados, devoluciones no registradas o traslados
  pendientes de confirmación.
- No deja facturar el medicamento: falta el artículo en el contrato/tarifario o no tiene
  precio configurado.
- Diferencias entre farmacia y facturación: la dispensación no generó el cargo; revise la
  integración de consumo y la fecha del movimiento.

## Datos para revisar un caso

Sede, bodega, código y nombre del artículo, lote, cantidad, fecha del movimiento y número
de orden o factura. Nunca compartas información de otros pacientes.
