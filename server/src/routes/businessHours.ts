import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, forbidden } from '../lib/errors';
import { requireUser } from '../auth/routes';
import {
  checkBusinessHoursStatus,
  getBusinessHoursConfig,
  updateBusinessHoursConfig,
} from '../businessHours/service';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest('Revisa los datos enviados', result.error.flatten());
  return result.data;
}

const updateBusinessHoursSchema = z.object({
  enabled: z.boolean().optional(),
  timezone: z.string().trim().min(2).max(100).optional(),
  daysEnabled: z.array(z.number().int().min(0).max(6)).optional(),
  startHour: z.number().int().min(0).max(23).optional(),
  startMinute: z.number().int().min(0).max(59).optional(),
  endHour: z.number().int().min(0).max(23).optional(),
  endMinute: z.number().int().min(0).max(59).optional(),
  customMessage: z.string().trim().max(1000).optional(),
});

export async function businessHoursRoutes(app: FastifyInstance) {
  // Estado actual del horario (Disponible para móviles y web)
  app.get('/business-hours', async () => {
    const status = await checkBusinessHoursStatus();
    return { status };
  });

  // Configuración completa y estado actual (Personal técnico)
  app.get('/consultant/business-hours', async (request) => {
    requireUser(request);
    const config = await getBusinessHoursConfig();
    const status = await checkBusinessHoursStatus();
    return { config, status };
  });

  // Modificar horario de atención (Solo Administrador)
  app.put('/consultant/business-hours', async (request) => {
    const user = requireUser(request);
    if (user.role !== 'ADMIN') {
      throw forbidden('Solo un administrador puede configurar el horario de atención');
    }

    const body = parse(updateBusinessHoursSchema, request.body);
    const updated = await updateBusinessHoursConfig(body);
    const status = await checkBusinessHoursStatus();
    return { config: updated, status };
  });
}
