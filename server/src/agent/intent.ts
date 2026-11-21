const HUMAN_PATTERNS: RegExp[] = [
  /(?:hablar|comunicar|chatear|conversar)\s+con\s+(?:un|una|el|la)?\s*(?:asesor|asesora|consultor|consultora|humano|humana|persona|alguien|soporte\s+humano|agente\s+humano)/,
  /(?:quiero|necesito|solicito|requiero|pásame|pasame|comunícame|comunicame|transfiereme|transfiéreme)\s+(?:con\s+)?(?:un|una|el|la)?\s*(?:asesor|asesora|consultor|consultora|humano|humana|persona\s+real|agente\s+humano|soporte\s+humano)/,
  /(?:atención|atencion|apoyo|soporte)\s+(?:humana|humano|personalizada|personalizado)/,
  /(?:persona|alguien)\s+(?:real|de\s+verdad)/,
  /no\s+quiero\s+(?:hablar\s+)?(?:con\s+)?(?:el\s+)?bot/,
];

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Detecta si el usuario pidió explícitamente un asesor humano. */
export function userWantsHuman(message: string) {
  const text = normalizeText(message);
  return HUMAN_PATTERNS.some((pattern) => pattern.test(text));
}

const CLOSING_PATTERNS = [
  /^(gracias|muchas gracias|listo|ok|vale|perfecto|quedó claro|quedo claro)[.!]*$/,
  /^(eso es todo|nada mas|nada más|ya esta|ya está)[.!]*$/,
];

export function isClosingMessage(message: string) {
  const text = normalizeText(message);
  return CLOSING_PATTERNS.some((pattern) => pattern.test(text));
}

/** Detecta si un mensaje del bot contiene una pregunta ofreciendo contactar a un asesor humano. */
export function isOfferingHumanQuestion(message: string): boolean {
  if (!message) return false;
  const text = normalizeText(message);
  const hasHumanReference = /\b(asesor|asesora|consultor|consultora|humano|humana|persona|soporte humano)\b/.test(text);
  if (!hasHumanReference) return false;

  const hasQuestionPattern =
    /[¿?]/.test(message) ||
    /\b(deseas|desea|quieres|quiere|prefieres|prefiere|te gustaria|le gustaria|te comunico|te transfiero|comunico|transfiero|te paso|le paso)\b/.test(text);

  return hasQuestionPattern;
}

/** Detecta respuestas afirmativas directas del cliente ante una pregunta u ofrecimiento. */
export function isAffirmativeResponse(message: string): boolean {
  if (!message) return false;
  const text = normalizeText(message);
  return (
    /^(si|si por favor|por favor|claro|claro que si|dale|de una|bueno|ok|porfa|conectame|comunicame|transfiereme)[.!]?$/.test(text) ||
    /^si,?\s+(por favor|gracias|conectame|comunicame|transfiereme|hazlo|procede|claro)/.test(text)
  );
}
