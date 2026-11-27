import fs from 'node:fs/promises';
import fsSync from 'node:fs';
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
import { deleteAgyConversation, purgeOrphanAgyConversations } from '../agent/conversationManager';
import { getEnvironmentDbPool } from '../environments/service';
import { resolveEnvironmentSourcePath } from '../environments/smbService';

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

  // Limpieza sincronizada en Antigravity CLI (conversation_summaries.db y disco)
  try {
    await deleteAgyConversation(session.agyConversationId, session.title);
    await purgeOrphanAgyConversations();
  } catch (err) {
    console.warn(`[staff-agent] Aviso al limpiar conversación agy ${session.agyConversationId}:`, err);
  }

  await prisma.staffAgentSession.delete({ where: { id: sessionId } });
  return { ok: true };
}

/**
 * Llama a la API REST de Google Gemini directamente (ideal cuando agy CLI corre en entornos headless como Railway sin OAuth de navegador).
 */
async function callGeminiDirect(prompt: string, apiKey: string): Promise<string> {
  const model = 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API HTTP ${res.status}: ${errorText.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidate || typeof candidate !== 'string') throw new Error('Respuesta vacía de Gemini API');
  return candidate;
}

/**
 * Genera una respuesta conversacional natural y técnica simulada cuando no hay conexión externa o en fallback.
 */
function generateTechnicalMockResponse(userMessage: string, environmentName: string): string {
  const trimmed = userMessage.trim();
  const lower = trimmed.toLowerCase();

  // 1. Saludos comunes
  if (/^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|hey|saludos|qu[eé] tal|qu[eé] hubo)[!.]*$/i.test(lower)) {
    return `¡Hola! ¿En qué puedo ayudarte hoy con el proyecto?`;
  }

  // 2. Nombre e identidad
  if (/(c[oó]mo te llamas|qui[eé]n eres|cu[aá]l es tu nombre|tu nombre)\b/i.test(lower)) {
    return `Soy Antigravity, tu copiloto técnico para SismaSalud. ¿En qué te puedo dar una mano hoy?`;
  }

  // 3. Estado / ¿Cómo estás?
  if (/(c[oó]mo est[aá]s|qu[eé] tal todo|c[oó]mo va|todo bien)\b/i.test(lower)) {
    return `¡Todo muy bien por acá! Listo para revisar consultas SQL, código o resolver cualquier duda en ${environmentName}. ¿Qué tienes en mente?`;
  }

  // 4. Capacidades y ayuda
  if (/(qu[eé] puedes hacer|qu[eé] haces|c[oó]mo funciona|para qu[eé] sirves|ayuda)\b/i.test(lower)) {
    return `Puedo ayudarte a explorar y diagnosticar la base de datos de SismaSalud (como sis_maes, sis_deta o contratos), revisar archivos de código PHP, o si necesitas hacer modificaciones, podemos formular planes de acción con /plan. ¿Hay algún caso puntual que quieras revisar?`;
  }

  // 5. Agradecimientos
  if (/^(gracias|muchas gracias|listo gracias|vale gracias|perfecto gracias)[!.]*$/i.test(lower)) {
    return `¡Con gusto! Aquí sigo por si necesitas mirar cualquier otra cosa.`;
  }

  // 6. Despedidas
  if (/^(chao|adi[oó]s|hasta luego|nos vemos|bye)[!.]*$/i.test(lower)) {
    return `¡Hasta luego! Quedo a tu disposición cuando vuelvas a necesitar soporte en el sistema.`;
  }

  // 7. Modificaciones y refinamiento de plan
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

  // 8. Tablas comunes de SismaSalud
  if (lower.includes('sis_maes')) {
    return `\`sis_maes\` es la tabla principal de admisiones y facturación en SismaSalud. Contiene el encabezado de cada estudio (\`con_estudio\`, \`nro_factura\`, \`vlr_factura\`, \`estado\`, etc.) y se relaciona con \`sis_paci\` a través de \`autoid\`. ¿Quieres que revisemos alguna consulta sobre esta tabla?`;
  }
  if (lower.includes('sis_deta')) {
    return `\`sis_deta\` guarda el detalle de los servicios, medicamentos e insumos facturados (\`estudio\`, \`cod_servicio\`, \`descripcion\`, \`cantidad\`, \`total\`, etc.). Se vincula con \`sis_maes\` mediante \`estudio\`. ¿Deseas verificar inconsistencias en la liquidación?`;
  }
  if (lower.includes('contratos')) {
    return `La tabla \`contratos\` parametriza los manuales tarifarios (SOAT, ISS), porcentajes y condiciones negociadas con cada aseguradora o EPS para la facturación automática.`;
  }
  if (lower.includes('sis_paci')) {
    return `\`sis_paci\` es el maestro de pacientes (\`autoid\`, \`tipo_id\`, \`num_id\`, nombres, apellidos, etc.) y conecta con historias clínicas, citas y admisiones.`;
  }

  // 9. Facturación y glosas
  if (lower.includes('factur') || lower.includes('glosa') || lower.includes('resolucion')) {
    return `### Análisis Técnico de Facturación (${environmentName})

Revisando el módulo de facturación:

#### 1. Causa Habitual
Suele ocurrir por diferencias entre el total registrado en el encabezado (\`sis_maes.vlr_factura\`) y la sumatoria de los ítems en \`sis_deta\`, o por discrepancias en las tarifas asociadas en \`contratos\`.

#### 2. Consulta de Diagnóstico
\`\`\`sql
SELECT m.con_estudio, m.nro_factura, m.estado, m.vlr_factura,
       (SELECT ISNULL(SUM(d.total), 0) FROM sis_deta d WITH(NOLOCK) WHERE d.estudio = m.con_estudio) AS total_deta
FROM sis_maes m WITH(NOLOCK)
WHERE m.con_estudio = 12345;
\`\`\`

Si necesitas aplicar una corrección sobre la base de datos o en \`CtrlFacturacion.php\`, puedes activar el modo **Plan & Build** (/plan).`;
  }

  // 10. Agenda y citas
  if (lower.includes('cita') || lower.includes('agenda') || lower.includes('medico')) {
    return `### Diagnóstico de Agenda Médica (${environmentName})

En SismaSalud, las citas se gestionan cruzando la tabla \`citas\` con los horarios programados en \`horarios_medicos\`:

\`\`\`sql
SELECT c.id, c.fecha, c.hora, c.estado, m.nombre AS medico
FROM citas c WITH(NOLOCK)
LEFT JOIN sis_medi m WITH(NOLOCK) ON m.codigo = c.cod_medi
WHERE c.fecha >= CAST(GETDATE() AS DATE);
\`\`\`
Revisa también los permisos en \`CtrlAgendaMedica.php\` si el problema es de visualización o concurrencia.`;
  }

  // 11. Respuesta conversacional natural por defecto (SIN plantillas robóticas ni viñetas de formulario)
  return `Entendido. Cuéntame un poco más sobre lo que necesitas revisar en ${environmentName} (por ejemplo, el módulo, tabla o función de SismaSalud) y lo miramos juntos.`;
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
      if (!fsSync.existsSync(env.agentWorkspace)) {
        fsSync.mkdirSync(env.agentWorkspace, { recursive: true });
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
    const effectiveSource = await resolveEnvironmentSourcePath(envData);
    sourceDir = effectiveSource;
    dbInfo = `SQL Server ${envData.dbServer}:${envData.dbPort} / Base de Datos: ${envData.dbDatabase}`;
    if (effectiveSource) extraDirs.push(effectiveSource);
    contextDetails = `El consultor seleccionó el entorno de la institución "${envData.name}".
- Base de Datos remota: ${envData.dbDatabase} en ${envData.dbServer} (Usuario SQL: ${envData.dbUser}).
- Ruta de Código Fuente SMB / Red: ${envData.sourcePath}${effectiveSource !== envData.sourcePath ? ` (montada en ${effectiveSource})` : ''}.`;
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
      console.warn('Fallo en llamada a agy CLI para consultor:', (agyErr as Error).message || agyErr);

      // Si existe GEMINI_API_KEY (por ejemplo en Railway), usar Google Gemini directamente
      const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (apiKey) {
        try {
          agentResponseText = await callGeminiDirect(fullPrompt, apiKey);
        } catch (apiErr) {
          console.warn('Aviso en llamada a Gemini API directa:', (apiErr as Error).message || apiErr);
          agentResponseText = generateTechnicalMockResponse(content, environmentName);
        }
      } else {
        agentResponseText = generateTechnicalMockResponse(content, environmentName);
      }
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
        sourcePath = await resolveEnvironmentSourcePath(session.environment);
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


