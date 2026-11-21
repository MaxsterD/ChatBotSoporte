import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'demo1234';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@sismasalud.demo' },
    update: { name: 'Administrador SismaSalud', role: 'ADMIN', passwordHash },
    create: {
      name: 'Administrador SismaSalud',
      email: 'admin@sismasalud.demo',
      role: 'ADMIN',
      passwordHash,
    },
  });

  const consultant1 = await prisma.user.upsert({
    where: { email: 'consultor1@sismasalud.demo' },
    update: { name: 'Laura Gómez', role: 'CONSULTOR', passwordHash },
    create: {
      name: 'Laura Gómez',
      email: 'consultor1@sismasalud.demo',
      role: 'CONSULTOR',
      passwordHash,
    },
  });

  await prisma.user.upsert({
    where: { email: 'consultor2@sismasalud.demo' },
    update: { name: 'Andrés Ramírez', role: 'CONSULTOR', passwordHash },
    create: {
      name: 'Andrés Ramírez',
      email: 'consultor2@sismasalud.demo',
      role: 'CONSULTOR',
      passwordHash,
    },
  });

  const client1 = await prisma.user.upsert({
    where: { email: 'cliente@sismasalud.demo' },
    update: { name: 'Clínica San Rafael', role: 'CLIENTE', passwordHash },
    create: {
      name: 'Clínica San Rafael',
      email: 'cliente@sismasalud.demo',
      role: 'CLIENTE',
      passwordHash,
    },
  });

  const client2 = await prisma.user.upsert({
    where: { email: 'cliente2@sismasalud.demo' },
    update: { name: 'IPS Salud Total', role: 'CLIENTE', passwordHash },
    create: {
      name: 'IPS Salud Total',
      email: 'cliente2@sismasalud.demo',
      role: 'CLIENTE',
      passwordHash,
    },
  });

  const existingChats = await prisma.chat.count();
  if (existingChats > 0) {
    console.log(`Seed de usuarios listo. Ya existen ${existingChats} chats, no se crean demos.`);
    console.log(`  admin@sismasalud.demo / consultor1@sismasalud.demo / cliente@sismasalud.demo · clave ${PASSWORD}`);
    return;
  }

  const now = Date.now();

  async function seedChat(params: {
    userId: string;
    title: string;
    status: 'BOT' | 'WAITING' | 'ASSIGNED' | 'CLOSED';
    minutesAgo: number;
    consultantId?: string;
    messages: Array<{ authorType: 'USER' | 'BOT' | 'SYSTEM' | 'CONSULTANT'; content: string; authorId?: string }>;
    escalation?: {
      reason: 'BOT' | 'USER_REQUEST' | 'AGENT_ERROR';
      summary: string;
      probableCause: string;
      suggestedSolution: string;
      missingInfo: string;
      ready: boolean;
    };
  }) {
    const createdAt = new Date(now - params.minutesAgo * 60_000);
    const chat = await prisma.chat.create({
      data: {
        userId: params.userId,
        title: params.title,
        status: params.status,
        assignedConsultantId: params.consultantId,
        agyConversationId: params.status === 'BOT' ? null : `demo-${params.title.slice(0, 8)}`,
        queueEnteredAt: params.status === 'WAITING' ? new Date(now - params.minutesAgo * 60_000) : null,
        takenAt: params.status === 'ASSIGNED' ? new Date(now - (params.minutesAgo - 2) * 60_000) : null,
        closedAt: params.status === 'CLOSED' ? new Date(now - 30 * 60_000) : null,
        createdAt,
        lastMessageAt: createdAt,
        lastMessagePreview: '',
      },
    });

    let offset = 0;
    for (const message of params.messages) {
      offset += 1;
      const createdAtMessage = new Date(createdAt.getTime() + offset * 45_000);
      await prisma.message.create({
        data: {
          chatId: chat.id,
          authorType: message.authorType,
          authorId: message.authorId ?? null,
          content: message.content,
          createdAt: createdAtMessage,
        },
      });
      await prisma.chat.update({
        where: { id: chat.id },
        data: {
          lastMessageAt: createdAtMessage,
          lastMessagePreview: message.content.slice(0, 140),
        },
      });
    }

    if (params.escalation) {
      await prisma.escalation.create({
        data: {
          chatId: chat.id,
          reason: params.escalation.reason,
          summary: params.escalation.summary,
          probableCause: params.escalation.probableCause,
          suggestedSolution: params.escalation.suggestedSolution,
          missingInfo: params.escalation.missingInfo,
          ready: params.escalation.ready,
          createdAt: new Date(now - (params.minutesAgo - 1) * 60_000),
        },
      });
    }
  }

  await seedChat({
    userId: client1.id,
    title: 'No puedo cerrar una factura en Caja',
    status: 'WAITING',
    minutesAgo: 9,
    messages: [
      {
        authorType: 'SYSTEM',
        content:
          '¡Hola! Soy el agente de soporte de SismaSalud. Cuéntame tu duda y la reviso contigo.',
      },
      { authorType: 'USER', content: 'Buenos días, al cerrar una factura me sale "RIPS incompleto" y no me deja guardar.' },
      {
        authorType: 'BOT',
        content:
          'Normalmente ocurre cuando falta un diagnóstico o un procedimiento sin CUPS en la atención. ¿La factura es de consulta externa y el paciente ya tiene la atención cerrada en historia clínica?',
      },
      { authorType: 'USER', content: 'Es consulta externa. Ya revisé y tiene diagnóstico. Aun así me sale el error.' },
      {
        authorType: 'BOT',
        content:
          'En ese caso necesito revisar la configuración de la atención y el tipo de contrato. Te conecto con un asesor para que lo valide.',
      },
      {
        authorType: 'SYSTEM',
        content:
          'Te estoy conectando con un asesor humano. En un momento se une a la conversación y ve todo lo que hemos hablado.',
      },
    ],
    escalation: {
      reason: 'BOT',
      summary:
        'Factura de consulta externa no cierra por validación RIPS "RIPS incompleto" aunque el paciente tiene diagnóstico registrado.',
      probableCause:
        'Posible procedimiento sin código CUPS o contrato sin configuración de RIPS; también puede faltar el tipo de usuario en la atención.',
      suggestedSolution:
        '1) Revisar la atención en HC → Evolución y confirmar CUPS en todos los procedimientos. 2) Validar el contrato/EPS del paciente. 3) Regenerar el RIPS desde Facturación → RIPS antes de cerrar.',
      missingInfo:
        'Número de factura, documento del paciente, contrato/EPS y captura del mensaje exacto de validación.',
      ready: true,
    },
  });

  await seedChat({
    userId: client2.id,
    title: 'Agenda del profesional no aparece',
    status: 'ASSIGNED',
    minutesAgo: 25,
    consultantId: consultant1.id,
    messages: [
      { authorType: 'SYSTEM', content: '¡Hola! Soy el agente de soporte de SismaSalud.' },
      { authorType: 'USER', content: 'Al agendar una cita no me aparece la agenda del doctor para mañana.' },
      {
        authorType: 'BOT',
        content:
          'Suele pasar cuando el profesional no tiene agenda configurada para esa fecha. Revisa Configuración → Agendas.',
      },
      { authorType: 'USER', content: 'Ya la revisé y sí tiene agenda. ¿Me pueden ayudar?' },
      { authorType: 'SYSTEM', content: 'Un asesor se unió a la conversación. Hola, soy Laura Gómez.' },
      {
        authorType: 'CONSULTANT',
        authorId: consultant1.id,
        content:
          'Hola, estoy revisando tu caso. ¿Me confirmas la sede y el nombre del profesional, por favor?',
      },
    ],
    escalation: {
      reason: 'USER_REQUEST',
      summary: 'El profesional tiene agenda configurada pero no aparece al agendar cita en la sede.',
      probableCause:
        'La agenda puede estar asociada a otra sede o el profesional no está habilitado en el servicio de la cita.',
      suggestedSolution:
        'Verificar sede activa del profesional, servicio y rango de fechas de la agenda antes de recrearla.',
      missingInfo: 'Sede, nombre del profesional, servicio y fecha en la que intenta agendar.',
      ready: true,
    },
  });

  await seedChat({
    userId: client1.id,
    title: 'Cómo descargar el RIPS del mes',
    status: 'BOT',
    minutesAgo: 60,
    messages: [
      { authorType: 'SYSTEM', content: '¡Hola! Soy el agente de soporte de SismaSalud.' },
      { authorType: 'USER', content: '¿Cómo descargo el RIPS del mes anterior?' },
      {
        authorType: 'BOT',
        content:
          'Entra a Facturación → Generación RIPS, selecciona el periodo y la EPS, y usa "Generar". Al terminar puedes descargar el archivo desde el histórico de RIPS de la misma pantalla.',
      },
      { authorType: 'USER', content: 'Perfecto, muchas gracias.' },
    ],
  });

  await seedChat({
    userId: client2.id,
    title: 'Error al imprimir historia clínica',
    status: 'CLOSED',
    minutesAgo: 180,
    consultantId: consultant1.id,
    messages: [
      { authorType: 'SYSTEM', content: '¡Hola! Soy el agente de soporte de SismaSalud.' },
      { authorType: 'USER', content: 'No puedo imprimir la historia clínica de un paciente.' },
      { authorType: 'CONSULTANT', authorId: consultant1.id, content: 'Se corrigió el permiso de impresión del usuario. Quedó funcionando.' },
      { authorType: 'SYSTEM', content: 'El asesor cerró la conversación.' },
    ],
  });

  console.log('Seed listo:');
  console.log(`  ${admin.email} · ADMIN · clave ${PASSWORD}`);
  console.log(`  consultor1@sismasalud.demo · CONSULTOR · clave ${PASSWORD}`);
  console.log(`  consultor2@sismasalud.demo · CONSULTOR · clave ${PASSWORD}`);
  console.log(`  cliente@sismasalud.demo · CLIENTE · clave ${PASSWORD}`);
  console.log(`  cliente2@sismasalud.demo · CLIENTE · clave ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
