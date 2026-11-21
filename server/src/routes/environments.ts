import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, forbidden } from '../lib/errors';
import { requireUser } from '../auth/routes';
import {
  assignUsersToEnvironment,
  createEnvironment,
  deleteEnvironment,
  getEnvironment,
  listEnvironments,
  testDbConnection,
  testSourceConnection,
  updateEnvironment,
} from '../environments/service';
import {
  getLocalEnvironmentConfig,
  updateLocalEnvironmentConfig,
  testLocalDbConnection,
  testLocalSourcePath,
} from '../config/localEnvironment';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest('Revisa los datos enviados', result.error.flatten());
  return result.data;
}

const environmentSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  active: z.boolean().optional(),
  dbServer: z.string().trim().min(1),
  dbPort: z.coerce.number().int().min(1).max(65535).optional(),
  dbDatabase: z.string().trim().min(1),
  dbUser: z.string().trim().min(1),
  dbPassword: z.string().optional(),
  sourceType: z.enum(['SMB_UNC', 'LOCAL_PATH']).optional(),
  sourcePath: z.string().trim().min(1),
  smbUser: z.string().trim().optional(),
  smbPassword: z.string().optional(),
  smbDomain: z.string().trim().optional(),
});

export async function environmentRoutes(app: FastifyInstance) {
  // Listar todos los entornos (Consultores y Admins)
  app.get('/consultant/environments', async (request) => {
    requireUser(request);
    return { environments: await listEnvironments() };
  });

  // Obtener detalle de un entorno con sus usuarios asignados (Solo ADMIN)
  app.get('/consultant/environments/:id', async (request) => {
    const user = requireUser(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede ver el detalle de configuración del entorno');

    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return { environment: await getEnvironment(id) };
  });

  // Crear entorno (Solo ADMIN)
  app.post('/consultant/environments', async (request, reply) => {
    const user = requireUser(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede registrar entornos');

    const body = parse(environmentSchema, request.body);
    const created = await createEnvironment(body);
    return reply.code(201).send({ environment: created });
  });

  // Actualizar entorno (Solo ADMIN)
  app.put('/consultant/environments/:id', async (request) => {
    const user = requireUser(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede modificar entornos');

    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(environmentSchema.partial(), request.body);
    return { environment: await updateEnvironment(id, body) };
  });

  // Eliminar entorno (Solo ADMIN)
  app.delete('/consultant/environments/:id', async (request) => {
    const user = requireUser(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede eliminar entornos');

    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    return deleteEnvironment(id);
  });

  // Asignar usuarios clientes a un entorno (Solo ADMIN)
  app.post('/consultant/environments/:id/assign-users', async (request) => {
    const user = requireUser(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede asignar clientes a entornos');

    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const body = parse(z.object({ userIds: z.array(z.string().uuid()) }), request.body);
    return { environment: await assignUsersToEnvironment(id, body.userIds) };
  });

  // Probar conexión a SQL Server en vivo (Solo ADMIN)
  app.post('/consultant/environments/test-db', async (request) => {
    const user = requireUser(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede probar conexiones de base de datos');

    const body = parse(
      z.object({
        environmentId: z.string().uuid().optional(),
        dbServer: z.string().optional().default(''),
        dbPort: z.coerce.number().optional(),
        dbDatabase: z.string().optional().default(''),
        dbUser: z.string().optional().default(''),
        dbPassword: z.string().optional(),
      }),
      request.body ?? {},
    );

    return testDbConnection(body);
  });

  // Probar acceso a ruta de código fuente (Solo ADMIN)
  app.post('/consultant/environments/test-source', async (request) => {
    const user = requireUser(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede probar rutas de código fuente');

    const body = parse(
      z.object({
        environmentId: z.string().uuid().optional(),
        sourcePath: z.string().optional().default(''),
        sourceType: z.string().optional(),
      }),
      request.body ?? {},
    );

    return testSourceConnection(body);
  });

  // --- Endpoints de Configuración del Entorno Local Base ---

  // Obtener configuración del entorno local (Consultor y Admin)
  app.get('/consultant/local-environment', async (request) => {
    requireUser(request);
    return { localEnvironment: await getLocalEnvironmentConfig() };
  });

  // Modificar configuración del entorno local (Solo ADMIN)
  app.put('/consultant/local-environment', async (request) => {
    const user = requireUser(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede configurar el entorno local');

    const body = parse(
      z.object({
        dbServer: z.string().trim().min(1),
        dbPort: z.coerce.number().int().min(1).max(65535).optional(),
        dbDatabase: z.string().trim().min(1),
        dbUser: z.string().trim().min(1),
        dbPassword: z.string().optional(),
        dbEnabled: z.boolean().optional(),
        sourcePath: z.string().trim().min(1),
      }),
      request.body,
    );

    const updated = await updateLocalEnvironmentConfig(body);
    return { localEnvironment: updated };
  });

  // Probar conexión a la BD SQL Server local (Solo ADMIN)
  app.post('/consultant/local-environment/test-db', async (request) => {
    const user = requireUser(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede probar la conexión local');

    const body = parse(
      z.object({
        dbServer: z.string().optional(),
        dbPort: z.coerce.number().optional(),
        dbDatabase: z.string().optional(),
        dbUser: z.string().optional(),
        dbPassword: z.string().optional(),
        useExistingPassword: z.boolean().optional(),
      }),
      request.body ?? {},
    );

    return testLocalDbConnection(body);
  });

  // Probar acceso a la carpeta de fuentes local (Solo ADMIN)
  app.post('/consultant/local-environment/test-source', async (request) => {
    const user = requireUser(request);
    if (user.role !== 'ADMIN') throw forbidden('Solo un administrador puede probar la ruta local');

    const body = parse(
      z.object({
        sourcePath: z.string().optional(),
      }),
      request.body ?? {},
    );

    return testLocalSourcePath(body.sourcePath);
  });
}
