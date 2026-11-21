import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { requireUser } from '../auth/routes';
import { serverRoot } from '../env';
import { badRequest } from '../lib/errors';

const UPLOADS_DIR = path.resolve(serverRoot, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
]);

function getExtension(mimeType: string, originalName?: string): string {
  if (originalName && originalName.includes('.')) {
    const ext = path.extname(originalName).toLowerCase();
    if (ext && ext.length <= 5) return ext;
  }
  switch (mimeType) {
    case 'image/png':
      return '.png';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'image/bmp':
      return '.bmp';
    case 'image/svg+xml':
      return '.svg';
    case 'image/jpeg':
    default:
      return '.jpg';
  }
}

export async function uploadRoutes(app: FastifyInstance) {
  // Soporta tanto multipart/form-data como JSON base64
  app.post('/upload', async (request, reply) => {
    requireUser(request);

    // 1. Caso Multipart
    const isMultipart = request.isMultipart();
    if (isMultipart) {
      const file = await request.file();
      if (!file) throw badRequest('No se recibió ningún archivo');

      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        throw badRequest('Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, WEBP, GIF)');
      }

      const ext = getExtension(file.mimetype, file.filename);
      const filename = `img_${Date.now()}_${randomUUID().slice(0, 8)}${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);

      const buffer = await file.toBuffer();
      await fs.promises.writeFile(filePath, buffer);

      return reply.code(201).send({
        url: `/uploads/${filename}`,
        filename,
      });
    }

    // 2. Caso JSON con base64 (para móviles o clientes que envíen data URI)
    const body = request.body as { base64?: string; mimeType?: string; filename?: string } | undefined;
    if (body?.base64) {
      let rawBase64 = body.base64;
      let mimeType = body.mimeType || 'image/jpeg';

      if (rawBase64.includes(';base64,')) {
        const parts = rawBase64.split(';base64,');
        mimeType = parts[0].replace('data:', '') || mimeType;
        rawBase64 = parts[1];
      }

      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw badRequest('Tipo de archivo no permitido. Solo se permiten imágenes');
      }

      const ext = getExtension(mimeType, body.filename);
      const filename = `img_${Date.now()}_${randomUUID().slice(0, 8)}${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);

      const buffer = Buffer.from(rawBase64, 'base64');
      await fs.promises.writeFile(filePath, buffer);

      return reply.code(201).send({
        url: `/uploads/${filename}`,
        filename,
      });
    }

    throw badRequest('Debes enviar una imagen como multipart/form-data o como base64');
  });
}
