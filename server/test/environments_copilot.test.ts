import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { prisma } from '../src/db';
import {
  createEnvironment,
  deleteEnvironment,
  getEnvironment,
  listEnvironments,
  assignUsersToEnvironment,
  testSourceConnection,
} from '../src/environments/service';
import { executeProposedAction, getOrInitCopilot, sendCopilotMessage } from '../src/copilot/service';
import { listClients, updateClientEnvironment, deleteChat } from '../src/chats/service';
import {
  getLocalEnvironmentConfig,
  updateLocalEnvironmentConfig,
  testLocalSourcePath,
} from '../src/config/localEnvironment';
import {
  createStaffSession,
  getStaffSession,
  listStaffSessions,
  sendStaffMessage,
  updateStaffSessionEnvironment,
  deleteStaffSession,
  executeStaffPlanAction,
  updateStaffPlanAction,
} from '../src/staffAgent/service';
import { deleteAgyConversation } from '../src/agent/conversationManager';
import { env } from '../src/env';

test('Gestión de Entornos de Cliente y Copiloto IA', async (t) => {
  env.AGENT_MODE = 'mock';
  // Crear directorio temporal simulando el código fuente SMB
  const tmpSourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sisma_fuentes_test_'));
  const testPhpFile = path.join(tmpSourceDir, 'CtrlFacturacion.php');
  await fs.writeFile(testPhpFile, '<?php echo "SismaSalud v1.0 original"; ?>', 'utf8');

  let testEnvId = '';
  let testUserId = '';
  let testChatId = '';

  t.after(async () => {
    // Limpieza de datos temporales
    if (testChatId) {
      await prisma.chat.deleteMany({ where: { id: testChatId } });
    }
    if (testUserId) {
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }
    if (testEnvId) {
      await prisma.clientEnvironment.deleteMany({ where: { id: testEnvId } });
    }
    await fs.rm(tmpSourceDir, { recursive: true, force: true }).catch(() => {});
  });

  const testEnvName = `Clínica Santa María Test ${Date.now()}`;

  await t.test('1. Crea un entorno con contraseñas cifradas y fuentes locales/SMB', async () => {
    // Limpiar posibles residuos con nombres similares
    await prisma.clientEnvironment.deleteMany({ where: { name: { startsWith: 'Clínica Santa María Test' } } }).catch(() => {});

    const env = await createEnvironment({
      name: testEnvName,
      description: 'Entorno de pruebas automatizadas',
      dbServer: '127.0.0.1',
      dbPort: 1433,
      dbDatabase: 'SismaSalud_Testing',
      dbUser: 'soporte',
      dbPassword: 'PasswordSegura2026',
      sourceType: 'LOCAL_PATH',
      sourcePath: tmpSourceDir,
      smbUser: 'admin',
      smbPassword: 'SmbPassword123',
    });

    testEnvId = env.id;
    assert.ok(env.id);
    assert.equal(env.name, testEnvName);
    assert.equal(env.dbDatabase, 'SismaSalud_Testing');

    // Verificar en BD que la contraseña esté cifrada y no en texto plano
    const raw = await prisma.clientEnvironment.findUnique({ where: { id: env.id } });
    assert.notEqual(raw?.dbPasswordEncrypted, 'PasswordSegura2026');
    assert.match(raw?.dbPasswordEncrypted ?? '', /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i);
  });

  await t.test('2. Valida la conexión a la ruta de código fuente', async () => {
    const result = await testSourceConnection({
      sourcePath: tmpSourceDir,
      sourceType: 'LOCAL_PATH',
    });

    assert.equal(result.success, true);
    assert.ok(result.totalEntries && result.totalEntries >= 1);
    assert.ok(result.sampleFiles?.includes('CtrlFacturacion.php'));
  });

  await t.test('3. Asigna un usuario cliente al entorno', async () => {
    const user = await prisma.user.create({
      data: {
        email: `cliente_santamaria_${Date.now()}@demo.com`,
        name: 'Dra. María Fernández',
        passwordHash: 'dummyhash',
        role: 'CLIENTE',
      },
    });
    testUserId = user.id;

    await assignUsersToEnvironment(testEnvId, [testUserId]);

    const updatedEnv = await getEnvironment(testEnvId);
    assert.equal(updatedEnv.users.length, 1);
    assert.equal(updatedEnv.users[0].id, testUserId);
  });

  await t.test('4. Verifica comportamiento condicional: chat con entorno vs chat sin entorno', async () => {
    // Chat para cliente CON entorno
    const chatConEntorno = await prisma.chat.create({
      data: {
        userId: testUserId,
        title: 'Error al cerrar factura',
        status: 'WAITING',
        environmentId: testEnvId,
      },
    });
    testChatId = chatConEntorno.id;

    const dummyConsultant = {
      id: 'consultant-uuid-1',
      name: 'Carlos Consultor',
      email: 'carlos@demo.com',
      role: 'CONSULTOR' as const,
    };

    const copilotCon = await getOrInitCopilot(chatConEntorno.id, dummyConsultant);
    assert.equal(copilotCon.hasEnvironment, true);
    assert.equal(copilotCon.environment?.name, testEnvName);
    assert.ok(copilotCon.turns.length > 0); // Diagnóstico inicial generado

    // Chat para cliente SIN entorno
    const usuarioSinEntorno = await prisma.user.create({
      data: {
        email: `cliente_sin_entorno_${Date.now()}@demo.com`,
        name: 'Paciente Regular',
        passwordHash: 'dummy',
        role: 'CLIENTE',
      },
    });

    const chatSinEntorno = await prisma.chat.create({
      data: {
        userId: usuarioSinEntorno.id,
        title: 'Consulta general',
        status: 'WAITING',
      },
    });

    const copilotSin = await getOrInitCopilot(chatSinEntorno.id, dummyConsultant);
    assert.equal(copilotSin.hasEnvironment, false);
    assert.equal(copilotSin.environment, null);
    assert.equal(copilotSin.turns.length, 0);

    // Limpieza auxiliar
    await prisma.chat.delete({ where: { id: chatSinEntorno.id } });
    await prisma.user.delete({ where: { id: usuarioSinEntorno.id } });
  });

  await t.test('5. Envía instrucción del consultor y ejecuta acción de modificación con respaldo', async () => {
    const dummyConsultant = {
      id: 'consultant-uuid-1',
      name: 'Carlos Consultor',
      email: 'carlos@demo.com',
      role: 'CONSULTOR' as const,
    };

    // Crear un turno de copiloto que proponga modificar CtrlFacturacion.php
    const turnConAccion = await prisma.copilotTurn.create({
      data: {
        chatId: testChatId,
        role: 'COPILOT',
        content: 'He detectado que la validación requiere ajustar CtrlFacturacion.php',
        status: 'PROPOSED',
        proposedAction: {
          type: 'FILE',
          description: 'Ajuste de versión y validación de glosas',
          filePath: 'CtrlFacturacion.php',
          targetContent: 'v1.0 original',
          diff: 'v1.1 con fix de glosas',
        },
      },
    });

    // Consultor aprueba la acción
    const result = await executeProposedAction(testChatId, dummyConsultant, turnConAccion.id, 'APPROVE');
    assert.equal(result.status, 'EXECUTED');
    assert.equal(result.executionResult?.success, true);
    assert.ok(result.executionResult?.backupPath);

    // Verificar que el archivo PHP fue modificado
    const modifiedContent = await fs.readFile(testPhpFile, 'utf8');
    assert.ok(modifiedContent.includes('v1.1 con fix de glosas'));

    // Verificar que el archivo de respaldo .bak existe y contiene la versión original
    const backupContent = await fs.readFile(result.executionResult.backupPath!, 'utf8');
    assert.ok(backupContent.includes('v1.0 original'));
  });

  await t.test('6. Lista clientes móviles y asigna/desasigna entorno administrativo', async () => {
    // Listar clientes y verificar que el usuario testUserId aparece
    const clientList = await listClients({ search: 'Dra. María' });
    assert.ok(clientList.length >= 1);
    const maria = clientList.find((c) => c.id === testUserId);
    assert.ok(maria);
    assert.equal(maria?.environment?.id, testEnvId);
    assert.equal(maria?.environment?.name, testEnvName);

    // Desasignar entorno (pasar null)
    const unassigned = await updateClientEnvironment(testUserId, null);
    assert.equal(unassigned.environmentId, null);

    // Reasignar entorno
    const reassigned = await updateClientEnvironment(testUserId, testEnvId);
    assert.equal(reassigned.environmentId, testEnvId);
  });

  await t.test('7. Configuración dinámica del entorno local (BD y fuente no quemados en código)', async () => {
    // 1. Obtiene o inicializa la configuración base
    const initialConfig = await getLocalEnvironmentConfig();
    assert.ok(initialConfig);
    assert.equal(initialConfig.id, 'default');
    assert.ok(initialConfig.dbServer);
    assert.ok(initialConfig.sourcePath);

    // 2. Actualiza la configuración local dinámicamente con nueva BD y ruta temporal
    const updated = await updateLocalEnvironmentConfig({
      dbServer: '192.168.1.100',
      dbPort: 14333,
      dbDatabase: 'SismaSalud_CustomLocal',
      dbUser: 'admin_local',
      dbPassword: 'NuevaClaveLocal2026',
      dbEnabled: true,
      sourcePath: tmpSourceDir,
    });

    assert.equal(updated.dbServer, '192.168.1.100');
    assert.equal(updated.dbPort, 14333);
    assert.equal(updated.dbDatabase, 'SismaSalud_CustomLocal');
    assert.equal(updated.dbUser, 'admin_local');
    assert.equal(updated.hasPassword, true);
    assert.equal(updated.sourcePath, tmpSourceDir);

    // 3. Valida que el servicio de test de fuentes locales lea la carpeta actualizada
    const sourceTest = await testLocalSourcePath(tmpSourceDir);
    assert.equal(sourceTest.success, true);
    assert.ok(sourceTest.sampleFiles?.includes('CtrlFacturacion.php'));

    // 4. Restaurar configuración por defecto para no afectar otros tests
    await updateLocalEnvironmentConfig({
      dbServer: initialConfig.dbServer,
      dbPort: initialConfig.dbPort,
      dbDatabase: initialConfig.dbDatabase,
      dbUser: initialConfig.dbUser,
      sourcePath: initialConfig.sourcePath,
      dbEnabled: initialConfig.dbEnabled,
    });
  });

  await t.test('8. Sesiones y chat del Agente Técnico para consultores (sin restricciones y con entornos)', async () => {
    // Crear un consultor de prueba
    const consultant = await prisma.user.create({
      data: {
        email: `consultor_agente_${Date.now()}@demo.com`,
        name: 'Ing. Alejandro Consultor',
        passwordHash: 'dummyhash',
        role: 'CONSULTOR',
      },
    });

    try {
      // 1. Crear sesión técnica seleccionando el entorno de prueba
      const session = await createStaffSession(consultant.id, {
        title: 'Diagnóstico Facturación Santa María',
        environmentId: testEnvId,
      });
      assert.ok(session.id);
      assert.equal(session.environmentId, testEnvId);
      assert.equal(session.environmentName, testEnvName);

      // 2. Enviar mensaje del consultor con simulación de imagen
      const turnResult = await sendStaffMessage({
        sessionId: session.id,
        consultantId: consultant.id,
        content: '¿Por qué sale error al cerrar la factura de un paciente con glosa pendiente?',
        imageUrl: '/uploads/error_facturacion.png',
      });

      assert.ok(turnResult.consultantMessage);
      assert.equal(turnResult.consultantMessage.imageUrl, '/uploads/error_facturacion.png');
      assert.ok(turnResult.agentMessage);
      assert.equal(turnResult.agentMessage.role, 'AGENT');
      // Debe responder sin restricciones técnicas (incluyendo código SQL / PHP)
      assert.ok(turnResult.agentMessage.content.includes('sis_maes') || turnResult.agentMessage.content.includes('SQL'));

      // 2a. Enviar saludo en modo CONSULTA (debe responder de forma natural y conversacional, sin diagnósticos rígidos)
      const greetingResult = await sendStaffMessage({
        sessionId: session.id,
        consultantId: consultant.id,
        content: 'Hola',
        mode: 'CHAT',
      });
      assert.ok(greetingResult.agentMessage);
      assert.ok(greetingResult.agentMessage.content.toLowerCase().includes('hola'));
      assert.ok(!greetingResult.agentMessage.planAction);

      // 2b. Enviar mensaje en modo PLAN para validar generación y ejecución de plan (Build)
      const planTurnResult = await sendStaffMessage({
        sessionId: session.id,
        consultantId: consultant.id,
        content: '/plan Ajustar validación de glosas en CtrlFacturacion.php',
        mode: 'PLAN',
      });
      assert.ok(planTurnResult.agentMessage);
      assert.ok(planTurnResult.agentMessage.planAction);
      assert.ok(Array.isArray(planTurnResult.agentMessage.planAction.steps));
      assert.ok(planTurnResult.agentMessage.planAction.steps.length > 0);
      assert.ok(planTurnResult.agentMessage.planAction.verificationCriteria);

      // Probar ejecución de plan (Build) sobre archivo del entorno con respaldo automático
      const planMsgId = planTurnResult.agentMessage.id;
      await prisma.staffAgentMessage.update({
        where: { id: planMsgId },
        data: {
          planAction: {
            type: 'FILE',
            title: 'Ajuste de glosas en CtrlFacturacion',
            description: 'Modificación automática mediante Plan & Build',
            status: 'PROPOSED',
            steps: ['Inspeccionar CtrlFacturacion.php', 'Aplicar fix de glosas', 'Verificar respaldo .bak'],
            verificationCriteria: 'El archivo debe contener el fix v1.2',
            filePath: 'CtrlFacturacion.php',
            targetContent: 'v1.1 con fix de glosas',
            diff: 'v1.2 plan build exitoso',
          },
        },
      });

      const buildExecution = await executeStaffPlanAction({
        sessionId: session.id,
        messageId: planMsgId,
        consultantId: consultant.id,
        decision: 'APPROVE',
      });

      assert.equal(buildExecution.planAction.status, 'EXECUTED');
      assert.equal(buildExecution.executionResult?.success, true);
      assert.ok(buildExecution.executionResult?.backupPath);

      // 2c. Probar reestructuración conversacional del plan por la IA a petición del consultor
      const restructuredTurn = await sendStaffMessage({
        sessionId: session.id,
        consultantId: consultant.id,
        content: 'Modifica el plan: no toques la tabla sis_maes sino solo sis_deta con estado P',
        mode: 'PLAN',
      });
      assert.ok(restructuredTurn.agentMessage);
      assert.ok(restructuredTurn.agentMessage.planAction);
      assert.equal(restructuredTurn.agentMessage.planAction.status, 'PROPOSED');
      assert.ok(restructuredTurn.agentMessage.content.toLowerCase().includes('reestructurado'));
      assert.ok(Array.isArray(restructuredTurn.agentMessage.planAction.steps));

      // 2d. Probar edición manual directa de los parámetros del plan (título, SQL, steps, verificationCriteria)
      const manualEdit = await updateStaffPlanAction({
        sessionId: session.id,
        messageId: restructuredTurn.agentMessage.id,
        consultantId: consultant.id,
        title: 'Plan Ajustado Manualmente por Consultor',
        sql: 'UPDATE sis_deta SET estado = "CORREGIDO" WHERE estudio = 99999;',
        steps: ['1. Validar registros en sis_deta con estado P', '2. Ejecutar UPDATE', '3. Confirmar estado CORREGIDO'],
        verificationCriteria: 'Ningún registro con estudio 99999 debe quedar en estado P',
      });
      assert.equal(manualEdit.planAction.title, 'Plan Ajustado Manualmente por Consultor');
      assert.equal(manualEdit.planAction.sql, 'UPDATE sis_deta SET estado = "CORREGIDO" WHERE estudio = 99999;');
      assert.deepEqual(manualEdit.planAction.steps, [
        '1. Validar registros en sis_deta con estado P',
        '2. Ejecutar UPDATE',
        '3. Confirmar estado CORREGIDO',
      ]);
      assert.equal(
        manualEdit.planAction.verificationCriteria,
        'Ningún registro con estudio 99999 debe quedar en estado P',
      );

      // 3. Cambiar de entorno a Local Base (null)
      const switched = await updateStaffSessionEnvironment(session.id, null, consultant.id);
      assert.equal(switched.environmentId, null);
      assert.equal(switched.environmentName, 'Entorno Local (SismaSalud Base)');

      // 4. Obtener detalle de sesión con mensajes acumulados
      const detail = await getStaffSession(session.id, consultant.id);
      assert.equal(detail.messages.length, 8); // 4 consultor + 4 agente

      // 4b. Asociar un agyConversationId para verificar que deleteStaffSession sincroniza borrado
      await prisma.staffAgentSession.update({
        where: { id: session.id },
        data: { agyConversationId: 'test-staff-session-agy-uuid-9999' },
      });

      // 5. Eliminar sesión (debe limpiar conversación en agy)
      const del = await deleteStaffSession(session.id, consultant.id);
      assert.equal(del.ok, true);
    } finally {
      await prisma.user.delete({ where: { id: consultant.id } }).catch(() => {});
    }
  });

  await t.test('9. Eliminación de chat y sincronización con agy CLI (deleteChat)', async () => {
    const dummyClient = await prisma.user.create({
      data: {
        email: `cliente_del_${Date.now()}@demo.com`,
        name: 'Cliente Para Borrado',
        passwordHash: 'dummy',
        role: 'CLIENTE',
      },
    });

    const chatToDel = await prisma.chat.create({
      data: {
        userId: dummyClient.id,
        title: 'Chat temporal a eliminar',
        status: 'WAITING',
        agyConversationId: 'test-chat-agy-uuid-8888',
      },
    });

    // Probar eliminación de chat con usuario propietario
    const delResult = await deleteChat(chatToDel.id, dummyClient.id, 'CLIENTE');
    assert.equal(delResult.ok, true);

    const exists = await prisma.chat.findUnique({ where: { id: chatToDel.id } });
    assert.equal(exists, null);

    // Probar deleteAgyConversation directamente con id no existente para comprobar idempotencia
    await deleteAgyConversation('fake-conv-id-nonexistent');

    await prisma.user.delete({ where: { id: dummyClient.id } }).catch(() => {});
  });
});
