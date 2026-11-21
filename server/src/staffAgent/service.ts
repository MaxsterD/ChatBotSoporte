import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import sql from 'mssql';
import { prisma } from '../db';
import { env, serverRoot } from '../env';
import { badRequest, notFound, forbidden, conflict } from '../lib/errors';
import { getRawLocalEnvironmentConfig } from '../config/localEnvironment';
import { decryptCredential } from '../lib/crypto';
import { sismaDb } from '../agent/db/sismaDb';
import { resolveAgyBinary } from '../agent/bridge';
import { getEnvironmentDbPool } from '../environments/service';

export interface ProposedPlanAction {
  type: 'SQL' | 'FILE';
  title?: string;
  description: string;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  sql?: string;
  filePath?: string;
  targetContent?: string;
  replacementContent?: string;
  diff?: string;
}

export interface PlanExecutionResult {
  success: boolean;
  message: string;
  rowsAffected?: number;
  backupPath?: string;
  executedAt: string;
  executedBy: string;
}

export interface StaffSessionDTO {
  id: string;
  title: string;
  environmentId: string | null;
  environmentName: string;
  createdAt: Date;
  updatedAt: Date;
  messagesCount?: number;
}

export interface StaffMessageDTO {
  id: string;
  role: 'CONSULTANT' | 'AGENT';
  content: string;
  imageUrl?: string | null;
  planAction?: ProposedPlanAction | null;
  executionResult?: PlanExecutionResult | null;
  createdAt: Date;
}

/**
 * Lista todas las sesiones de consulta técnica del consultor.
 */
export async function listStaffSessions(consultantId: string): Promise<StaffSessionDTO[]> {
  const sessions = await prisma.staffAgentSession.findMany({
    where: { consultantId },
    orderBy: { updatedAt: 'desc' },
    include: {
      environment: { select: { id: true, name: true, dbDatabase: true } },
      _count: { select: { messages: true } },
    },
  });

  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    environmentId: s.environmentId,
    environmentName: s.environment ? s.environment.name : 'Entorno Local (SismaSalud Base)',
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    messagesCount: s._count.messages,
  }));
}

/**
 * Crea una nueva sesión técnica para el consultor.
 */
export async function createStaffSession(
  consultantId: string,
  input?: { title?: string; environmentId?: string | null },
) {
  const title = input?.title?.trim() || 'Nueva Consulta Técnica';
  const environmentId = input?.environmentId || null;

  const session = await prisma.staffAgentSession.create({
    data: {
      consultantId,
      title,
      environmentId,
    },
    include: {
      environment: { select: { id: true, name: true, dbDatabase: true } },
    },
  });

  return {
    id: session.id,
    title: session.title,
    environmentId: session.environmentId,
    environmentName: session.environment ? session.environment.name : 'Entorno Local (SismaSalud Base)',
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: [],
  };
}

/**
 * Obtiene el detalle de una sesión con todos sus mensajes.
 */
export async function getStaffSession(sessionId: string, consultantId: string, role?: string) {
  const session = await prisma.staffAgentSession.findUnique({
    where: { id: sessionId },
    include: {
      environment: { select: { id: true, name: true, dbDatabase: true, dbServer: true, sourcePath: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!session) throw notFound('Sesión no encontrada');
  if (session.consultantId !== consultantId && role !== 'ADMIN') throw forbidden('No tienes permiso para ver esta sesión');

  return {
    id: session.id,
    title: session.title,
    environmentId: session.environmentId,
    environmentName: session.environment ? session.environment.name : 'Entorno Local (SismaSalud Base)',
    environment: session.environment,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: session.messages.map((m) => ({
      id: m.id,
      role: m.role as 'CONSULTANT' | 'AGENT',
      content: m.content,
      imageUrl: m.imageUrl,
      planAction: (m.planAction as any) ?? null,
      executionResult: (m.executionResult as any) ?? null,
      createdAt: m.createdAt,
    })),
  };
}

/**
 * Cambia el entorno seleccionado para una sesión activa.
 */
export async function updateStaffSessionEnvironment(
  sessionId: string,
  environmentId: string | null,
  consultantId: string,
  role?: string,
) {
  const session = await prisma.staffAgentSession.findUnique({ where: { id: sessionId } });
  if (!session) throw notFound('Sesión no encontrada');
  if (session.consultantId !== consultantId && role !== 'ADMIN') throw forbidden('Acceso denegado');

  const updated = await prisma.staffAgentSession.update({
    where: { id: sessionId },
    data: { environmentId },
    include: {
      environment: { select: { id: true, name: true, dbDatabase: true } },
    },
  });

  return {
    id: updated.id,
    title: updated.title,
    environmentId: updated.environmentId,
    environmentName: updated.environment ? updated.environment.name : 'Entorno Local (SismaSalud Base)',
  };
}

/**
 * Elimina una sesión técnica.
 */
export async function deleteStaffSession(sessionId: string, consultantId: string, role?: string) {
  const session = await prisma.staffAgentSession.findUnique({ where: { id: sessionId } });
  if (!session) throw notFound('Sesión no encontrada');
  if (session.consultantId !== consultantId && role !== 'ADMIN') throw forbidden('Acceso denegado');

  await prisma.staffAgentSession.delete({ where: { id: sessionId } });
  return { ok: true };
}

/**
 * Genera una respuesta técnica realista simulada cuando AGENT_MODE=mock o como fallback.
 */
function generateTechnicalMockResponse(userMessage: string, environmentName: string): string {
  const lower = userMessage.toLowerCase();

  if (lower.includes('modifica') || lower.includes('cambia') || lower.includes('ajusta') || lower.includes('reestructura') || lower.includes('en vez de')) {
    return `### Plan Reestructurado según tus Indicaciones (${environmentName})

He analizado tus observaciones y reestructurado la solución técnica en consecuencia:

> "${userMessage}"

#### 1. Ajustes Incorporados
- **Alcance refinado**: Se adaptaron las condiciones del query/código a las directivas indicadas.
- **Validaciones añadidas**: Se verifica que los cambios apliquen únicamente a los registros o módulos correspondientes sin afectar transacciones colaterales.
- **Preparado para Build**: Se genera el plan actualizado para tu validación y posterior ejecución.

#### 2. Query / Código Reestructurado
\`\`\`sql
-- Sentencia SQL reestructurada con las nuevas condiciones del consultor
UPDATE sis_deta 
SET total = cantidad * (SELECT TOP 1 manual_soat FROM contratos WHERE codigo = sis_deta.cod_servicio)
WHERE estudio = 12345 AND estado = 'P';
\`\`\`

#### 3. Pasos Siguientes
Puedes revisar los parámetros en la tarjeta interactiva inferior y proceder a ejecutar el plan reestructurado cuando consideres oportuno.`;
  }

  if (lower.includes('factur') || lower.includes('glosa') || lower.includes('resolucion')) {
    return `### Análisis Técnico de Facturación (${environmentName})

He analizado la estructura y lógica de facturación para este caso:

#### 1. Causa Raíz Probable
El error suele producirse cuando el registro en la tabla \`sis_maes\` (encabezado de factura) no coincide en estado (\`estado = 'A'\` abierta / \`estado = 'C'\` cerrada) o cuando existe una inconsistencia de valores entre los ítems facturados en \`sis_deta\` y el total acumulado en el contrato (\`contratos\`).

#### 2. Consultas SQL de Diagnóstico
Puedes ejecutar estas consultas en la base de datos para verificar la integridad del registro:

\`\`\`sql
-- 1. Verificar estado de la factura y paciente asociado
SELECT 
    m.con_estudio, m.nro_factura, m.estado, m.cod_clie, m.vlr_factura, m.vlr_coopago, m.vlr_descto,
    p.primer_nom + ' ' + p.primer_ape AS paciente, p.num_id
FROM sis_maes m WITH(NOLOCK)
INNER JOIN sis_paci p WITH(NOLOCK) ON p.autoid = m.autoid
WHERE m.nro_factura = '0' OR m.con_estudio = 12345;

-- 2. Inspeccionar ítems con inconsistencia de valores o tarifas
SELECT 
    d.id, d.cod_servicio, d.descripcion, d.cantidad, d.total, d.tipo_estudio
FROM sis_deta d WITH(NOLOCK)
WHERE d.estudio = 12345
ORDER BY d.id ASC;
\`\`\`

#### 3. Validación en Código Fuente PHP
En el controlador \`CtrlFacturacion.php\` (o \`ModelFacturacion.php\`), revisa la función \`validarCierreFactura()\`:
\`\`\`php
// Verificación de glosas pendientes y copagos
if ($totalCalculado != $vlr_factura_maes) {
    // Si hay discrepancia de decimales en tarifas SOAT / ISS:
    $vlr_factura_maes = round($totalCalculado, 2);
}
\`\`\`

#### 4. Solución Propuesta
1. Ejecuta el diagnóstico SQL para confirmar si los totales de \`sis_deta\` cuadran con \`vlr_factura\` en \`sis_maes\`.
2. Si los valores difieren por redondeo, actualiza el encabezado con el monto exacto o recalcula las liquidaciones desde el módulo de Facturación.`;
  }

  if (lower.includes('cita') || lower.includes('agenda') || lower.includes('medico')) {
    return `### Diagnóstico Técnico de Agenda y Citas (${environmentName})

#### 1. Diagnóstico del Sistema
Revisando la lógica de asignación de citas en \`citas\` y disponibilidad médica en \`horarios_medicos\`:

\`\`\`sql
-- Verificar citas programadas y bloqueos de agenda
SELECT 
    c.id, c.fecha, c.hora, c.estado, c.cod_medi, m.nombre AS medico, c.autoid
FROM citas c WITH(NOLOCK)
LEFT JOIN sis_medi m WITH(NOLOCK) ON m.codigo = c.cod_medi
WHERE c.fecha >= CAST(GETDATE() AS DATE)
ORDER BY c.fecha, c.hora;
\`\`\`

#### 2. Código Fuente Relevante
Revisa \`CtrlAgendaMedica.php\` en la ruta de fuentes:
- Validar que la variable de sesión \`$_SESSION['codigo_medico']\` tenga permisos en \`sis_nivelacceso\`.
- Comprobar que no exista concurrencia de doble agendamiento en el mismo intervalo de minutos.`;
  }

  return `### Análisis Técnico para Soporte (${environmentName})

He procesado tu consulta técnica:

> "${userMessage}"

#### 1. Diagnóstico y Contexto
- **Entorno evaluado**: \`${environmentName}\`
- **Revisión de tablas sugerida**: Para analizar este comportamiento, examina las tablas maestras correspondientes (\`sis_maes\`, \`sis_deta\`, \`sis_paci\` o \`sis_menu\`).

#### 2. Query de Verificación
\`\`\`sql
-- Consulta de inspección de parámetros y configuración
SELECT TOP 20 
    parametro, valor, modulo, descripcion
FROM parametrosGenerales WITH(NOLOCK)
WHERE parametro LIKE '%ERROR%' OR modulo LIKE '%SISTEMA%';
\`\`\`

#### 3. Recomendación de Solución
1. Revisa los logs de errores PHP en la carpeta \`logs/\` o en el visor de sucesos.
2. Si el problema se generó tras una actualización de tarifas o contratos, valida la vigencia en la tabla \`contratos\`.
3. Si necesitas que profundice en un script o procedimiento específico, puedes indicarme el nombre de la tabla o adjuntarme una captura de la pantalla.`;
}

/**
 * Ejecuta un turno del agente técnico sin restricciones usando Antigravity CLI.
 */
async function runStaffAgy(prompt: string, extraDirs: string[], conversationId?: string): Promise<string> {
  const binary = resolveAgyBinary();
  const uploadsDir = path.resolve(serverRoot, 'uploads');
  const allDirs = Array.from(new Set([...extraDirs, uploadsDir])).filter(Boolean);

  const args = [
    `--print=${prompt}`,
    '--output-format',
    'stream-json',
    '--disable-slash-commands',
    '--sandbox',
    '--dangerously-skip-permissions',
    '--print-timeout',
    '120s',
    '--model',
    env.AGY_MODEL,
  ];

  if (conversationId) {
    args.push('--conversation', conversationId);
  }

  for (const dir of allDirs) {
    args.push('--add-dir', dir);
  }

  return new Promise<string>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(binary, args, {
        cwd: env.agentWorkspace,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(err);
      return;
    }

    let resultResponse = '';
    let buffer = '';
    let stderr = '';

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      reject(new Error('El agente tardó más de 120 segundos en responder'));
    }, 125_000);

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('{')) continue;
        try {
          const event = JSON.parse(line);
          if (event && typeof event === 'object') {
            const type = event.type;
            if (type === 'result') {
              const resObj = event.result && typeof event.result === 'object' ? (event.result as Record<string, unknown>) : {};
              if (typeof resObj.response === 'string') {
                resultResponse = resObj.response;
              } else if (typeof event.response === 'string') {
                resultResponse = event.response;
              }
            } else if (typeof event.response === 'string') {
              resultResponse = event.response;
            }
          }
        } catch {}
      }
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (resultResponse.trim()) {
        resolve(resultResponse.trim());
      } else {
        // Si no capturó evento result pero terminó bien o con buffer
        if (buffer.trim()) {
          try {
            const last = JSON.parse(buffer.trim());
            if (last.response) return resolve(last.response);
          } catch {}
        }
        reject(new Error(`El agente no devolvió texto utilizable (código ${code}). ${stderr.slice(-300)}`));
      }
    });
  });
}

/**
 * Envía un mensaje técnico del consultor al agente con soporte de imagen, modo plan y entorno dinámico.
 */
export async function sendStaffMessage(params: {
  sessionId: string;
  consultantId: string;
  content: string;
  imageUrl?: string | null;
  mode?: 'CHAT' | 'PLAN';
}) {
  const { sessionId, consultantId, content, imageUrl, mode } = params;

  if (!content.trim() && !imageUrl) {
    throw badRequest('Debe ingresar un mensaje o adjuntar una imagen');
  }

  const session = await prisma.staffAgentSession.findUnique({
    where: { id: sessionId },
    include: {
      environment: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 6 },
    },
  });

  if (!session) throw notFound('Sesión no encontrada');
  if (session.consultantId !== consultantId) throw forbidden('Acceso denegado');

  const hasPreviousPlan = session.messages.some(
    (m) => m.role === 'AGENT' && (Boolean(m.planAction) || m.content.includes('```plan')),
  );
  const isPlanMode =
    mode === 'PLAN' ||
    content.toLowerCase().includes('/plan') ||
    content.toLowerCase().includes('plan de') ||
    /modifica|ajusta|reestructura|cambia|en vez de|no hagas|corrige/i.test(content) ||
    hasPreviousPlan;

  // 1. Guardar mensaje del consultor
  const consultantMessage = await prisma.staffAgentMessage.create({
    data: {
      sessionId,
      role: 'CONSULTANT',
      content: content.trim(),
      imageUrl: imageUrl?.trim() || null,
    },
  });

  // 2. Resolver contexto del entorno seleccionado
  let environmentName = 'Entorno Local (SismaSalud Base)';
  let sourceDir = '';
  let dbInfo = '';
  let contextDetails = '';
  const extraDirs: string[] = [];

  if (session.environment) {
    const envData = session.environment;
    environmentName = envData.name;
    sourceDir = envData.sourcePath;
    dbInfo = `SQL Server ${envData.dbServer}:${envData.dbPort} / Base de Datos: ${envData.dbDatabase}`;
    extraDirs.push(envData.sourcePath);
    contextDetails = `El consultor seleccionó el entorno de la institución "${envData.name}".
- Base de Datos remota: ${envData.dbDatabase} en ${envData.dbServer} (Usuario SQL: ${envData.dbUser}).
- Ruta de Código Fuente SMB / Red: ${envData.sourcePath}.`;
  } else {
    const rawLocal = await getRawLocalEnvironmentConfig();
    sourceDir = rawLocal.sourcePath;
    dbInfo = `SQL Server ${rawLocal.dbServer}:${rawLocal.dbPort} / Base de Datos: ${rawLocal.dbDatabase}`;
    if (rawLocal.sourcePath) extraDirs.push(rawLocal.sourcePath);
    const localSismaCtx = await sismaDb.obtenerContextoSoporte(content).catch(() => '');
    contextDetails = `El consultor seleccionó el Entorno Local Base.
- Base de Datos local: ${rawLocal.dbDatabase} en ${rawLocal.dbServer}
- Ruta de Código Fuente local: ${rawLocal.sourcePath}
${localSismaCtx ? `\nContexto detectado en BD local:\n${localSismaCtx}` : ''}`;
  }

  // 3. Manejo de imagen adjunta
  let imagePromptBlock = '';
  if (imageUrl) {
    const filename = path.basename(imageUrl);
    const absoluteImagePath = path.resolve(serverRoot, 'uploads', filename);
    imagePromptBlock = `
[IMAGEN ADJUNTA POR EL CONSULTOR]
- Archivo físico: ${absoluteImagePath}
- URL: ${imageUrl}
El consultor adjuntó una imagen / captura de pantalla técnica. Utiliza la herramienta read_file con la ruta "${absoluteImagePath}" para inspeccionar visualmente la imagen. Identifica el diálogo de error, número de documento, módulo o alerta en pantalla y correlaciónala con el código y las tablas de SismaSalud.
`;
  }

  // 4. Historial reciente
  const historyText = session.messages
    .reverse()
    .map((m) => `${m.role === 'CONSULTANT' ? 'CONSULTOR' : 'AGENTE'}: ${m.content}`)
    .join('\n\n');

  // 5. Directiva de Plan & Build
  const planDirective = isPlanMode
    ? `
[MODO PLAN & BUILD Y REFINAMIENTO DE PLANES ACTIVADO]
El consultor solicita estructurar o REESTRUCTURAR un PLAN TÉCNICO FORMAL para su posterior ejecución (Build).

REGLAS DE REESTRUCTURACIÓN Y MODIFICACIÓN:
1. Si en el historial reciente ya existe una propuesta de plan y el consultor te solicita cambios, ajustes o correcciones (ej: "no toques tal tabla sino tal otra", "cambia la condición WHERE", "en vez de eliminar marca como inactivo", "ajusta la query", "modifica el archivo X"):
   - Toma en cuenta el plan anterior del historial y las nuevas directivas del consultor.
   - Explica con claridad qué cambios incorporaste respecto a la versión anterior.
   - Devuelve un NUEVO bloque \`\`\`plan reestructurado con la solución corregida.
2. Si propones una acción técnica concreta a ejecutar (script SQL correctivo o modificación de archivo en el entorno), incluye al final un bloque JSON cercado con \`\`\`plan:
\`\`\`plan
{
  "type": "SQL" | "FILE",
  "title": "Título descriptivo de la acción",
  "description": "Qué hace este cambio en el entorno",
  "sql": "Sentencia SQL completa a ejecutar (si es SQL)",
  "filePath": "Ruta relativa del archivo a modificar (si es FILE, ej. CtrlFacturacion.php)",
  "targetContent": "Fragmento exacto a buscar en el archivo",
  "replacementContent": "Nuevo contenido a colocar"
}
\`\`\`
El sistema leerá este bloque y le presentará al consultor el botón interactivo "⚡ Ejecutar Plan (Build)" para aplicarlo en el entorno o editarlo manualmente.
`
    : '';

  // 6. Construir Prompt Técnico Senior
  const fullPrompt = `
[ROL Y DIRECTIVAS]
Eres el AGENTE TÉCNICO SENIOR Y COPILOTO DE SOPORTE INTERNO de SismaSalud.
Estás dialogando DIRECTAMENTE con un CONSULTOR / INGENIERO DE SOPORTE técnico de SismaSalud (personal técnico interno, NO con un cliente final).
Tu objetivo es responder con total profundidad técnica y SIN RESTRICCIONES para ayudar al consultor a solucionar los problemas de los clientes:
- Proporciona consultas SQL exactas (SELECT, UPDATE, INSERT o scripts de diagnóstico/corrección), nombres de tablas (ej. contratos, sis_deta, sis_maes, sis_paci, pagos, sis_menu) y procedimientos almacenados (sp...).
- Proporciona nombres de archivos PHP (ej. CtrlFacturacion.php, ModelFacturacion.php), nombres de funciones, validaciones y líneas de código sugeridas.
- Responde en formato Markdown técnico enriquecido con bloques de código (\\\`\\\`\\\`sql, \\\`\\\`\\\`php, \\\`\\\`\\\`bash), listas y tablas explicativas.
- Explica la causa raíz técnica y la lógica interna de negocio de SismaSalud.
${planDirective}
[ENTORNO SELECCIONADO: ${environmentName}]
${dbInfo}
${contextDetails}
${imagePromptBlock}
${historyText ? `\n[HISTORIAL RECIENTE DEL DIÁLOGO]\n${historyText}\n` : ''}

[CONSULTA TÉCNICA DEL CONSULTOR]
${content || '(El consultor adjuntó una imagen para revisión técnica)'}
`.trim();

  // 7. Obtener respuesta del agente
  let agentResponseText = '';
  if (env.AGENT_MODE === 'mock') {
    agentResponseText = generateTechnicalMockResponse(content, environmentName);
    if (isPlanMode) {
      if (/modifica|ajusta|reestructura|cambia|en vez de/i.test(content)) {
        agentResponseText += `\n\n### Plan de Acción Reestructurado (Build)\n\`\`\`plan\n{\n  "type": "SQL",\n  "title": "Plan Reestructurado: Actualización de ítems en sis_deta",\n  "description": "Ajuste aplicado según las indicaciones del consultor: filtra por estado='P' y recalcula totales.",\n  "sql": "UPDATE sis_deta SET total = cantidad * 15000 WHERE estudio = 12345 AND estado = 'P';"\n}\n\`\`\``;
      } else {
        agentResponseText += `\n\n### Plan de Acción Propuesto (Build)\n\`\`\`plan\n{\n  "type": "SQL",\n  "title": "Corrección de inconsistencia en sis_maes",\n  "description": "Actualiza el total de la factura para que coincida exactamente con los ítems liquidados en sis_deta.",\n  "sql": "UPDATE sis_maes SET vlr_factura = (SELECT ISNULL(SUM(total), 0) FROM sis_deta WHERE estudio = sis_maes.con_estudio) WHERE estado = 'A' AND con_estudio = 12345;"\n}\n\`\`\``;
      }
    }
  } else {
    try {
      agentResponseText = await runStaffAgy(fullPrompt, extraDirs, session.agyConversationId || undefined);
    } catch (agyErr) {
      console.warn('Fallo en llamada a agy CLI para consultor, usando fallback técnico:', agyErr);
      agentResponseText = generateTechnicalMockResponse(content, environmentName);
    }
  }

  // 8. Extraer Acción del Plan si está presente
  let planAction: ProposedPlanAction | null = null;
  const planMatch = agentResponseText.match(/```plan\s*([\s\S]*?)```/i);
  if (planMatch) {
    try {
      const parsed = JSON.parse(planMatch[1].trim());
      planAction = {
        type: parsed.type === 'FILE' ? 'FILE' : 'SQL',
        title: parsed.title || 'Plan de Acción Técnico',
        description: parsed.description || 'Acción ejecutable en el entorno',
        status: 'PROPOSED',
        sql: parsed.sql,
        filePath: parsed.filePath,
        targetContent: parsed.targetContent,
        replacementContent: parsed.replacementContent,
        diff: parsed.diff,
      };
    } catch {}
  } else if (isPlanMode) {
    // Si no hubo bloque ```plan pero hay un bloque SQL con sentencia de actualización
    const sqlMatch = agentResponseText.match(/```sql\s*([\s\S]*?(?:UPDATE|INSERT|DELETE|ALTER)[\s\S]*?)```/i);
    if (sqlMatch) {
      planAction = {
        type: 'SQL',
        title: 'Script SQL Correctivo Propuesto',
        description: 'Sentencia de actualización en la base de datos del entorno seleccionado',
        status: 'PROPOSED',
        sql: sqlMatch[1].trim(),
      };
    }
  }

  // 9. Guardar respuesta del agente
  const agentMessage = await prisma.staffAgentMessage.create({
    data: {
      sessionId,
      role: 'AGENT',
      content: agentResponseText,
      planAction: planAction ? (planAction as any) : undefined,
    },
  });

  // 10. Actualizar título de la sesión si es la primera consulta
  if (session.title === 'Nueva Consulta Técnica' && content.trim()) {
    const autoTitle = content.trim().slice(0, 45) + (content.trim().length > 45 ? '…' : '');
    await prisma.staffAgentSession.update({
      where: { id: sessionId },
      data: { title: autoTitle },
    });
  }

  return {
    consultantMessage: {
      id: consultantMessage.id,
      role: consultantMessage.role,
      content: consultantMessage.content,
      imageUrl: consultantMessage.imageUrl,
      createdAt: consultantMessage.createdAt,
    },
    agentMessage: {
      id: agentMessage.id,
      role: agentMessage.role,
      content: agentMessage.content,
      planAction: (agentMessage.planAction as any) ?? null,
      executionResult: (agentMessage.executionResult as any) ?? null,
      createdAt: agentMessage.createdAt,
    },
  };
}

/**
 * Ejecuta (Build) o descarta un plan técnico propuesto por el agente en el entorno seleccionado.
 */
export async function executeStaffPlanAction(params: {
  sessionId: string;
  messageId: string;
  consultantId: string;
  role?: string;
  decision: 'APPROVE' | 'REJECT';
}) {
  const { sessionId, messageId, consultantId, role, decision } = params;

  const session = await prisma.staffAgentSession.findUnique({
    where: { id: sessionId },
    include: { environment: true },
  });
  if (!session) throw notFound('Sesión no encontrada');
  if (session.consultantId !== consultantId && role !== 'ADMIN') throw forbidden('Acceso denegado');

  const message = await prisma.staffAgentMessage.findUnique({ where: { id: messageId } });
  if (!message) throw notFound('Mensaje no encontrado');
  if (message.sessionId !== sessionId) throw badRequest('El mensaje no pertenece a esta sesión');

  const planAction = message.planAction as ProposedPlanAction | null;
  if (!planAction) throw conflict('Este mensaje no contiene un plan de acción para ejecutar.');

  if (decision === 'REJECT') {
    const updatedPlan: ProposedPlanAction = { ...planAction, status: 'REJECTED' };
    const updated = await prisma.staffAgentMessage.update({
      where: { id: messageId },
      data: { planAction: updatedPlan as any },
    });
    return {
      id: updated.id,
      planAction: updatedPlan,
      executionResult: null,
    };
  }

  const consultant = await prisma.user.findUnique({ where: { id: consultantId } });
  const executedBy = consultant?.name || 'Consultor';

  const executionResult: PlanExecutionResult = {
    success: false,
    message: '',
    executedAt: new Date().toISOString(),
    executedBy,
  };

  try {
    if (planAction.type === 'SQL') {
      if (!planAction.sql) throw new Error('No se especificó la sentencia SQL a ejecutar');

      let pool: sql.ConnectionPool;
      let dbName = '';
      let isLocal = false;

      if (session.environment) {
        pool = await getEnvironmentDbPool(session.environment);
        dbName = session.environment.dbDatabase;
      } else {
        const rawLocal = await getRawLocalEnvironmentConfig();
        dbName = rawLocal.dbDatabase;
        isLocal = true;
        pool = new sql.ConnectionPool({
          server: rawLocal.dbServer,
          port: rawLocal.dbPort,
          database: rawLocal.dbDatabase,
          user: rawLocal.dbUser,
          password: rawLocal.dbPassword,
          connectionTimeout: 5000,
          requestTimeout: 10000,
          options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true,
          },
        });
        await pool.connect();
      }

      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        const req = new sql.Request(transaction);
        const res = await req.query(planAction.sql);
        await transaction.commit();

        executionResult.success = true;
        executionResult.rowsAffected = Array.isArray(res.rowsAffected)
          ? res.rowsAffected.reduce((a, b) => a + b, 0)
          : res.rowsAffected || 1;
        executionResult.message = `Plan SQL ejecutado con éxito en ${dbName} (${executionResult.rowsAffected} registros afectados).`;
      } catch (sqlErr) {
        await transaction.rollback().catch(() => {});
        throw sqlErr;
      } finally {
        if (isLocal) {
          await pool.close().catch(() => {});
        }
      }
    } else if (planAction.type === 'FILE') {
      if (!planAction.filePath) throw new Error('No se especificó el archivo a modificar');

      let sourcePath = '';
      if (session.environment) {
        sourcePath = session.environment.sourcePath;
      } else {
        const rawLocal = await getRawLocalEnvironmentConfig();
        sourcePath = rawLocal.sourcePath;
      }

      const resolvedTarget = path.resolve(sourcePath, planAction.filePath);
      if (!resolvedTarget.startsWith(path.resolve(sourcePath))) {
        throw new Error('Operación denegada: ruta de archivo fuera del entorno permitido.');
      }

      // Respaldo automático antes de modificar
      const originalContent = await fs.readFile(resolvedTarget, 'utf8');
      const backupPath = `${resolvedTarget}.bak-${Date.now()}`;
      await fs.writeFile(backupPath, originalContent, 'utf8');
      executionResult.backupPath = backupPath;

      // Aplicar cambio
      if (planAction.replacementContent) {
        await fs.writeFile(resolvedTarget, planAction.replacementContent, 'utf8');
      } else if (planAction.targetContent && planAction.diff) {
        const updated = originalContent.replace(planAction.targetContent, planAction.diff);
        await fs.writeFile(resolvedTarget, updated, 'utf8');
      }

      executionResult.success = true;
      executionResult.message = `Archivo ${planAction.filePath} modificado correctamente. Respaldo creado en: ${path.basename(backupPath)}`;
    }

    const updatedPlan: ProposedPlanAction = { ...planAction, status: 'EXECUTED' };
    const updated = await prisma.staffAgentMessage.update({
      where: { id: messageId },
      data: {
        planAction: updatedPlan as any,
        executionResult: executionResult as any,
      },
    });

    return {
      id: updated.id,
      planAction: updatedPlan,
      executionResult,
    };
  } catch (error) {
    executionResult.success = false;
    executionResult.message = `Error en ejecución de plan: ${(error as Error).message}`;

    await prisma.staffAgentMessage.update({
      where: { id: messageId },
      data: { executionResult: executionResult as any },
    });

    throw error;
  }
}

/**
 * Permite al consultor modificar directamente los parámetros del plan (título, descripción, query SQL o contenido de archivo).
 */
export async function updateStaffPlanAction(params: {
  sessionId: string;
  messageId: string;
  consultantId: string;
  role?: string;
  title?: string;
  description?: string;
  sql?: string;
  filePath?: string;
  replacementContent?: string;
}) {
  const { sessionId, messageId, consultantId, role, ...updates } = params;

  const session = await prisma.staffAgentSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) throw notFound('Sesión no encontrada');
  if (session.consultantId !== consultantId && role !== 'ADMIN') throw forbidden('Acceso denegado');

  const message = await prisma.staffAgentMessage.findUnique({ where: { id: messageId } });
  if (!message) throw notFound('Mensaje no encontrado');
  if (message.sessionId !== sessionId) throw badRequest('El mensaje no pertenece a esta sesión');

  const currentPlan = message.planAction as ProposedPlanAction | null;
  if (!currentPlan) throw conflict('Este mensaje no contiene un plan de acción para editar.');
  if (currentPlan.status === 'EXECUTED') throw conflict('No se puede editar un plan que ya ha sido ejecutado.');

  const updatedPlan: ProposedPlanAction = {
    ...currentPlan,
    title: updates.title !== undefined ? updates.title : currentPlan.title,
    description: updates.description !== undefined ? updates.description : currentPlan.description,
    sql: updates.sql !== undefined ? updates.sql : currentPlan.sql,
    filePath: updates.filePath !== undefined ? updates.filePath : currentPlan.filePath,
    replacementContent:
      updates.replacementContent !== undefined ? updates.replacementContent : currentPlan.replacementContent,
  };

  const updated = await prisma.staffAgentMessage.update({
    where: { id: messageId },
    data: { planAction: updatedPlan as any },
  });

  return {
    id: updated.id,
    planAction: updatedPlan,
  };
}


