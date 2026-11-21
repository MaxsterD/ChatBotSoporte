# Citas, agendas y digiturno

## Configuración previa (la causa más común de errores)

Para que una cita se pueda agendar debe existir:

1. Profesional activo y asociado a la sede.
2. Servicio o especialidad habilitada para ese profesional.
3. Agenda creada con rango de fechas, día, hora de inicio/fin y duración del turno.
4. Festivos configurados para no ofrecer días no hábiles.
5. Contrato/tarifa vigente si la cita genera copago.

Se administra en **Configuración → Agendas** (horarios del profesional) y **Configuración
→ Festivos**. Las agendas se pueden crear por sede y por servicio.

## Agendar una cita

Ruta habitual: **Citas → Calendario de citas** → buscar paciente → seleccionar profesional
y fecha → elegir el turno disponible → **Apartar** → **Confirmar**.

- **Apartar** deja la cita reservada pero sin confirmar; **Confirmar** la deja en firme.
- **Aplazar** cambia fecha u hora conservando el paciente.
- **Cancelar** libera el turno; registre el motivo para trazabilidad.
- Las citas múltiples o grupales se confirman desde las pantallas de confirmación múltiple.
- Los recordatorios se envían según la configuración de recordatorios de citas.

## Errores frecuentes

- **"No existe una agenda disponible"**: no hay agenda para ese profesional/fecha o el
  rango de la agenda ya venció. Revisar Configuración → Agendas y la fecha de vigencia.
- **"Operación inválida. No ha seleccionado una cita"**: se intentó confirmar/aplazar sin
  seleccionar el registro; volver a seleccionar el turno.
- El profesional aparece pero no muestra horarios: agenda sin días configurados o el
  profesional está asociado a otra sede.
- El paciente no aparece en la búsqueda: no está afiliado o el documento está mal
  digitado; primero regístrelo en Afiliación.

## Alertas PYP

Al agendar, el sistema puede mostrar alertas de programas de promoción y prevención
pendientes para el paciente. La alerta no impide la cita salvo configuración expresa;
si se requiere bloquear, se ajusta en la parametrización de PYP.

## Digiturno

- **Digiturno → Turnos**: genera el turno del paciente por servicio o por cita.
- Las pantallas de llamado muestran el turno en sala; requieren que el equipo esté
  autorizado en Configuración → Equipos y con licencia activa.
- Si la pantalla de llamado no actualiza, revise conectividad del equipo y que el servicio
  de turnos esté activo.

## Portal del paciente

El paciente puede agendar o consultar citas desde el portal si la institución lo tiene
habilitado. Para eso debe estar registrado con documento y correo válidos. Si el portal
dice que no hay agenda, el problema está en la agenda del profesional, no en el portal.
