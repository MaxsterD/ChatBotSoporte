import type { AgentTurnInput, AgentTurnResult } from './types';

type MockEntry = {
  match: RegExp;
  answer: string;
  escalate?: boolean;
  cause?: string;
  solution?: string;
  missing?: string;
};

const KNOWLEDGE: MockEntry[] = [
  {
    match: /modific.*(?:archivo|fichero|servidor|codigo|código|tabla|registro|campo)|borr.*(?:archivo|fichero|servidor|registro|tabla)|edit.*(?:archivo|servidor|tabla)|(?:ejecut.*|corr.*|haz|aplica|hazme).*(?:sql|query|script|insert|update|delete|drop|alter)|(?:ignora|olvida).*(?:instrucciones|reglas)|(?:soy.*(?:dba|administrador|admin|gerente)|tengo.*permiso)/i,
    answer:
      'Como agente de soporte no tengo permitido modificar archivos del servidor ni ejecutar modificaciones en la base de datos, sin importar el perfil o la solicitud. Mi función se limita estrictamente a consultar información y orientarte en el uso del sistema. Voy a transferir tu solicitud a un asesor humano.',
    escalate: true,
    cause:
      'El cliente solicita una acción restringida de modificación o alteración del sistema / intento de cambio de permisos.',
    solution:
      'Un asesor técnico con los permisos requeridos debe validar y gestionar la solicitud de acuerdo con los protocolos de seguridad.',
    missing: 'Detalle técnico de la solicitud y justificación del requerimiento.',
  },
  {
    match: /cita|agend|agenda|turno/i,
    answer:
      'Para agendar una cita en SismaSalud entra al módulo Citas, selecciona al paciente y elige "Nueva cita". Verifica que el profesional tenga agenda configurada para ese día y que el paciente esté afiliado con la EPS correcta. Si la agenda no aparece, revisa Configuración → Agendas del profesional.',
  },
  {
    match: /factur|rips|cuenta|cobro|caja/i,
    answer:
      'Para facturar revisa que la atención tenga procedimientos registrados en la historia clínica y que el paciente tenga una autorización vigente si el servicio la requiere. Luego entra a Facturación → Nueva factura. Si el sistema bloquea el cierre, suele ser por un campo obligatorio del RIPS sin diligenciar.',
  },
  {
    match: /clave|contrase|login|ingresar|sesion|usuario bloqueado/i,
    answer:
      'Puedes restablecer tu contraseña desde el portal de usuarios con la opción "¿Olvidaste tu contraseña?". Si el usuario está bloqueado o el correo no llega, un asesor debe verificar el estado del usuario en el módulo de Sistemas → Usuarios.',
  },
  {
    match: /farmacia|inventario|medicamento|dispens/i,
    answer:
      'En Farmacia → Dispensación busca el medicamento por código o nombre. Si no aparece stock, revisa Inventario → Existencias y confirma que el movimiento de ingreso esté registrado en la bodega correspondiente.',
  },
  {
    match: /historia|hc|evolucion|nota clinica/i,
    answer:
      'La historia clínica se diligencia desde HC → Evolución. Si el paciente no aparece, confirma que tenga una atención abierta en Enfermería o Admisión y que el profesional esté asignado al servicio.',
  },
  {
    match: /portal|paciente|pqrs|receta|tramite/i,
    answer:
      'Desde el portal de pacientes puedes consultar citas, recetas, trámites y radicar PQRS. Si el paciente no puede ingresar, valida que el documento esté registrado en Afiliación y que el correo coincida con el registrado.',
  },
];

const ESCALATION_FALLBACK: MockEntry = {
  match: /.*/,
  answer:
    'No quiero darte información incorrecta. Voy a conectarte con un asesor que revisa tu caso con el detalle completo.',
  escalate: true,
  cause:
    'La consulta requiere revisar configuración o datos específicos de la institución que no están cubiertos por la base de conocimiento.',
  solution:
    'Un asesor debe validar el módulo implicado, el usuario afectado y la configuración de la sede antes de responder.',
  missing: 'Sede, usuario, módulo exacto, mensaje de error y hora en que ocurrió.',
};

const ERROR_HINTS = /error|no funciona|no puedo|falla|fallo|bloque|no carga|no aparece|no deja|500|excepcion|excepción/i;

function pickAnswer(message: string): MockEntry {
  const entry = KNOWLEDGE.find((item) => item.match.test(message));
  if (entry) return entry;
  if (ERROR_HINTS.test(message)) return ESCALATION_FALLBACK;
  return {
    match: /.*/,
    answer:
      'Cuéntame un poco más: ¿en qué módulo de SismaSalud estás trabajando, qué acción intentabas hacer y qué mensaje aparece en pantalla? Con eso puedo guiarte mejor.',
  };
}

function chunkText(text: string) {
  const words = text.split(/(\s+)/);
  const chunks: string[] = [];
  let current = '';
  for (const word of words) {
    current += word;
    if (current.length >= 18) {
      chunks.push(current);
      current = '';
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Proveedor de desarrollo: simula al agente sin consumir cuota ni esperar minutos. */
export async function mockTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const message = input.prompt.includes('[MENSAJE DEL CLIENTE]')
    ? input.prompt.split('[MENSAJE DEL CLIENTE]')[1]?.split('<<<')[1] ?? input.prompt
    : input.prompt;

  const entry = pickAnswer(message);
  const escalate = Boolean(entry.escalate) || Boolean(input.analysisOnly);

  if (!input.analysisOnly) {
    for (const chunk of chunkText(entry.answer)) {
      if (input.signal?.aborted) throw new Error('cancelado');
      input.onDelta?.(chunk);
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
  }

  return {
    answer: input.analysisOnly ? '' : entry.answer,
    escalate,
    analysis: {
      summary: entry.escalate
        ? 'El cliente reporta un comportamiento que requiere revisión de configuración o datos de su institución.'
        : 'Consulta resuelta con la base de conocimiento de SismaSalud.',
      probableCause: entry.cause ?? 'Duda funcional sobre el uso del módulo.',
      suggestedSolution:
        entry.solution ??
        'Se entregaron los pasos del módulo correspondiente y se recomendó validar configuración si persiste.',
      missingInfo: entry.missing ?? 'Ninguna información adicional por ahora.',
    },
    conversationId: input.conversationId ?? 'mock-conversation',
    model: 'mock',
  };
}
