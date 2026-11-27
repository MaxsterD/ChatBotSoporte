import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decryptCredential } from '../lib/crypto';

const execAsync = promisify(exec);

export function isUncPath(targetPath: string): boolean {
  const trimmed = targetPath.trim();
  return trimmed.startsWith('\\\\') || trimmed.startsWith('//');
}

export function parseUncPath(unc: string): {
  server: string;
  share: string;
  subpath: string;
  linuxUnc: string;
} {
  const normalized = unc.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  const server = parts[0] || '';
  const share = parts[1] || '';
  const subpath = parts.slice(2).join('/');
  const linuxUnc = `//${server}/${share}`;
  return { server, share, subpath, linuxUnc };
}

export async function isMounted(mountPoint: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`mountpoint -q "${mountPoint}" && echo "yes" || echo "no"`);
    return stdout.trim() === 'yes';
  } catch {
    return false;
  }
}

export async function unmountSmbShare(mountPoint: string): Promise<void> {
  if (process.platform !== 'linux') return;
  try {
    const mounted = await isMounted(mountPoint);
    if (mounted) {
      await execAsync(`sudo umount -l "${mountPoint}" || true`);
    }
  } catch {
    // Ignore error on unmount
  }
}

/**
 * Resuelve la ruta efectiva de acceso al código fuente para el entorno del cliente.
 * En Windows devuelve la ruta tal cual (UNC o local).
 * En Linux monta automáticamente el recurso SMB vía CIFS en /mnt/smb_sources/<id>.
 */
export async function resolveEnvironmentSourcePath(env: {
  id: string;
  sourcePath: string;
  sourceType?: string | null;
  smbUser?: string | null;
  smbPasswordEncrypted?: string | null;
  smbDomain?: string | null;
}): Promise<string> {
  const target = env.sourcePath.trim();
  const isSmb = env.sourceType === 'SMB_UNC' || isUncPath(target);

  if (!isSmb || process.platform !== 'linux') {
    return target;
  }

  const parsed = parseUncPath(target);
  if (!parsed.server || !parsed.share) {
    return target;
  }

  const mountPoint = path.posix.join('/mnt/smb_sources', env.id);

  try {
    const alreadyMounted = await isMounted(mountPoint);
    if (!alreadyMounted) {
      await execAsync(`sudo mkdir -p "${mountPoint}"`);
      const password = env.smbPasswordEncrypted ? decryptCredential(env.smbPasswordEncrypted) : '';
      const user = env.smbUser?.trim() || 'guest';
      const domain = env.smbDomain?.trim() ? `,domain=${env.smbDomain.trim()}` : '';

      // Montaje con cifs en modo lectura/escritura (rw) para soportar el modo Plan & Build
      const opts = `username=${user},password=${password}${domain},iocharset=utf8,rw,file_mode=0775,dir_mode=0775,uid=1000,gid=1000`;
      await execAsync(`sudo mount -t cifs "${parsed.linuxUnc}" "${mountPoint}" -o "${opts}"`);
    }

    return parsed.subpath ? path.posix.join(mountPoint, parsed.subpath) : mountPoint;
  } catch (error) {
    console.error(`[smbService] Error al montar recurso ${parsed.linuxUnc} en ${mountPoint}:`, (error as Error).message);
    return target;
  }
}

/**
 * Prueba la conectividad y lectura de un recurso de código fuente (local o SMB/UNC).
 */
export async function testSourcePathAccess(params: {
  sourcePath: string;
  sourceType?: string;
  environmentId?: string;
  smbUser?: string;
  smbPassword?: string;
  smbDomain?: string;
}): Promise<{
  success: boolean;
  totalEntries?: number;
  sampleFiles?: string[];
  message: string;
  error?: string;
}> {
  const targetPath = params.sourcePath.trim();
  const isSmb = params.sourceType === 'SMB_UNC' || isUncPath(targetPath);

  // Si estamos en Linux y el recurso es SMB / Red
  if (process.platform === 'linux' && isSmb) {
    const parsed = parseUncPath(targetPath);
    if (!parsed.server || !parsed.share) {
      return {
        success: false,
        error: 'Ruta SMB inválida',
        message: `La ruta "${targetPath}" no tiene formato UNC válido (ejemplo: \\\\10.120.1.5\\SismaSalud).`,
      };
    }

    const mountId = params.environmentId || `temp_test_${Date.now()}`;
    const mountPoint = path.posix.join('/mnt/smb_sources', mountId);

    try {
      const alreadyMounted = await isMounted(mountPoint);
      if (!alreadyMounted) {
        await execAsync(`sudo mkdir -p "${mountPoint}"`);
        const user = params.smbUser?.trim() || 'guest';
        const pass = params.smbPassword || '';
        const domain = params.smbDomain?.trim() ? `,domain=${params.smbDomain.trim()}` : '';
        const opts = `username=${user},password=${pass}${domain},iocharset=utf8,ro`;
        await execAsync(`sudo mount -t cifs "${parsed.linuxUnc}" "${mountPoint}" -o "${opts}"`);
      }

      const effectivePath = parsed.subpath ? path.posix.join(mountPoint, parsed.subpath) : mountPoint;
      const stat = await fs.stat(effectivePath);
      if (!stat.isDirectory()) {
        return {
          success: false,
          error: 'La ruta existe pero no es un directorio',
          message: `La ruta "${targetPath}" existe pero no es un directorio válido.`,
        };
      }

      const entries = await fs.readdir(effectivePath, { withFileTypes: true });
      const sampleFiles = entries.slice(0, 10).map((e) => `${e.name}${e.isDirectory() ? '/' : ''}`);

      return {
        success: true,
        totalEntries: entries.length,
        sampleFiles,
        message: `Ruta SMB conectada y montada exitosamente en el servidor. Se encontraron ${entries.length} elementos en el directorio.`,
      };
    } catch (error) {
      // Si el montaje CIFS falla, intentar obtener diagnóstico exacto mediante smbclient
      try {
        const user = params.smbUser?.trim() || 'guest';
        const pass = params.smbPassword || '';
        const domain = params.smbDomain?.trim();
        const userArg = domain ? `${domain}\\${user}%${pass}` : `${user}%${pass}`;
        const { stdout } = await execAsync(`smbclient "${parsed.linuxUnc}" -U "${userArg}" -c "ls"`);
        const lines = stdout.split('\n').filter((l) => l.trim().length > 0 && !l.includes('blocks of size'));
        return {
          success: true,
          totalEntries: lines.length,
          sampleFiles: lines.slice(0, 8).map((l) => l.trim().split(/\s+/)[0]),
          message: `Conexión SMB verificada vía smbclient hacia ${parsed.linuxUnc}.`,
        };
      } catch (smbErr) {
        const errMsg = (error as Error).message;
        return {
          success: false,
          error: errMsg,
          message: `No se pudo acceder al recurso SMB "${targetPath}": ${errMsg}`,
        };
      }
    }
  }

  // Comportamiento local / Windows
  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isDirectory()) {
      return {
        success: false,
        error: 'La ruta existe pero no es un directorio',
        message: `La ruta "${targetPath}" no es un directorio válido.`,
      };
    }

    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const sampleFiles = entries.slice(0, 10).map((e) => `${e.name}${e.isDirectory() ? '/' : ''}`);

    return {
      success: true,
      totalEntries: entries.length,
      sampleFiles,
      message: `Ruta accesible. Se encontraron ${entries.length} elementos en el directorio.`,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      message: `No se pudo acceder a la ruta de fuentes: ${(error as Error).message}`,
    };
  }
}
