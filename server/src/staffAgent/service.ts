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
import { deleteAgyConversation } from '../agent/conversationManager';
import { getEnvironmentDbPool } from '../environments/service';

export interface ProposedPlanAction {
  type: 'SQL' | 'FILE';
  title?: string;
  description: string;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  steps?: string[];
  verificationCriteria?: string;
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

  // Limpieza sincronizada en Antigravity CLI si la sesión contenía conversación agy
  if (session.agyConversationId) {
    try {
      await deleteAgyConversation(session.agyConversationId);
    } catch (err) {
      console.warn(`[staff-agent] Aviso al limpiar conversación agy ${session.agyConversationId}:`, err);
    }
  }

  await prisma.staffAgentSession.delete({ where: { id: sessionId } });
  return { ok: true };
}

/**
 * Genera una respuesta técnica realista simulada cuando AGENT_MODE=mock o como fallback.
 */
function generateTechnicalMockResponse(userMessage: string, environmentName: string): string {
  const lower = userMessage.toLowerCase().trim();

  // 1. Saludos y mensajes de cortesía comunes (responder como chat natural)
  const isGreeting = /^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|hey|saludos|qu[eé] tal|qu[eé] hubo)\b/i.test(lower);
  if (isGreeting && lower.split(/\s+/).length <= 6) {
    return `¡Hola! ¿En qué puedo colaborarte hoy?

Estoy listo como tu copiloto técnico para **${environmentName}**. En este modo de consulta libre podemos conversar directamente sobre:
- Estructura y consultas de la base de datos de SismaSalud (\`sis_maes\`, \`sis_deta\`, \`contratos\`, etc.).
- Controladores y lógica PHP de facturación, citas, glosas o historias clínicas.
- Diagnóstico de incidencias o dudas sobre el sistema.

Cuéntame qué caso o módulo deseas revisar.`;
  }

  // 2. Preguntas generales sobre capacidades o rol
  if (/qu[eé] puedes hacer|c[oó]mo funciona|qui[eé]n eres|ayuda/i.test(lower) && lower.split(/\s+/).length <= 8) {
    return `Soy el **Copiloto Técnico de Soporte SismaSalud** (en modo chat interactivo).

Podemos hablar libremente como en una terminal de Antigravity CLI:
1. **Consultas Técnicas**: Hazme cualquier pregunta sobre tablas, flujos de facturación, tarifas SOAT/ISS o código PHP.
2. **Diagnóstico**: Si tienes un número de factura, mensaje de error o captura de pantalla, compártemela para analizarla.
3. **Plan & Build (/plan)**: Si decides aplicar un cambio en la base de datos o en los archivos, activa el modo Plan para estructurarlo, ajustarlo y ejecutarlo con respaldo.

¿Por dónde empezamos?`;
  }

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

  return `### Copiloto Técnico (${environmentName})

He recibido tu mensaje:
> "${userMessage}"

Para asistirte mejor sobre este punto en **${environmentName}**:
- Si deseas diagnosticar un caso o error puntual, indícame el número de estudio, módulo afectado o consulta SQL que estés revisando.
- Si prefieres que analicemos un archivo de código PHP o procedimiento de SismaSalud, compárteme su nombre o función.
- También puedes adjuntar una captura de pantalla del sistema para su inspección técnica.
- Si deseas formular una corrección en base de datos o archivos, recuerda activar el modo **Plan & Build (/plan)** en la cabecera.`;
}

/**
 * Ejecuta un turno del agente técnico sin restricciones usando Antigravity CLI.
 */
async function runStaffAgy(
  prompt: string,
  extraDirs: string[],
  conversationId?: string,
  mode: 'CHAT' | 'PLAN' = 'CHAT',
): Promise<{ text: string; conversationId?: string }> {
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

  if (mode === 'PLAN') {
    args.push('--mode', 'plan');
  }

  if (conversationId) {
    args.push('--conversation', conversationId);
  }

  for (const dir of allDirs) {
    args.push('--add-dir', dir);
  }

  return new Promise<{ text: string; conversationId?: string }>((resolve, reject) => {
    let child: ChildProcess;
    try {
      if (!fs.existsSync(env.agentWorkspace)) {
        fs.mkdirSync(env.agentWorkspace, { recursive: true });
      }
      child = spawn(binary, args, {
        cwd: env.agentWorkspace,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
        },
      });
    } catch (err) {
      reject(err);
      return;
    }

    let resultResponse = '';
    let detectedConversationId = conversationId;
    let accumulatedDelta = '';
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
            if (typeof event.conversation_id === 'string' && event.conversation_id.trim()) {
              detectedConversationId = event.conversation_id.trim();
            } else if (typeof event.conversationId === 'string' && event.conversationId.trim()) {
              detectedConversationId = event.conversationId.trim();
            }

            const eventType = event.event ?? event.type;
            if (eventType === 'step_update') {
              const su = event.step_update && typeof event.step_update === 'object' ? (event.step_update as Record<string, unknown>) : {};
              if (typeof su.text_delta === 'string') {
                accumulatedDelta += su.text_delta;
              }
            } else if (eventType === 'result') {
              const resObj = event.result && typeof event.result === 'object' ? (event.result as Record<string, unknown>) : {};
              if (typeof resObj.response === 'string') {
                resultResponse = resObj.response;
              } else if (typeof event.response === 'string') {
                resultResponse = event.response;
              }
              if (typeof resObj.conversation_id === 'string' && resObj.conversation_id.trim()) {
                detectedConversationId = resObj.conversation_id.trim();
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
      const chosenText = resultResponse.trim() || accumulatedDelta.trim();
      if (chosenText) {
        resolve({ text: chosenText, conversationId: detectedConversationId });
      } else {
        // Si no capturó evento result pero terminó bien o con buffer
        if (buffer.trim()) {
          try {
            const last = JSON.parse(buffer.trim());
            if (last.response) {
              return resolve({ text: last.response, conversationId: detectedConversationId });
            }
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
[MODO PLAN & BUILD Y REFINAMIENTO DE PLANES ACTIVADO (/plan)]
El consultor solicita estructurar o REESTRUCTURAR un PLAN TÉCNICO FORMAL para su posterior aprobación y ejecución (Build).

REGLAS DE FORMULACIÓN Y REESTRUCTURACIÓN:
1. Si en el historial reciente ya existe una propuesta de plan y el consultor te solicita cambios, ajustes o directivas:
   - Toma en cuenta el plan anterior del historial y las nuevas observaciones del consultor.
   - Explica con claridad qué cambios y mejoras incorporaste respecto a la versión anterior.
   - Devuelve un NUEVO bloque \`\`\`plan reestructurado con la solución corregida.
2. Todo plan debe incluir:
   - "title": Título claro y profesional del plan de acción.
   - "description": Explicación resumida de la estrategia técnica.
   - "steps": Arreglo de cadenas con los pasos ordenados de ejecución (ej. ["1. Validar registros en sis_deta", "2. Aplicar recálculo de factura", "3. Verificar coherencia de saldos"]).
   - "verificationCriteria": Criterio específico para comprobar que el cambio quedó aplicado exitosamente.
   - "type": "SQL" o "FILE" según corresponda.
   - "sql": Sentencia SQL completa (si es SQL).
   - "filePath": Ruta relativa del archivo a modificar (si es FILE, ej. CtrlFacturacion.php).
   - "targetContent": Fragmento exacto a buscar en el archivo.
   - "replacementContent": Nuevo código a colocar.
3. Estructura el bloque al final en formato JSON exacto:
\`\`\`plan
{
  "type": "SQL",
  "title": "Corrección de saldos en facturación sis_maes",
  "description": "Recalcula y sincroniza el total de la factura con los ítems liquidados en sis_deta.",
  "steps": [
    "Comprobar ítems en estado facturado en sis_deta",
    "Ejecutar recálculo sobre sis_maes para el estudio indicado",
    "Verificar que el saldo pendiente coincida con el total menos abonos"
  ],
  "verificationCriteria": "El campo vlr_factura en sis_maes debe ser igual a la sumatoria de sis_deta.total.",
  "sql": "UPDATE sis_maes SET vlr_factura = (SELECT ISNULL(SUM(total), 0) FROM sis_deta WHERE estudio = sis_maes.con_estudio) WHERE estado = 'A' AND con_estudio = 12345;"
}
\`\`\`
El sistema leerá este bloque y le presentará al consultor los controles para modificar el plan y el botón interactivo "⚡ Build (Aprobar y Ejecutar)" para aplicarlo en el entorno con respaldo de seguridad.
`
    : `
[MODO CONSULTA LIBRE (CHAT INTERACTIVO ESTILO ANTIGRAVITY)]
Estás en una sesión de diálogo técnico interactivo y libre con un consultor/ingeniero de SismaSalud (como una conversación normal en Antigravity CLI):
- Comunícate de manera natural, conversacional, amigable y profesional.
- Si el consultor solo te saluda (ej. "Hola", "Buenas", "¿Qué tal?"), salúdalo amablemente de forma breve y pregúntale en qué caso, módulo o situación van a trabajar hoy. NO generes diagnósticos rígidos ni consultas SQL cuando el usuario solo te está saludando o haciendo charla inicial.
- Ofrece tu conocimiento técnico profundo en SismaSalud (tablas sis_*, controladores PHP, facturación, citas, glosas, etc.) cuando el usuario plantee una pregunta técnica, describa un problema o solicite una consulta/código.
- Mantén un tono fluido de colega de ingeniería senior: claro, conciso, directo y útil.
- NO generes bloques \`\`\`plan a menos que el usuario active explícitamente el modo Plan o pida estructurar un plan de acción.
`;

  // 6. Construir Prompt Técnico Senior
  const fullPrompt = `
[ROL Y DIRECTIVAS]
Eres el COPILOTO TÉCNICO de SismaSalud. Estás dialogando DIRECTAMENTE con un CONSULTOR o INGENIERO DE SOPORTE técnico de SismaSalud en un chat interactivo.
${planDirective}
[ENTORNO SELECCIONADO: ${environmentName}]
${dbInfo}
${contextDetails}
${imagePromptBlock}
${historyText ? `\n[HISTORIAL RECIENTE DEL DIÁLOGO]\n${historyText}\n` : ''}

[MENSAJE DEL CONSULTOR]
${content || '(El consultor adjuntó una imagen para revisión técnica)'}
`.trim();

  // 7. Obtener respuesta del agente
  let agentResponseText = '';
  if (env.AGENT_MODE === 'mock') {
    agentResponseText = generateTechnicalMockResponse(content, environmentName);
    if (isPlanMode) {
      if (/modifica|ajusta|reestructura|cambia|en vez de/i.test(content)) {
        agentResponseText += `\n\n### Plan de Acción Reestructurado (Build)\n\`\`\`plan\n{\n  "type": "SQL",\n  "title": "Plan Reestructurado: Actualización de ítems en sis_deta",\n  "description": "Ajuste aplicado según las indicaciones del consultor: filtra por estado='P' y recalcula totales.",\n  "steps": [\n    "Identificar registros en sis_deta con estado 'P'",\n    "Cruzar con contratos vigentes para obtener manual SOAT",\n    "Actualizar totales y verificar integridad referencial"\n  ],\n  "verificationCriteria": "Verificar en sis_deta que ningún registro con estado 'P' mantenga valor en cero.",\n  "sql": "UPDATE sis_deta SET total = cantidad * (SELECT TOP 1 manual_soat FROM contratos WHERE codigo = sis_deta.cod_servicio) WHERE estudio = 12345 AND estado = 'P';"\n}\n\`\`\``;
      } else {
        agentResponseText += `\n\n### Plan de Acción Propuesto (Build)\n\`\`\`plan\n{\n  "type": "SQL",\n  "title": "Corrección de inconsistencia en sis_maes",\n  "description": "Actualiza el total de la factura para que coincida exactamente con los ítems liquidados en sis_deta.",\n  "steps": [\n    "Calcular sumatoria real de servicios facturados en sis_deta",\n    "Actualizar encabezado en sis_maes con monto recalculado",\n    "Confirmar balance contable con copagos y descuentos aplicados"\n  ],\n  "verificationCriteria": "El campo vlr_factura en sis_maes debe coincidir con la sumatoria de sis_deta.total para el estudio 12345.",\n  "sql": "UPDATE sis_maes SET vlr_factura = (SELECT ISNULL(SUM(total), 0) FROM sis_deta WHERE estudio = sis_maes.con_estudio) WHERE estado = 'A' AND con_estudio = 12345;"\n}\n\`\`\``;
      }
    }
  } else {
    try {
      const agyResult = await runStaffAgy(
        fullPrompt,
        extraDirs,
        session.agyConversationId || undefined,
        isPlanMode ? 'PLAN' : 'CHAT',
      );
      agentResponseText = agyResult.text;
      if (agyResult.conversationId && agyResult.conversationId !== session.agyConversationId) {
        await prisma.staffAgentSession.update({
          where: { id: sessionId },
          data: { agyConversationId: agyResult.conversationId },
        });
      }
    } catch (agyErr) {
      console.warn('Fallo en llamada a agy CLI para consultor, usando fallback técnico:', (agyErr as Error).message || agyErr);
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
        steps: Array.isArray(parsed.steps) ? parsed.steps.map(String) : undefined,
        verificationCriteria: typeof parsed.verificationCriteria === 'string' ? parsed.verificationCriteria : undefined,
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
        steps: [
          'Revisar las filas que cumplen la condición de actualización',
          'Ejecutar script SQL correctivo',
          'Validar filas afectadas',
        ],
        verificationCriteria: 'Validar que las filas afectadas cumplan la nueva condición',
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
  steps?: string[];
  verificationCriteria?: string;
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
    steps: updates.steps !== undefined ? updates.steps : currentPlan.steps,
    verificationCriteria:
      updates.verificationCriteria !== undefined ? updates.verificationCriteria : currentPlan.verificationCriteria,
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


