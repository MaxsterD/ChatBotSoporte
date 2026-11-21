# SismaSalud: producto y arquitectura funcional

SismaSalud es un sistema integral de información en salud para IPS, clínicas y hospitales
en Colombia. Cubre el ciclo operativo completo: afiliación, admisión, citas, historia
clínica, órdenes médicas, farmacia e inventario, paraclínicos, quirófanos, facturación,
RIPS, cartera, contabilidad, nómina, programas de promoción y prevención (PYP), rutas
integrales de atención (RIAS), vacunación y un portal para pacientes.

## Módulos principales

- **Afiliación**: registro y actualización de pacientes, datos demográficos, tipo de
  afiliación, EPS/contrato, plan, nivel, estrato.
- **Admisión / Censo**: apertura de atenciones, ingreso hospitalario, censo de camas,
  traslados y egresos.
- **Citas**: agendas por profesional y sede, apartar, confirmar, aplazar, cancelar,
  recordatorios, listas de espera, alertas PYP.
- **Digiturno**: turnos y pantallas de llamado para salas de espera.
- **Historia clínica (HC)**: evolución, notas, formatos fijos y dinámicos, odontología,
  plan de tratamiento, teleconsulta, cierre de historia.
- **Farmacia**: dispensación, censo de farmacia, devoluciones, pedidos, administración de
  medicamentos, agenda de farmacia.
- **Inventario**: existencias, bodegas, movimientos, traslados, costos, artículos.
- **Facturación**: factura de venta, notas crédito y ajuste, agrupación de facturas,
  cuentas de cobro, tarifas y contratos.
- **Caja / Punto de venta**: pagos, copagos, cuotas moderadoras, cierre y arqueo de caja.
- **RIPS**: generación, auditoría, corrección, anulación, archivos y envío de RIPS.
- **Paraclínicos**: órdenes, resultados, entrega de resultados, citología, interfaces de
  laboratorio (ImexHS, Gotelemedicina) e imágenes diagnósticas.
- **Quirófanos**: programación, apartado de salas, confirmación y cancelación de cirugías.
- **PYP / RIAS**: programas de promoción y prevención, captación de pacientes, plan
  canguro, alertas y agendamiento de atenciones.
- **Vacunación**: registro de dosis, esquemas, empresas de vacunación.
- **Gerencia, informes, estadísticas**: indicadores, reportes operativos y financieros.
- **Contabilidad, costos y nómina**: integración contable, centros de costo, liquidación.
- **Portal de pacientes**: citas, PQRS, recetas y fórmulas, trámites y tamizajes.
- **Sistemas**: usuarios, perfiles, licencias, equipos, respaldos, sincronización.
- **Configuración**: parámetros generales, servicios, áreas, camas, agendas, contratos,
  tarifas, artículos, barrios, festivos y catálogos clínicos.

## Cómo está construido (referencia para soporte técnico)

- Aplicación web principal en PHP sobre IIS, con la lógica de negocio en procedimientos
  almacenados sobre SQL Server (base `SismaSalud`, base de indicadores `reportes` /
  `ZeusSaludIndicadoresReportes`).
- Portal de pacientes separado (`portalUsuariosV2`) y aplicación móvil (`Mobile`) con
  servicios en `ws` y `NodeJS`.
- Interfaces con terceros: facturación electrónica, laboratorios, gotelemedicina,
  vacunación y farmacia externa.
- La configuración de conexión por sede vive en archivos `conf_zs.ini`; un cambio de
  servidor o base afecta a todos los módulos de esa sede.

## Alcance del soporte

Se atiende: uso de módulos, permisos, configuración funcional, errores de validación,
datos mal diligenciados, dudas de proceso y comportamiento inesperado.

No se atiende por este canal: desarrollo de funcionalidades nuevas, cambios de código,
acceso directo a la base de datos, recuperación de contraseñas de base de datos ni
decisiones contractuales. Eso se escala al equipo técnico o comercial.
