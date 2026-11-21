# Paraclínicos y quirófanos

## Paraclínicos

Flujo general:

1. El profesional genera la **orden de paraclínico** desde la historia clínica.
2. El laboratorio o imagen recibe la orden.
3. Se registran o importan los resultados.
4. Se hace la **entrega de resultados** al paciente (impresión o portal).

- **Resultados**: consulta por orden, paciente o fecha.
- **Entrega de resultados**: deja constancia de la entrega; en citología hay pantalla
  específica.
- **Interfaces**: ImexHS y Gotelemedicina son integraciones con proveedores externos. Si la
  orden no llega o el resultado no aparece, el problema puede estar en la interfaz, no en
  SismaSalud.

Errores frecuentes:

- La orden no aparece en el laboratorio: no se generó desde la HC o quedó en otra sede.
- El resultado no se descarga: la interfaz aún no lo ha publicado.
- El paciente no puede ver el resultado en el portal: la entrega no se marcó o el portal
  está deshabilitado.

## Quirófanos

Flujo: **Quirófanos → Calendario de quirófanos** → seleccionar sala y fecha → apartar →
asignar cirujano, anestesiólogo y ayudantes → confirmar cirugía.

- **Apartar quirófano**: reserva la sala; no confirma la cirugía.
- **Confirmar cirugía**: deja el procedimiento programado y genera la atención.
- **Cancelar / aplazar**: libera la sala y notifica según configuración.
- La sala debe existir y estar activa en Configuración → Quirófanos/Áreas.
- El procedimiento debe tener código CUPS y tarifa vigente para poder facturarse.

Errores frecuentes:

- No aparecen salas disponibles: no están activas, tienen mantenimiento o el rango de
  fechas está fuera de la programación.
- No deja confirmar: falta el cirujano principal, el procedimiento o la autorización.
- La cirugía quedó programada pero no se puede facturar: falta el procedimiento en la
  atención o el contrato no cubre la tarifa.
