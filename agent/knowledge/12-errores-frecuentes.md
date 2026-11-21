# Errores frecuentes y cómo abordarlos

## Validaciones de formulario

| Mensaje | Causa | Qué hacer |
| --- | --- | --- |
| "Seleccione tipo de documento" / "Ingrese número de documento" | Campos obligatorios vacíos | Completar en la misma pantalla |
| "Ingrese primer nombre / primer apellido" | Datos demográficos incompletos | Completar antes de guardar |
| "Seleccione sexo" / "Seleccione la fecha de nacimiento" | Falta dato obligatorio | Completar |
| "Seleccione el tipo de afiliación" | No se eligió EPS/régimen | Seleccionar tipo de afiliación |
| "Seleccione el departamento / ciudad / barrio" | Ubicación incompleta | Completar ubicación; si el barrio no existe, crearlo en Configuración |

## Citas

| Mensaje | Causa | Qué hacer |
| --- | --- | --- |
| "No existe una agenda disponible" | Agenda inexistente, vencida o de otra sede | Revisar Configuración → Agendas y la vigencia |
| "Operación inválida. No ha seleccionado una cita" | No se seleccionó el registro | Seleccionar el turno y repetir la acción |
| No aparecen horarios del profesional | Agenda sin días/horas o profesional en otra sede | Ajustar agenda o sede del profesional |

## RIPS

| Mensaje | Causa | Qué hacer |
| --- | --- | --- |
| "Algunas facturas poseen valores incorrectos. Debe corregirlas antes de continuar." | Facturas en cero, sin tarifa o inconsistentes | Corregir la factura y regenerar |
| "No se puede mostrar. El número de factura no existe, la factura está abierta o ya tiene una remisión generada." | Factura abierta, inexistente o ya incluida | Cerrar la factura o consultar la remisión |
| "Esta solicitud genera 0 registros" | Filtro sin facturas válidas | Revisar fechas, contrato y estado de facturas |
| "El número de remisión no existe" | Número equivocado al anular/consultar | Verificar el número de remisión |
| "Debe ingresar motivo de reversión" | Falta el motivo | Escribir el motivo y repetir |

## Historia clínica

| Mensaje | Causa | Qué hacer |
| --- | --- | --- |
| "Seleccione un tipo de historia" | No se eligió la plantilla | Elegir el tipo antes de guardar |
| "Ingrese el motivo por el cual se va a cerrar la historia anterior" | Hay una historia abierta | Cerrar la anterior con motivo o continuar en la misma |
| No guarda sin mostrar error | Campo obligatorio oculto o sesión expirada | Recargar, revisar campos y reintentar |

## Acceso y permisos

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| "Usuario o contraseña incorrectos" | Clave errada o usuario inactivo | Restablecer clave; si persiste, revisar estado del usuario |
| No aparece un módulo | Perfil sin permiso o sede equivocada | Revisar perfil y sede en Sistemas → Usuarios |
| Pantalla en blanco o error 500 | Error de aplicación o servicio caído | Registrar hora, usuario y módulo; escalar |
| Lentitud general | Servidor, red o base de datos | Confirmar si afecta a todos; escalar de inmediato |

## Regla general

Si el mensaje no está en esta lista: pide el texto exacto, el módulo y la acción, busca en
la documentación y, si no hay certeza, escala con el análisis. No propongas "borrar y
volver a crear" registros clínicos, facturas ni autorizaciones.
