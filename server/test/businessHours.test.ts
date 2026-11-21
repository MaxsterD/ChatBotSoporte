import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import {
  checkBusinessHoursStatus,
  generateScheduleText,
  getBusinessHoursConfig,
  updateBusinessHoursConfig,
} from '../src/businessHours/service';
import { createChat } from '../src/chats/service';
import type { AuthUser } from '../src/lib/auth';

test('Horario de Atención y Restricción de Creación de Chats', async (t) => {
  let initialConfig: any;

  t.before(async () => {
    initialConfig = await getBusinessHoursConfig();
  });

  t.after(async () => {
    // Restaurar configuración original
    if (initialConfig) {
      await updateBusinessHoursConfig({
        enabled: initialConfig.enabled,
        daysEnabled: initialConfig.daysEnabled,
        startHour: initialConfig.startHour,
        startMinute: initialConfig.startMinute,
        endHour: initialConfig.endHour,
        endMinute: initialConfig.endMinute,
        customMessage: initialConfig.customMessage,
      });
    }
  });

  await t.test('1. Obtiene configuración inicial de horario por defecto', async () => {
    const config = await getBusinessHoursConfig();
    assert.ok(config);
    assert.equal(config.id, 'default');
    assert.ok(Array.isArray(config.daysEnabled));
    assert.equal(typeof config.startHour, 'number');
    assert.equal(typeof config.endHour, 'number');
    assert.ok(config.scheduleText.length > 0);
  });

  await t.test('2. Formatea correctamente el texto del horario según los días seleccionados', () => {
    const lunAVie = generateScheduleText([1, 2, 3, 4, 5], 8, 0, 17, 0);
    assert.equal(lunAVie, 'Lunes a Viernes de 8:00 am a 5:00 pm');

    const lunASab = generateScheduleText([1, 2, 3, 4, 5, 6], 7, 30, 18, 0);
    assert.equal(lunASab, 'Lunes a Sábado de 7:30 am a 6:00 pm');

    const todos = generateScheduleText([0, 1, 2, 3, 4, 5, 6], 8, 0, 12, 0);
    assert.equal(todos, 'Todos los días de 8:00 am a 12:00 pm');
  });

  await t.test('3. Valida y actualiza la configuración de horario', async () => {
    // Falla si la hora de inicio es posterior a la de fin
    await assert.rejects(
      () =>
        updateBusinessHoursConfig({
          startHour: 18,
          endHour: 8,
        }),
      { message: 'La hora de inicio debe ser anterior a la hora de fin' },
    );

    // Actualiza correctamente
    const updated = await updateBusinessHoursConfig({
      enabled: true,
      daysEnabled: [1, 2, 3, 4, 5],
      startHour: 8,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
      customMessage: 'Atención cerrada por el momento. Horario: 8am a 5pm.',
    });

    assert.equal(updated.enabled, true);
    assert.equal(updated.startHour, 8);
    assert.equal(updated.endHour, 17);
    assert.equal(updated.customMessage, 'Atención cerrada por el momento. Horario: 8am a 5pm.');
  });

  await t.test('4. Evalúa status abierto o cerrado según fecha y hora simulada', async () => {
    // Configurar Lunes a Viernes 8am a 5pm
    await updateBusinessHoursConfig({
      enabled: true,
      timezone: 'America/Bogota',
      daysEnabled: [1, 2, 3, 4, 5],
      startHour: 8,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
    });

    // Simular un Lunes a las 10:00 am hora Bogotá (15:00 UTC)
    const mondayMorningUTC = new Date('2026-11-23T15:00:00Z');
    const statusOpen = await checkBusinessHoursStatus(mondayMorningUTC);
    assert.equal(statusOpen.isOpen, true);

    // Simular un Lunes a las 8:00 pm hora Bogotá (01:00 UTC del día siguiente)
    const mondayNightUTC = new Date('2026-11-24T01:00:00Z');
    const statusClosedNight = await checkBusinessHoursStatus(mondayNightUTC);
    assert.equal(statusClosedNight.isOpen, false);
    assert.ok(statusClosedNight.message.length > 0);

    // Simular un Domingo a las 11:00 am hora Bogotá (16:00 UTC)
    const sundayMorningUTC = new Date('2026-11-22T16:00:00Z');
    const statusClosedSunday = await checkBusinessHoursStatus(sundayMorningUTC);
    assert.equal(statusClosedSunday.isOpen, false);

    // Si enabled = false, debe estar abierto siempre
    await updateBusinessHoursConfig({ enabled: false });
    const statusDisabled = await checkBusinessHoursStatus(sundayMorningUTC);
    assert.equal(statusDisabled.isOpen, true);
  });

  await t.test('5. Bloquea creación de chats a clientes móviles cuando está fuera de horario', async () => {
    // Crear un cliente de prueba
    const clientUser = await prisma.user.create({
      data: {
        email: `cliente_horario_${Date.now()}@test.com`,
        name: 'Dra. Prueba Horario',
        passwordHash: 'dummy',
        role: 'CLIENTE',
      },
    });

    const clientAuth: AuthUser = {
      id: clientUser.id,
      email: clientUser.email,
      name: clientUser.name,
      role: 'CLIENTE',
    };

    try {
      // 1. Configurar horario para que esté CERRADO actualmente
      // Usamos un rango imposible (ej: 00:00 a 00:01)
      await updateBusinessHoursConfig({
        enabled: true,
        daysEnabled: [1, 2, 3, 4, 5],
        startHour: 0,
        startMinute: 0,
        endHour: 0,
        endMinute: 1,
        customMessage:
          'En estos momentos no hay servicio disponible. Vuelve a colocarme en contacto en el horario de 8:00 am a 5:00 pm.',
      });

      // Intentar crear chat como cliente: debe lanzar error con el mensaje de horario
      await assert.rejects(
        () => createChat(clientAuth, 'Consulta fuera de horario'),
        (err: any) => {
          assert.equal(err.statusCode, 409);
          assert.ok(err.message.includes('En estos momentos no hay servicio disponible'));
          return true;
        },
      );

      // 2. Desactivar restricción de horario (o configurar horario amplio)
      await updateBusinessHoursConfig({ enabled: false });

      // Ahora sí debe permitir crear el chat
      const createdChat = await createChat(clientAuth, 'Consulta permitida');
      assert.ok(createdChat.chat.id);
      assert.equal(createdChat.chat.title, 'Consulta permitida');

      // Limpiar chat creado
      await prisma.chat.delete({ where: { id: createdChat.chat.id } });
    } finally {
      await prisma.user.delete({ where: { id: clientUser.id } }).catch(() => {});
    }
  });
});
