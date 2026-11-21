export type AgentAnalysis = {
  summary: string;
  probableCause: string;
  suggestedSolution: string;
  missingInfo: string;
};

export type AgentTurnResult = {
  answer: string;
  escalate: boolean;
  analysis: AgentAnalysis;
  conversationId?: string;
  model?: string;
  partial?: boolean;
};

export type AgentTurnInput = {
  prompt: string;
  conversationId?: string | null;
  onDelta?: (text: string) => void;
  /** Se llama al iniciar cada intento (para reiniciar la vista previa en el cliente). */
  onStart?: () => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Directorios adicionales para agregar al espacio de trabajo del agente (--add-dir). */
  extraDirs?: string[];
  /** Solo para análisis: no se envía nada al cliente. */
  analysisOnly?: boolean;
};

export class AgentError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code = 'agent_error', retryable = true) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.retryable = retryable;
  }
}
