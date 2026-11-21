/** Quita ruido técnico de las respuestas del agente antes de mostrarlas al cliente. */
export function sanitizeAgentText(text: string) {
  return text
    // Enlaces markdown a archivos locales -> solo el texto
    .replace(/\[([^\]]+)\]\(file:\/\/\/[^)]*\)/gi, '$1')
    // Enlaces markdown a rutas absolutas -> solo el texto
    .replace(/\[([^\]]+)\]\([A-Za-z]:\\[^)]*\)/g, '$1')
    // URLs file:// sueltas
    .replace(/file:\/\/\/\S+/gi, '')
    // Rutas absolutas de Windows sueltas
    .replace(/[A-Za-z]:\\(?:[^\s)\]"']+)/g, '')
    // Restos de bloques JSON que se hayan colado
    .replace(/```json\s*\{[\s\S]*?\}\s*```/gi, '')
    .replace(/```\s*\{[\s\S]*?"escalate"[\s\S]*?\}\s*```/gi, '')
    // Espacios y saltos de línea excesivos
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function clipText(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
