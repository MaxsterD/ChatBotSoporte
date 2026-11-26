import fs from 'node:fs';
import path from 'node:path';

/**
 * Elimina una conversación de Antigravity CLI tanto a través del Language Server API
 * como de la estructura de almacenamiento local en disco (~/.gemini/antigravity-cli).
 */
export async function deleteAgyConversation(conversationId?: string | null): Promise<boolean> {
  if (!conversationId || typeof conversationId !== 'string') return true;

  const trimmedId = conversationId.trim();
  if (!trimmedId) return true;

  let deletedFromApi = false;
  let deletedFromDisk = false;

  // 1. Eliminar vía ConversationService Connect HTTP si el Language Server de Antigravity está activo
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
      // Si el Language Server no está en ejecución en este proceso, continúa con la limpieza de disco
    }
  }

  // 2. Limpieza directa en el almacenamiento local de Antigravity CLI
  const homeDir = process.env.USERPROFILE || process.env.HOME || '/root';
  const rawCandidateDirs = [
    path.join(homeDir, '.gemini', 'antigravity-cli'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'agy') : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'antigravity-cli') : null,
  ];
  const candidateBaseDirs = rawCandidateDirs.filter((dir): dir is string => Boolean(dir) && fs.existsSync(dir!));

  for (const baseDir of candidateBaseDirs) {
    const brainDir = path.join(baseDir, 'brain', trimmedId);
    const annotationFile = path.join(baseDir, 'annotations', `${trimmedId}.pbtxt`);
    const presenceLock = path.join(baseDir, 'presence', `${trimmedId}.lock`);
    const conversationDir = path.join(baseDir, 'conversations', trimmedId);

    try {
      if (fs.existsSync(brainDir)) {
        await fs.promises.rm(brainDir, { recursive: true, force: true });
        deletedFromDisk = true;
      }
      if (fs.existsSync(annotationFile)) {
        await fs.promises.rm(annotationFile, { force: true });
        deletedFromDisk = true;
      }
      if (fs.existsSync(presenceLock)) {
        await fs.promises.rm(presenceLock, { force: true });
      }
      if (fs.existsSync(conversationDir)) {
        await fs.promises.rm(conversationDir, { recursive: true, force: true });
        deletedFromDisk = true;
      }
    } catch (err) {
      console.warn(`[agy-clean] Aviso al limpiar archivos para conversación ${trimmedId}:`, err);
    }
  }

  return deletedFromApi || deletedFromDisk;
}
