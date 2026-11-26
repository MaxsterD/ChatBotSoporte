import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../db';

/**
 * Obtiene dinámicamente las rutas base candidatas donde Antigravity CLI almacena datos
 * (~/.gemini/antigravity-cli, /root/.gemini/antigravity-cli, etc.).
 */
export function getAgyBaseDirs(): string[] {
  const homeDir = process.env.USERPROFILE || process.env.HOME || '/root';
  const rawCandidateDirs = [
    path.join(homeDir, '.gemini', 'antigravity-cli'),
    '/root/.gemini/antigravity-cli',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'agy') : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'antigravity-cli') : null,
  ];
  return Array.from(
    new Set(rawCandidateDirs.filter((dir): dir is string => Boolean(dir) && fs.existsSync(dir!))),
  );
}

/**
 * Carga de forma segura el driver nativo DatabaseSync de Node.js (Node 22+)
 */
async function getSqliteDatabaseSync() {
  try {
    // @ts-ignore
    const sqliteMod = await import('node:sqlite');
    return sqliteMod.DatabaseSync;
  } catch {
    return null;
  }
}

/**
 * Elimina una conversación de Antigravity CLI tanto a través del Language Server API
 * como de la base de datos de resúmenes (conversation_summaries.db) y archivos en disco.
 * Esto asegura que ya no aparezca en /resume ni en el historial del CLI.
 */
export async function deleteAgyConversation(
  conversationId?: string | null,
  title?: string | null,
): Promise<boolean> {
  const trimmedId = conversationId?.trim();
  const trimmedTitle = title?.trim();

  if (!trimmedId && !trimmedTitle) return true;

  let deletedFromApi = false;
  let deletedFromDisk = false;

  // 1. Eliminar vía ConversationService Connect HTTP si el Language Server de Antigravity está activo
  if (trimmedId) {
    const lsAddress = process.env.ANTIGRAVITY_LS_ADDRESS;
    if (lsAddress) {
      try {
        const response = await fetch(`http://${lsAddress}/product.v1.ConversationService/DeleteConversation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Connect-Protocol-Version': '1',
            'x-antigravity-csrf-token': process.env.ANTIGRAVITY_CSRF_TOKEN || '',
          },
          body: JSON.stringify({ conversationId: trimmedId }),
        });
        deletedFromApi = response.ok;
      } catch {
        // Fallback a limpieza en disco
      }
    }
  }

  // 2. Limpieza directa en el almacenamiento local de Antigravity CLI
  const candidateBaseDirs = getAgyBaseDirs();
  const DatabaseSync = await getSqliteDatabaseSync();

  for (const baseDir of candidateBaseDirs) {
    const targetIds = new Set<string>();
    if (trimmedId) targetIds.add(trimmedId);

    // 2a. Limpiar en conversation_summaries.db (la tabla SQLite que consulta agy /resume)
    const summariesDbPath = path.join(baseDir, 'conversation_summaries.db');
    if (fs.existsSync(summariesDbPath) && DatabaseSync) {
      try {
        const db = new DatabaseSync(summariesDbPath);

        // Si tenemos el conversationId exacto
        if (trimmedId) {
          db.prepare('DELETE FROM conversation_summaries WHERE conversation_id = ?').run(trimmedId);
          try { db.prepare('DELETE FROM conversations_fts WHERE conversation_id = ?').run(trimmedId); } catch {}
          try { db.prepare('DELETE FROM conversation_parents WHERE conversation_id = ? OR parent_id = ?').run(trimmedId, trimmedId); } catch {}
          deletedFromDisk = true;
        }

        // Si tenemos título válido (no genérico), buscar posibles conversaciones en agy que coincidan
        if (trimmedTitle && trimmedTitle !== 'Nueva Consulta Técnica' && trimmedTitle !== 'Consulta General') {
          try {
            const matches = db.prepare('SELECT conversation_id FROM conversation_summaries WHERE title = ?').all(trimmedTitle) as Array<{ conversation_id: string }>;
            for (const m of matches) {
              if (m.conversation_id) {
                targetIds.add(m.conversation_id);
                db.prepare('DELETE FROM conversation_summaries WHERE conversation_id = ?').run(m.conversation_id);
                try { db.prepare('DELETE FROM conversations_fts WHERE conversation_id = ?').run(m.conversation_id); } catch {}
                try { db.prepare('DELETE FROM conversation_parents WHERE conversation_id = ? OR parent_id = ?').run(m.conversation_id, m.conversation_id); } catch {}
                deletedFromDisk = true;
              }
            }
          } catch {}
        }

        db.close();
      } catch (dbErr) {
        console.warn(`[agy-clean] Aviso al manipular ${summariesDbPath}:`, dbErr);
      }
    }

    // 2b. Eliminar archivos y carpetas asociadas a cada ID encontrado
    for (const cid of targetIds) {
      // Directorio brain
      const brainDir = path.join(baseDir, 'brain', cid);
      if (fs.existsSync(brainDir)) {
        await fs.promises.rm(brainDir, { recursive: true, force: true }).catch(() => {});
        deletedFromDisk = true;
      }

      // Archivo de anotaciones .pbtxt
      const annotationFile = path.join(baseDir, 'annotations', `${cid}.pbtxt`);
      if (fs.existsSync(annotationFile)) {
        await fs.promises.rm(annotationFile, { force: true }).catch(() => {});
        deletedFromDisk = true;
      }

      // Bloqueo de presencia .lock
      const presenceLock = path.join(baseDir, 'presence', `${cid}.lock`);
      if (fs.existsSync(presenceLock)) {
        await fs.promises.rm(presenceLock, { force: true }).catch(() => {});
      }

      // Carpeta de conversaciones o archivos .db (conversations/<id>.db, .db-wal, .db-shm)
      const convFolder = path.join(baseDir, 'conversations', cid);
      if (fs.existsSync(convFolder)) {
        await fs.promises.rm(convFolder, { recursive: true, force: true }).catch(() => {});
        deletedFromDisk = true;
      }

      for (const ext of ['', '-wal', '-shm']) {
        const convDbFile = path.join(baseDir, 'conversations', `${cid}.db${ext}`);
        if (fs.existsSync(convDbFile)) {
          await fs.promises.rm(convDbFile, { force: true }).catch(() => {});
          deletedFromDisk = true;
        }
      }
    }

    // 2c. Limpiar registros de history.jsonl
    const histPath = path.join(baseDir, 'history.jsonl');
    if (fs.existsSync(histPath) && targetIds.size > 0) {
      try {
        const rawContent = await fs.promises.readFile(histPath, 'utf8');
        const filtered = rawContent
          .split('\n')
          .filter((line) => {
            if (!line.trim()) return false;
            for (const cid of targetIds) {
              if (line.includes(cid)) return false;
            }
            return true;
          })
          .join('\n');
        await fs.promises.writeFile(histPath, filtered + (filtered ? '\n' : ''), 'utf8');
      } catch {}
    }
  }

  return deletedFromApi || deletedFromDisk;
}

/**
 * Purga de conversation_summaries.db y del disco cualquier conversación que ya no
 * exista en la base de datos de chatbotsoporte (ideal para limpiar las que se borraron
 * previamente en Railway o localmente y que aún aparecían en /resume).
 */
export async function purgeOrphanAgyConversations(): Promise<number> {
  const candidateBaseDirs = getAgyBaseDirs();
  const DatabaseSync = await getSqliteDatabaseSync();

  if (!DatabaseSync || candidateBaseDirs.length === 0) return 0;

  // 1. Obtener todos los IDs de conversación válidos actualmente en la BD
  let activeIds = new Set<string>();
  try {
    const [activeChats, activeStaffSessions] = await Promise.all([
      prisma.chat.findMany({
        where: { agyConversationId: { not: null } },
        select: { agyConversationId: true },
      }),
      prisma.staffAgentSession.findMany({
        where: { agyConversationId: { not: null } },
        select: { agyConversationId: true },
      }),
    ]);

    activeIds = new Set<string>([
      ...activeChats.map((c) => c.agyConversationId!).filter(Boolean),
      ...activeStaffSessions.map((s) => s.agyConversationId!).filter(Boolean),
    ]);
  } catch (err) {
    console.warn('[agy-clean] No se pudieron leer IDs activos de Prisma para purga:', err);
    return 0;
  }

  let totalPurged = 0;

  for (const baseDir of candidateBaseDirs) {
    const summariesDbPath = path.join(baseDir, 'conversation_summaries.db');
    if (!fs.existsSync(summariesDbPath)) continue;

    try {
      const db = new DatabaseSync(summariesDbPath);
      const rows = db.prepare('SELECT conversation_id, title, workspace_uris FROM conversation_summaries').all() as Array<{
        conversation_id: string;
        title: string;
        workspace_uris: string;
      }>;

      const orphanIds: string[] = [];
      const isCloudEnv = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.DYNO);

      for (const row of rows) {
        if (!row.conversation_id) continue;
        // Si no está registrado en los chats activos de la base de datos:
        if (!activeIds.has(row.conversation_id)) {
          // En Railway todo lo que esté en este contenedor pertenece a esta app
          const belongsToApp =
            isCloudEnv ||
            row.workspace_uris.includes('/app') ||
            row.workspace_uris.includes('chatbotsoporte') ||
            row.workspace_uris.includes('default-cli-project');

          if (belongsToApp) {
            orphanIds.push(row.conversation_id);
          }
        }
      }

      for (const orphanId of orphanIds) {
        db.prepare('DELETE FROM conversation_summaries WHERE conversation_id = ?').run(orphanId);
        try { db.prepare('DELETE FROM conversations_fts WHERE conversation_id = ?').run(orphanId); } catch {}
        try { db.prepare('DELETE FROM conversation_parents WHERE conversation_id = ? OR parent_id = ?').run(orphanId, orphanId); } catch {}
        totalPurged++;

        // Eliminar archivos del huérfano
        const brainDir = path.join(baseDir, 'brain', orphanId);
        if (fs.existsSync(brainDir)) await fs.promises.rm(brainDir, { recursive: true, force: true }).catch(() => {});
        const annotationFile = path.join(baseDir, 'annotations', `${orphanId}.pbtxt`);
        if (fs.existsSync(annotationFile)) await fs.promises.rm(annotationFile, { force: true }).catch(() => {});
        for (const ext of ['', '-wal', '-shm']) {
          const convDbFile = path.join(baseDir, 'conversations', `${orphanId}.db${ext}`);
          if (fs.existsSync(convDbFile)) await fs.promises.rm(convDbFile, { force: true }).catch(() => {});
        }
      }

      db.close();
    } catch (err) {
      console.warn(`[agy-clean] Error al purgar huérfanos en ${summariesDbPath}:`, err);
    }
  }

  return totalPurged;
}
