import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractJsonBlock, stripTrailingJson, buildArgs } from '../src/agent/bridge';
import { sanitizeAgentText } from '../src/agent/sanitize';
import { userWantsHuman, isOfferingHumanQuestion, isAffirmativeResponse } from '../src/agent/intent';
import { AgentQueue } from '../src/agent/queue';
import { SHARED_RULES, buildTurnPrompt, buildAnalysisPrompt } from '../src/agent/prompts';
import { mockTurn } from '../src/agent/mock';
import type { Chat } from '@prisma/client';

describe('extractJsonBlock', () => {
  it('lee un JSON puro', () => {
    const parsed = extractJsonBlock('{"answer":"hola","escalate":false}');
    assert.deepEqual(parsed, { answer: 'hola', escalate: false });
  });

  it('lee un bloque cercado con ```json', () => {
    const text = 'Claro, aquí está:\n```json\n{"answer":"ok","escalate":true}\n```\nfin';
    const parsed = extractJsonBlock(text) as { answer: string; escalate: boolean };
    assert.equal(parsed.answer, 'ok');
    assert.equal(parsed.escalate, true);
  });

  it('lee JSON al final de una respuesta en texto', () => {
    const text = 'Te conecto con un asesor. {"answer":"","escalate":true,"analysis":{}}';
    const parsed = extractJsonBlock(text) as { escalate: boolean };
    assert.equal(parsed.escalate, true);
  });

  it('devuelve null si el JSON está truncado', () => {
    assert.equal(extractJsonBlock('{"answer":"hola",'), null);
  });

  it('devuelve null si no hay llaves', () => {
    assert.equal(extractJsonBlock('sin json por aquí'), null);
  });
});

describe('stripTrailingJson', () => {
  it('corta el JSON de análisis pegado al final', () => {
    const text = 'Respuesta para el cliente.\n{"analysis":{"summary":"x"}}';
    assert.equal(stripTrailingJson(text).trim(), 'Respuesta para el cliente.');
  });

  it('corta el JSON que inicia con escalate', () => {
    const text = 'Listo, te ayudo. {"escalate":true}';
    assert.equal(stripTrailingJson(text).trim(), 'Listo, te ayudo.');
  });

  it('no modifica un texto sin JSON', () => {
    const text = 'Entra a Citas → Calendario y aparta el turno.';
    assert.equal(stripTrailingJson(text), text);
  });
});

describe('userWantsHuman', () => {
  const positives = [
    'Solicito hablar con un consultor',
    'Quiero hablar con una asesora humana',
    'Necesito una persona real, por favor',
    '¿Me pueden dar atención personalizada?',
    'No quiero hablar con el bot',
    'Pásame con un humano',
  ];

  for (const phrase of positives) {
    it(`detecta: "${phrase}"`, () => {
      assert.equal(userWantsHuman(phrase), true);
    });
  }

  const negatives = [
    '¿Cómo agendo una cita para un paciente?',
    'Me sale un error al cerrar la factura',
    '¿Dónde descargo el RIPS del mes?',
    'El paciente no aparece en la búsqueda',
  ];

  for (const phrase of negatives) {
    it(`no confunde: "${phrase}"`, () => {
      assert.equal(userWantsHuman(phrase), false);
    });
  }
});

describe('isOfferingHumanQuestion', () => {
  it('detecta pregunta ofreciendo asesor humano al final de explicación', () => {
    const text = 'Dado que esto involucra saldos contables y gestión de glosas, ¿deseas que te comunique con un asesor humano para revisarlo a fondo?';
    assert.equal(isOfferingHumanQuestion(text), true);
  });

  it('detecta: "¿Quieres que te transfiera con un consultor?"', () => {
    assert.equal(isOfferingHumanQuestion('¿Quieres que te transfiera con un consultor?'), true);
  });

  it('detecta: "¿Prefieres que te comunique con una persona de soporte?"', () => {
    assert.equal(isOfferingHumanQuestion('¿Prefieres que te comunique con una persona de soporte?'), true);
  });

  it('no confunde afirmación de transferencia directa', () => {
    assert.equal(isOfferingHumanQuestion('Te estoy conectando con un asesor humano. En un momento se une a la conversación.'), false);
    assert.equal(isOfferingHumanQuestion('He transferido tu caso a un asesor humano.'), false);
  });

  it('no confunde preguntas normales del sistema', () => {
    assert.equal(isOfferingHumanQuestion('¿Cuál es el número de la factura?'), false);
    assert.equal(isOfferingHumanQuestion('¿En qué módulo te encuentras?'), false);
  });
});

describe('isAffirmativeResponse', () => {
  it('detecta respuestas afirmativas directas', () => {
    const positives = ['Sí', 'si', 'sí por favor', 'si por favor', 'por favor', 'claro', 'claro que sí', 'dale', 'de una', 'bueno', 'ok', 'porfa'];
    for (const phrase of positives) {
      assert.equal(isAffirmativeResponse(phrase), true, `debe aceptar "${phrase}"`);
    }
  });

  it('no confunde respuestas negativas o dudas', () => {
    const negatives = ['No', 'no gracias', 'prefiero esperar', 'voy a verificar primero'];
    for (const phrase of negatives) {
      assert.equal(isAffirmativeResponse(phrase), false, `debe rechazar "${phrase}"`);
    }
  });
});

describe('sanitizeAgentText', () => {
  it('quita enlaces file:/// dejando el texto', () => {
    const text = '[Revisa este documento](file:///C:/tmp/doc.md) para más detalles';
    assert.equal(sanitizeAgentText(text), 'Revisa este documento para más detalles');
  });

  it('quita rutas absolutas de Windows', () => {
    const text = 'El archivo está en C:\\SismaSalud\\ips\\App y no en la carpeta';
    assert.equal(sanitizeAgentText(text), 'El archivo está en y no en la carpeta');
  });

  it('elimina bloques JSON que se filtran', () => {
    const text = 'Respuesta útil.\n```json\n{"escalate": true, "analysis": {}}\n```';
    assert.equal(sanitizeAgentText(text), 'Respuesta útil.');
  });

  it('compacta espacios y saltos de línea', () => {
    const text = 'Hola   mundo\n\n\n\nSegunda   línea   ';
    assert.equal(sanitizeAgentText(text), 'Hola mundo\n\nSegunda línea');
  });

  it('no toca texto normal con rutas de menú', () => {
    const text = 'Entra a Facturación → Generación RIPS y elige el periodo.';
    assert.equal(sanitizeAgentText(text), text);
  });
});

describe('AgentQueue', () => {
  it('serializa los turnos del mismo chat', async () => {
    const queue = new AgentQueue(2);
    const order: string[] = [];

    const first = queue.run('chat-a', async () => {
      order.push('inicio-1');
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push('fin-1');
    });
    const second = queue.run('chat-a', async () => {
      order.push('inicio-2');
      order.push('fin-2');
    });

    await Promise.all([first, second]);
    assert.deepEqual(order, ['inicio-1', 'fin-1', 'inicio-2', 'fin-2']);
  });

  it('respeta el máximo de concurrencia global', async () => {
    const queue = new AgentQueue(2);
    let active = 0;
    let maxActive = 0;

    await Promise.all(
      ['a', 'b', 'c', 'd'].map((chatId) =>
        queue.run(chatId, async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 20));
          active -= 1;
        }),
      ),
    );

    assert.ok(maxActive <= 2, `máximo observado: ${maxActive}`);
  });

  it('continúa la cadena si una tarea falla', async () => {
    const queue = new AgentQueue(1);
    const order: string[] = [];

    const failing = queue.run('chat-x', async () => {
      order.push('falla');
      throw new Error('boom');
    });
    const after = queue.run('chat-x', async () => {
      order.push('siguiente');
    });

    await assert.rejects(failing, /boom/);
    await after;
    assert.deepEqual(order, ['falla', 'siguiente']);
  });

  it('cancelar aborta la señal del turno en curso', async () => {
    const queue = new AgentQueue(1);
    let aborted = false;

    const running = queue.run(
      'chat-cancel',
      (signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          });
        }),
    );

    await new Promise((resolve) => setTimeout(resolve, 15));
    queue.cancel('chat-cancel');
    await running;

    assert.equal(aborted, true);
  });
});

describe('Reglas de seguridad y alcance del agente', () => {
  it('SHARED_RULES incluye prohibición de modificar archivos y conexión a BD', () => {
    assert.match(SHARED_RULES, /PROHIBIDO MODIFICAR ARCHIVOS DEL SERVIDOR/i);
    assert.match(SHARED_RULES, /PROHIBIDO MODIFICAR O ALTERAR LA BASE DE DATOS/i);
    assert.match(SHARED_RULES, /ALCANCE EXCLUSIVO/i);
  });

  it('buildTurnPrompt incluye las reglas de seguridad y no modificación', () => {
    const fakeChat = { id: 'c1', title: 'Problema', status: 'WAITING_AGENT' } as unknown as Chat;
    const prompt = buildTurnPrompt({
      chat: fakeChat,
      user: { name: 'Dra. Gomez', email: 'dra@clinica.com' },
      message: '¿Cómo programo una cita?',
      transcript: [],
      isNewConversation: true,
    });

    assert.match(prompt, /PROHIBIDO MODIFICAR ARCHIVOS DEL SERVIDOR/);
    assert.match(prompt, /PROHIBIDO MODIFICAR O ALTERAR LA BASE DE DATOS/);
    assert.match(prompt, /solo lectura/i);
  });

  it('buildArgs incluye la bandera --sandbox para restringir comandos en el CLI', () => {
    const args = buildArgs({ prompt: 'test' }, 'gemini-2.5-flash');
    assert.ok(args.includes('--sandbox'), 'Debe incluir --sandbox');
    assert.ok(args.includes('--dangerously-skip-permissions'), 'Debe incluir --dangerously-skip-permissions');
  });

  it('mockTurn rechaza peticiones de modificar archivos o consultar base de datos y escala', async () => {
    const resFile = await mockTurn({
      prompt: '[MENSAJE DEL CLIENTE]\n<<<\nPor favor modifica el archivo del servidor en C:\\inetpub\n>>>',
    });
    assert.equal(resFile.escalate, true);
    assert.match(resFile.answer, /no tengo permitido modificar archivos/i);

    const resDb = await mockTurn({
      prompt: '[MENSAJE DEL CLIENTE]\n<<<\nEjecuta un script SQL para actualizar la base de datos\n>>>',
    });
    assert.equal(resDb.escalate, true);
    assert.match(resDb.answer, /no tengo permitido/i);
  });

  it('buildTurnPrompt incluye información visual cuando el cliente adjunta una imagen', () => {
    const fakeChat = { id: 'c2', title: 'Error en pantalla', status: 'BOT' } as unknown as Chat;
    const prompt = buildTurnPrompt({
      chat: fakeChat,
      user: { name: 'Carlos Facturador', email: 'carlos@ips.com' },
      message: 'Me sale este error al guardar la factura',
      imageUrl: '/uploads/img_error_123.png',
      transcript: [],
      isNewConversation: true,
    });

    assert.match(prompt, /IMAGEN ADJUNTA POR EL CLIENTE/i);
    assert.match(prompt, /\/uploads\/img_error_123\.png/);
    assert.match(prompt, /Me sale este error al guardar la factura/);
  });
});
