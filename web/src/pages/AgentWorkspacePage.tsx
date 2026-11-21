import { useState, useEffect, useRef, type FormEvent, type KeyboardEvent, type ClipboardEvent } from 'react';
import { api, getApiUrl } from '../lib/api';
import { formatRelative, formatTime } from '../lib/format';
import type { ClientEnvironment, StaffMessage, StaffSession } from '../lib/types';
import { BotIcon, CheckIcon, ImageIcon, PlayIcon, SearchIcon, SendIcon, SparkIcon, TrashIcon } from '../components/Icons';

function EditIcon({ width = 12, height = 12, className = '' }: { width?: number; height?: number; className?: string }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function RefreshIcon({ width = 12, height = 12, className = '' }: { width?: number; height?: number; className?: string }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

/**
 * Componente para renderizar bloques de código formateados con botón de copiar.
 */
function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="my-2.5 rounded-xl border border-slate-700/60 bg-slate-900 text-slate-100 font-mono text-[11.5px] overflow-hidden shadow-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/60 text-[10.5px] text-slate-400">
        <span className="uppercase font-semibold tracking-wider">{language || 'código'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-slate-300 hover:bg-slate-700/60 hover:text-white transition cursor-pointer"
        >
          {copied ? (
            <>
              <CheckIcon width={11} height={11} className="text-emerald-400" />
              <span className="text-emerald-400 font-bold">Copiado</span>
            </>
          ) : (
            'Copiar'
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto leading-relaxed whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Renderizador de Markdown técnico liviano y seguro sin dependencias externas.
 */
function FormattedMessage({ content }: { content: string }) {
  // 1. Separar bloques de código cercados con triple backtick
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-1.5 text-xs leading-relaxed break-words">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const match = part.match(/^```(\w+)?\r?\n([\s\S]*?)```$/);
          const lang = match?.[1] || '';
          const code = match ? match[2] : part.slice(3, -3);
          return <CodeBlock key={index} code={code.trim()} language={lang} />;
        }

        // Renderizar párrafos, encabezados, listas y texto con negrita
        const lines = part.split(/\r?\n/);
        return (
          <div key={index} className="space-y-1">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIdx} className="h-1.5" />;

              // Encabezados
              if (trimmed.startsWith('#### ')) {
                return (
                  <h4 key={lIdx} className="text-xs font-bold text-slate-900 dark:text-[#b2ebf2] mt-2 mb-0.5">
                    {trimmed.slice(5)}
                  </h4>
                );
              }
              if (trimmed.startsWith('### ')) {
                return (
                  <h3 key={lIdx} className="text-[13px] font-bold text-[#002b49] dark:text-[#80deea] mt-2.5 mb-1 pb-0.5 border-b border-slate-200/50 dark:border-white/10">
                    {trimmed.slice(4)}
                  </h3>
                );
              }

              // Listas con viñeta
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-1.5 pl-2 text-slate-700 dark:text-slate-300">
                    <span className="text-[#06a1b9] font-bold select-none">•</span>
                    <span>{renderInlineStyles(trimmed.slice(2))}</span>
                  </div>
                );
              }

              // Listas numeradas (ej. 1. , 2. )
              const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
              if (numMatch) {
                return (
                  <div key={lIdx} className="flex items-start gap-1.5 pl-2 text-slate-700 dark:text-slate-300">
                    <span className="text-[#06a1b9] font-bold text-[11px] select-none min-w-[14px]">
                      {numMatch[1]}.
                    </span>
                    <span>{renderInlineStyles(numMatch[2])}</span>
                  </div>
                );
              }

              // Citas / Blockquotes
              if (trimmed.startsWith('> ')) {
                return (
                  <blockquote
                    key={lIdx}
                    className="border-l-3 border-[#06a1b9] bg-slate-50 dark:bg-slate-800/40 pl-2.5 py-1 text-[11.5px] italic text-slate-600 dark:text-slate-300 rounded-r"
                  >
                    {renderInlineStyles(trimmed.slice(2))}
                  </blockquote>
                );
              }

              return (
                <p key={lIdx} className="text-slate-800 dark:text-[#e0f7fa]">
                  {renderInlineStyles(trimmed)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Procesa estilos inline como **negrita** y `código`.
 */
function renderInlineStyles(text: string) {
  // Separar código inline con `backticks` y negrita con **
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

  return tokens.map((token, i) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={i}
          className="rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1 py-0.5 text-[11px] font-mono text-cyan-800 dark:text-cyan-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={i} className="font-bold text-slate-900 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    return token;
  });
}

export function AgentWorkspacePage() {
  const [sessions, setSessions] = useState<StaffSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<StaffSession | null>(null);
  const [environments, setEnvironments] = useState<ClientEnvironment[]>([]);
  const [search, setSearch] = useState('');

  // Estados de entrada y envío
  const [inputText, setInputText] = useState('');
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string; serverUrl?: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sending, setSending] = useState(false);
  const [switchingEnv, setSwitchingEnv] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Modo Plan vs Modo Chat
  const [activeMode, setActiveMode] = useState<'CHAT' | 'PLAN'>('CHAT');
  const [executingPlanMessageId, setExecutingPlanMessageId] = useState<string | null>(null);

  // Modal para ver imagen en tamaño completo
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

  // Estados para edición manual de planes
  const [editingPlanMessageId, setEditingPlanMessageId] = useState<string | null>(null);
  const [editPlanForm, setEditPlanForm] = useState<{
    title: string;
    description: string;
    sql: string;
    filePath: string;
    replacementContent: string;
  }>({
    title: '',
    description: '',
    sql: '',
    filePath: '',
    replacementContent: '',
  });
  const [savingPlan, setSavingPlan] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. Cargar lista de sesiones y entornos
  useEffect(() => {
    loadSessions();
    loadEnvironments();
  }, []);

  // 2. Desplazar hacia abajo al recibir mensajes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeSession?.messages, sending]);

  async function loadSessions(selectId?: string) {
    try {
      const res = await api<{ sessions: StaffSession[] }>('/consultant/agent/sessions');
      setSessions(res.sessions);

      const targetId = selectId || activeSessionId || res.sessions[0]?.id;
      if (targetId) {
        loadSessionDetail(targetId);
      } else {
        // Si no hay ninguna sesión, crear una automáticamente
        handleNewSession(false);
      }
    } catch (err) {
      console.error('Error cargando sesiones:', err);
    }
  }

  async function loadEnvironments() {
    try {
      const res = await api<{ environments: ClientEnvironment[] }>('/consultant/environments');
      setEnvironments(res.environments);
    } catch (err) {
      console.error('Error cargando entornos:', err);
    }
  }

  async function loadSessionDetail(sessionId: string) {
    try {
      setActiveSessionId(sessionId);
      const res = await api<{ session: StaffSession }>(`/consultant/agent/sessions/${sessionId}`);
      setActiveSession(res.session);
    } catch (err) {
      console.error('Error cargando detalle de sesión:', err);
    }
  }

  async function handleNewSession(focusText = true) {
    try {
      const res = await api<{ session: StaffSession }>('/consultant/agent/sessions', {
        method: 'POST',
        body: { title: 'Nueva Consulta Técnica', environmentId: null },
      });
      setSessions((prev) => [res.session, ...prev]);
      setActiveSessionId(res.session.id);
      setActiveSession(res.session);
      setInputText('');
      setPendingImage(null);
      if (focusText) {
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al crear nueva sesión');
    }
  }

  async function handleDeleteSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm('¿Deseas eliminar esta sesión técnica?')) return;

    try {
      await api(`/consultant/agent/sessions/${sessionId}`, { method: 'DELETE' });
      const nextSessions = sessions.filter((s) => s.id !== sessionId);
      setSessions(nextSessions);
      if (activeSessionId === sessionId) {
        if (nextSessions.length > 0) {
          loadSessionDetail(nextSessions[0].id);
        } else {
          handleNewSession();
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar sesión');
    }
  }

  async function handleChangeEnvironment(environmentId: string | null) {
    if (!activeSessionId) return;
    setSwitchingEnv(true);
    try {
      const res = await api<{ session: { id: string; environmentId: string | null; environmentName: string } }>(
        `/consultant/agent/sessions/${activeSessionId}/environment`,
        {
          method: 'PUT',
          body: { environmentId },
        },
      );

      setActiveSession((prev) => (prev ? { ...prev, environmentId: res.session.environmentId, environmentName: res.session.environmentName } : null));
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId ? { ...s, environmentId: res.session.environmentId, environmentName: res.session.environmentName } : s,
        ),
      );

      setFeedbackToast(`Entorno cambiado a: ${res.session.environmentName}`);
      setTimeout(() => setFeedbackToast(null), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al cambiar entorno');
    } finally {
      setSwitchingEnv(false);
    }
  }

  async function processImageFile(file: File) {
    if (!file.type.startsWith('image/')) {
      alert('Solo se admiten archivos de imagen (PNG, JPG, WEBP, GIF)');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingImage({ file, previewUrl });
    setUploadingImage(true);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const dataUrl = await base64Promise;

      const uploadRes = await api<{ url: string; filename: string }>('/upload', {
        method: 'POST',
        body: { base64: dataUrl, filename: file.name },
      });

      setPendingImage((prev) => (prev ? { ...prev, serverUrl: uploadRes.url } : null));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo subir la imagen');
      setPendingImage(null);
    } finally {
      setUploadingImage(false);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void processImageFile(file);
          return;
        }
      }
    }
  }

  async function handleSend(e?: FormEvent) {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !pendingImage?.serverUrl) || sending || uploadingImage || !activeSessionId) return;

    const messageContent = inputText.trim();
    const messageImageUrl = pendingImage?.serverUrl || null;

    // Optimista: agregar mensaje del consultor inmediatamente
    const tempConsultantMsg: StaffMessage = {
      id: `temp-${Date.now()}`,
      role: 'CONSULTANT',
      content: messageContent,
      imageUrl: messageImageUrl,
      createdAt: new Date().toISOString(),
    };

    setActiveSession((prev) =>
      prev ? { ...prev, messages: [...(prev.messages || []), tempConsultantMsg] } : null,
    );

    setInputText('');
    setPendingImage(null);
    setSending(true);

    try {
      const res = await api<{
        consultantMessage: StaffMessage;
        agentMessage: StaffMessage;
      }>(`/consultant/agent/sessions/${activeSessionId}/messages`, {
        method: 'POST',
        body: {
          content: messageContent,
          imageUrl: messageImageUrl,
          mode: activeMode,
        },
      });

      setActiveSession((prev) => {
        if (!prev) return null;
        const filtered = (prev.messages || []).filter((m) => m.id !== tempConsultantMsg.id);
        return {
          ...prev,
          messages: [...filtered, res.consultantMessage, res.agentMessage],
        };
      });

      // Refrescar título y orden de sesiones
      void loadSessions(activeSessionId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al procesar la respuesta del agente');
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }

  async function handleExecutePlan(messageId: string, decision: 'APPROVE' | 'REJECT') {
    if (!activeSessionId) return;

    if (decision === 'APPROVE') {
      const confirmText = `¿Confirmas la ejecución de este plan en ${activeSession?.environmentName}? Se aplicarán las modificaciones en el servidor o base de datos correspondiente con respaldo de seguridad.`;
      if (!window.confirm(confirmText)) return;
    }

    setExecutingPlanMessageId(messageId);
    try {
      const res = await api<{
        id: string;
        planAction: NonNullable<StaffMessage['planAction']>;
        executionResult: NonNullable<StaffMessage['executionResult']>;
      }>(`/consultant/agent/sessions/${activeSessionId}/messages/${messageId}/execute-plan`, {
        method: 'POST',
        body: { decision },
      });

      setActiveSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          messages: (prev.messages || []).map((m) =>
            m.id === messageId ? { ...m, planAction: res.planAction, executionResult: res.executionResult } : m,
          ),
        };
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al ejecutar el plan');
    } finally {
      setExecutingPlanMessageId(null);
    }
  }

  function handleStartEditPlan(message: StaffMessage) {
    if (!message.planAction) return;
    setEditingPlanMessageId(message.id);
    setEditPlanForm({
      title: message.planAction.title || '',
      description: message.planAction.description || '',
      sql: message.planAction.sql || '',
      filePath: message.planAction.filePath || '',
      replacementContent: message.planAction.replacementContent || '',
    });
  }

  function handleCancelEditPlan() {
    setEditingPlanMessageId(null);
  }

  async function handleSaveEditedPlan(messageId: string) {
    if (!activeSessionId) return;
    setSavingPlan(true);
    try {
      const res = await api<{
        id: string;
        planAction: NonNullable<StaffMessage['planAction']>;
      }>(`/consultant/agent/sessions/${activeSessionId}/messages/${messageId}/plan`, {
        method: 'PATCH',
        body: editPlanForm,
      });

      setActiveSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          messages: (prev.messages || []).map((m) =>
            m.id === messageId ? { ...m, planAction: res.planAction } : m,
          ),
        };
      });
      setEditingPlanMessageId(null);
      setFeedbackToast('Plan modificado exitosamente');
      setTimeout(() => setFeedbackToast(null), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar los cambios del plan');
    } finally {
      setSavingPlan(false);
    }
  }

  function handlePromptAiToRestructurePlan(planTitle?: string) {
    setActiveMode('PLAN');
    const prefix = planTitle
      ? `Modifica el plan "${planTitle}" para que: `
      : 'Modifica el plan propuesto para que: ';
    setInputText(prefix);
    setTimeout(() => {
      textareaRef.current?.focus();
      if (textareaRef.current) {
        textareaRef.current.setSelectionRange(prefix.length, prefix.length);
      }
    }, 100);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.environmentName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex h-screen min-h-0 flex-1 overflow-hidden bg-slate-100 dark:bg-[#0a131f] text-slate-800 dark:text-[#E0F7FA]">
      {/* 1. Panel Lateral Izquierdo: Historial de Consultas Técnicas */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#0e1927] transition-colors">
        <div className="p-3.5 border-b border-slate-200 dark:border-[#1c2f48]">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h2 className="text-xs font-bold text-slate-900 dark:text-[#b2ebf2] flex items-center gap-1.5">
              <BotIcon width={16} height={16} className="text-[#06a1b9]" />
              Consultas Técnicas
            </h2>
            <button
              type="button"
              onClick={() => void handleNewSession()}
              className="inline-flex items-center gap-1 rounded-lg bg-[#06a1b9] hover:bg-[#00838f] text-white px-2.5 py-1 text-[11px] font-bold shadow-xs transition cursor-pointer"
            >
              + Nueva
            </button>
          </div>

          <div className="relative">
            <SearchIcon width={13} height={13} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar consulta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-[#1c2f48] bg-slate-50 dark:bg-[#111d2e] pl-8 pr-2.5 py-1 text-[11px] outline-hidden"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredSessions.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              No hay consultas técnicas registradas.
            </div>
          ) : (
            filteredSessions.map((session) => {
              const active = session.id === activeSessionId;

              return (
                <div
                  key={session.id}
                  onClick={() => loadSessionDetail(session.id)}
                  className={`group relative flex flex-col gap-1 rounded-xl p-2.5 text-xs transition cursor-pointer ${
                    active
                      ? 'bg-[#06a1b9]/15 dark:bg-[#06a1b9]/25 text-[#002b49] dark:text-[#b2ebf2] border border-[#06a1b9]/40 font-medium'
                      : 'hover:bg-slate-50 dark:hover:bg-[#111d2e] text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-semibold truncate text-[11.5px] pr-5" title={session.title}>
                      {session.title}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => void handleDeleteSession(session.id, e)}
                      title="Eliminar sesión"
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                    >
                      <TrashIcon width={12} height={12} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="truncate max-w-[150px] font-mono text-[#06a1b9] dark:text-[#80deea]">
                      {session.environmentId ? session.environmentName : 'Local'}
                    </span>
                    <span>{formatRelative(session.updatedAt)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* 2. Área Principal de Trabajo y Chat */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-[#0a131f]">
        {/* Cabecera del Espacio de Trabajo */}
        <header className="border-b border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#0e1927] px-6 py-3 transition-colors flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#002b49] to-[#06a1b9] text-white shadow-xs">
              <BotIcon width={20} height={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900 dark:text-[#b2ebf2]">
                  Agente Técnico SismaSalud
                </h1>
                <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 px-2 py-0.5 text-[9.5px] font-bold text-emerald-700 dark:text-emerald-300">
                  SIN RESTRICCIONES
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Copiloto senior para resolución técnica, análisis de código, consultas SQL y diagnóstico por imágenes.
              </p>
            </div>
          </div>

          {/* Selector de Entorno Activo */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Entorno:
            </label>
            <select
              value={activeSession?.environmentId || ''}
              onChange={(e) => void handleChangeEnvironment(e.target.value || null)}
              disabled={switchingEnv}
              className="rounded-xl border border-slate-200 dark:border-[#1c2f48] bg-slate-50 dark:bg-[#111d2e] px-3 py-1.5 text-xs font-semibold text-[#002b49] dark:text-[#b2ebf2] outline-hidden cursor-pointer"
            >
              <option value="">💻 Entorno Local (SismaSalud Base)</option>
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  🏥 {env.name} ({env.dbDatabase})
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* Notificación Toast Temporal */}
        {feedbackToast && (
          <div className="bg-[#06a1b9] text-white text-xs font-semibold px-4 py-1.5 text-center transition-all animate-fade-in flex items-center justify-center gap-1.5">
            <CheckIcon width={14} height={14} />
            {feedbackToast}
          </div>
        )}

        {/* Contenedor de Mensajes */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {!activeSession?.messages || activeSession.messages.length === 0 ? (
            <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-slate-300 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] p-8 text-center shadow-xs">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#06a1b9]/15 text-[#06a1b9] dark:text-[#80deea] mb-3">
                <SparkIcon width={28} height={28} />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-[#b2ebf2]">
                Espacio de Trabajo del Agente Técnico
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
                Este chat está diseñado exclusivamente para ti como <strong>consultor de soporte</strong>. El agente responde con profundidad técnica: proporciona queries SQL directas de corrección, nombres de tablas, análisis de controladores PHP y lectura visual de capturas de pantalla de errores.
              </p>

              <div className="mt-6 grid gap-2 sm:grid-cols-3 text-left">
                {[
                  'Revisar inconsistencias en sis_maes y sis_deta al liquidar factura',
                  'Diagnosticar error de bloqueo en citas y agenda médica',
                  'Consultar parámetros generales de contratos y validación de glosas',
                ].map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setInputText(prompt);
                      textareaRef.current?.focus();
                    }}
                    className="rounded-xl border border-slate-200 dark:border-[#1c2f48] bg-slate-50 dark:bg-[#0a131f] p-3 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:border-[#06a1b9] hover:text-[#06a1b9] transition cursor-pointer"
                  >
                    "{prompt}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            activeSession.messages.map((message) => {
              const isConsultant = message.role === 'CONSULTANT';

              return (
                <div
                  key={message.id}
                  className={`flex flex-col gap-1 ${isConsultant ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400 px-1">
                    <span>{isConsultant ? 'Tú (Consultor)' : 'Agente Técnico'}</span>
                    <span>·</span>
                    <span>{formatTime(message.createdAt)}</span>
                  </div>

                  <div
                    className={`rounded-2xl px-4 py-3 max-w-2xl shadow-xs leading-relaxed ${
                      isConsultant
                        ? 'rounded-tr-xs bg-[#002b49] text-white'
                        : 'rounded-tl-xs border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] text-slate-800 dark:text-[#e0f7fa]'
                    }`}
                  >
                    {/* Imagen adjunta en el mensaje */}
                    {message.imageUrl && (
                      <div className="mb-2.5">
                        <img
                          src={`${getApiUrl()}${message.imageUrl}`}
                          alt="Captura técnica"
                          onClick={() => setFullScreenImage(`${getApiUrl()}${message.imageUrl}`)}
                          className="max-h-60 max-w-full rounded-xl object-contain border border-white/20 dark:border-slate-700 cursor-pointer hover:opacity-90 transition"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          Click para ampliar captura
                        </span>
                      </div>
                    )}

                    {/* Contenido en Markdown formateado o texto */}
                    {isConsultant ? (
                      <p className="whitespace-pre-wrap text-xs">{message.content}</p>
                    ) : (
                      <>
                        <FormattedMessage content={message.content} />

                        {/* Tarjeta de Plan de Acción Propuesto (Build) */}
                        {message.planAction && (
                          <div className="mt-3.5 rounded-xl border border-[#06a1b9]/40 bg-[#f0f9fc] dark:bg-[#0d2232] p-3.5 text-slate-800 dark:text-[#e0f7fa]">
                            {editingPlanMessageId === message.id ? (
                              /* Modo Edición Manual Directa del Plan */
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between pb-1.5 border-b border-[#06a1b9]/30">
                                  <span className="text-xs font-bold text-[#002b49] dark:text-[#b2ebf2] flex items-center gap-1.5">
                                    <EditIcon width={13} height={13} className="text-[#06a1b9]" />
                                    Editar Parámetros del Plan
                                  </span>
                                  <span className="rounded-full bg-[#06a1b9]/20 px-2 py-0.5 text-[9.5px] font-bold text-[#006064] dark:text-[#80deea]">
                                    {message.planAction.type}
                                  </span>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-500 uppercase">Título del Plan</label>
                                  <input
                                    type="text"
                                    value={editPlanForm.title}
                                    onChange={(e) => setEditPlanForm((p) => ({ ...p, title: e.target.value }))}
                                    className="mt-0.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-[#06a1b9]"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-500 uppercase">Descripción</label>
                                  <textarea
                                    rows={2}
                                    value={editPlanForm.description}
                                    onChange={(e) => setEditPlanForm((p) => ({ ...p, description: e.target.value }))}
                                    className="mt-0.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-[#06a1b9]"
                                  />
                                </div>

                                {message.planAction.type === 'SQL' ? (
                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 uppercase">Sentencia SQL Ejecutable</label>
                                    <textarea
                                      rows={5}
                                      value={editPlanForm.sql}
                                      onChange={(e) => setEditPlanForm((p) => ({ ...p, sql: e.target.value }))}
                                      className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 font-mono text-[11px] text-emerald-400 focus:outline-hidden focus:border-[#06a1b9]"
                                      placeholder="UPDATE ..."
                                    />
                                  </div>
                                ) : (
                                  <>
                                    <div>
                                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Ruta de Archivo</label>
                                      <input
                                        type="text"
                                        value={editPlanForm.filePath}
                                        onChange={(e) => setEditPlanForm((p) => ({ ...p, filePath: e.target.value }))}
                                        className="mt-0.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-[#06a1b9]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-semibold text-slate-500 uppercase">Nuevo Contenido</label>
                                      <textarea
                                        rows={4}
                                        value={editPlanForm.replacementContent}
                                        onChange={(e) => setEditPlanForm((p) => ({ ...p, replacementContent: e.target.value }))}
                                        className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 font-mono text-[11px] text-emerald-400 focus:outline-hidden focus:border-[#06a1b9]"
                                      />
                                    </div>
                                  </>
                                )}

                                <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#06a1b9]/20">
                                  <button
                                    type="button"
                                    onClick={handleCancelEditPlan}
                                    disabled={savingPlan}
                                    className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveEditedPlan(message.id)}
                                    disabled={savingPlan}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#06a1b9] hover:bg-[#00838f] text-white px-3.5 py-1 text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
                                  >
                                    {savingPlan ? 'Guardando...' : '💾 Guardar Cambios'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Modo Visualización del Plan */
                              <>
                                <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-[#06a1b9]/20">
                                  <span className="text-[11.5px] font-bold text-[#002b49] dark:text-[#b2ebf2] flex items-center gap-1.5">
                                    <PlayIcon width={13} height={13} className="text-[#06a1b9]" />
                                    {message.planAction.title || 'Plan de Acción Propuesto'}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="rounded-full bg-[#06a1b9]/20 border border-[#06a1b9]/30 px-2 py-0.5 text-[9.5px] font-bold text-[#006064] dark:text-[#80deea]">
                                      {message.planAction.type === 'SQL' ? 'SCRIPT SQL (BD)' : 'MODIFICACIÓN DE ARCHIVOS'}
                                    </span>
                                    {message.planAction.status === 'PROPOSED' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditPlan(message)}
                                          title="Editar directamente la query o archivo"
                                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                                        >
                                          <EditIcon width={11} height={11} className="text-[#06a1b9]" />
                                          <span>Editar</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handlePromptAiToRestructurePlan(message.planAction?.title)}
                                          title="Pedir a la IA que reestructure el plan con cambios"
                                          className="inline-flex items-center gap-1 rounded-md border border-[#06a1b9]/40 bg-[#06a1b9]/15 px-2 py-0.5 text-[10px] font-semibold text-[#006064] dark:text-[#80deea] hover:bg-[#06a1b9]/25 transition cursor-pointer"
                                        >
                                          <RefreshIcon width={11} height={11} className="text-[#06a1b9]" />
                                          <span>Ajustar con IA</span>
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>

                                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                                  {message.planAction.description}
                                </p>

                                {message.planAction.sql && (
                                  <div className="mt-2.5 rounded-lg bg-slate-900 p-3 text-[11px] text-emerald-400 font-mono overflow-x-auto leading-relaxed border border-slate-700">
                                    <code>{message.planAction.sql}</code>
                                  </div>
                                )}

                                {message.planAction.filePath && (
                                  <div className="mt-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/60 p-2.5 text-[11px] font-mono text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                    <div className="text-[10px] text-slate-400 mb-1 font-sans">Archivo a modificar:</div>
                                    <span className="text-[#06a1b9] font-bold">{message.planAction.filePath}</span>
                                    {message.planAction.replacementContent && (
                                      <div className="mt-1.5 p-2 bg-slate-900 text-emerald-300 rounded text-[10.5px] overflow-x-auto">
                                        {message.planAction.replacementContent}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Botones de Ejecución / Estado del Plan */}
                                <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60">
                                  {message.planAction.status === 'PROPOSED' ? (
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-[10.5px] text-slate-500 italic">
                                        Listo para ejecutar en: <strong>{activeSession?.environmentName}</strong>
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => void handleExecutePlan(message.id, 'REJECT')}
                                          disabled={executingPlanMessageId === message.id}
                                          className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                        >
                                          Descartar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleExecutePlan(message.id, 'APPROVE')}
                                          disabled={executingPlanMessageId === message.id}
                                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#06a1b9] hover:bg-[#00838f] text-white px-3.5 py-1 text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
                                        >
                                          {executingPlanMessageId === message.id ? (
                                            <>
                                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                              <span>Ejecutando en entorno...</span>
                                            </>
                                          ) : (
                                            <>
                                              <PlayIcon width={12} height={12} />
                                              <span>⚡ Ejecutar Plan (Build)</span>
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  ) : message.planAction.status === 'EXECUTED' ? (
                                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 p-2 text-[11px] text-emerald-800 dark:text-emerald-200">
                                      <div className="flex items-center gap-1.5 font-bold mb-0.5">
                                        <CheckIcon width={13} height={13} />
                                        <span>Plan Ejecutado con Éxito (Build)</span>
                                      </div>
                                      <p className="text-[10.5px] opacity-90">{message.executionResult?.message}</p>
                                      {message.executionResult?.backupPath && (
                                        <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-mono mt-1">
                                          Respaldo seguro: {message.executionResult.backupPath}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-[10.5px] text-slate-400 italic">
                                      ✕ Este plan fue descartado por el consultor.
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Indicador de Pensando / Analizando */}
          {sending && (
            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#06a1b9]/15 text-[#06a1b9]">
                <BotIcon width={14} height={14} />
              </div>
              <div className="rounded-2xl rounded-tl-xs border border-[#06a1b9]/30 bg-white dark:bg-[#111d2e] p-3 text-xs text-slate-600 dark:text-slate-300 shadow-xs flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#06a1b9] animate-ping" />
                <span>
                  El Agente Técnico está inspeccionando la base de datos y el código fuente ({activeSession?.environmentName})...
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Barra de Entrada y Adjuntos */}
        <div className="border-t border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#0e1927] p-4">
          <div className="mx-auto max-w-4xl space-y-2">
            {/* Vista previa de imagen lista para enviar */}
            {pendingImage && (
              <div className="flex items-center gap-2.5 rounded-xl border border-[#06a1b9]/40 bg-[#06a1b9]/10 p-2 text-xs">
                <img
                  src={pendingImage.previewUrl}
                  alt="Vista previa"
                  className="h-12 w-12 rounded-lg object-cover border border-[#06a1b9]/30"
                />
                <div className="flex-1 truncate">
                  <p className="font-semibold text-slate-800 dark:text-[#b2ebf2] truncate">
                    {pendingImage.file.name}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {uploadingImage ? 'Subiendo imagen...' : 'Imagen lista para análisis técnico con el agente'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingImage(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                  title="Quitar imagen"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Selector de Modo: Consulta vs Plan & Build */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Modo:</span>
                <button
                  type="button"
                  onClick={() => setActiveMode('CHAT')}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                    activeMode === 'CHAT'
                      ? 'bg-[#002b49] text-white dark:bg-[#003d66] shadow-xs'
                      : 'bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-300/60'
                  }`}
                >
                  💬 Consulta
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('PLAN')}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                    activeMode === 'PLAN'
                      ? 'bg-[#06a1b9] text-white shadow-xs'
                      : 'bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-300/60'
                  }`}
                >
                  <PlayIcon width={11} height={11} />
                  📝 Plan & Build
                </button>
              </div>

              {activeMode === 'PLAN' ? (
                <span className="text-[10.5px] text-[#06a1b9] dark:text-[#80deea] font-medium flex items-center gap-1">
                  ⚡ La IA estructurará un plan con botón de ejecución directa (Build) en {activeSession?.environmentName}.
                </span>
              ) : (
                <span className="text-[10.5px] text-slate-400">
                  Modo conversación libre y análisis técnico sin restricciones.
                </span>
              )}
            </div>

            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-[#1c2f48] bg-slate-50 dark:bg-[#111d2e] p-2 focus-within:border-[#06a1b9] focus-within:ring-1 focus-within:ring-[#06a1b9]">
              {/* Input oculto para adjuntar archivo */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void processImageFile(file);
                }}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || uploadingImage}
                title="Adjuntar imagen / captura de pantalla técnica (o puedes pegarla con Ctrl+V)"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-[#06a1b9] transition cursor-pointer disabled:opacity-50"
              >
                <ImageIcon width={18} height={18} />
              </button>

              <textarea
                ref={textareaRef}
                rows={2}
                placeholder="Pregunta al agente técnico... (ej. '¿Qué consulta hago para ver inconsistencias en sis_maes?' o pega una captura con Ctrl+V)"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={sending}
                className="flex-1 resize-none bg-transparent py-1.5 text-xs text-slate-900 dark:text-white outline-hidden placeholder:text-slate-400 max-h-32"
              />

              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={(!inputText.trim() && !pendingImage?.serverUrl) || sending || uploadingImage}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#06a1b9] hover:bg-[#00838f] text-white shadow-xs transition cursor-pointer disabled:opacity-40"
              >
                <SendIcon width={16} height={16} />
              </button>
            </div>

            <div className="flex items-center justify-between px-1 text-[10.5px] text-slate-400">
              <span>Presiona <strong>Enter</strong> para enviar, <strong>Shift + Enter</strong> para salto de línea.</span>
              <span>Soporta pegar imágenes directo desde el portapapeles (<strong>Ctrl + V</strong>).</span>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Modal de Imagen en Tamaño Completo */}
      {fullScreenImage && (
        <div
          onClick={() => setFullScreenImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 cursor-zoom-out"
        >
          <div className="relative max-h-full max-w-full">
            <img
              src={fullScreenImage}
              alt="Captura ampliada"
              className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
            <button
              onClick={() => setFullScreenImage(null)}
              className="absolute top-2 right-2 rounded-full bg-black/60 p-2 text-white hover:bg-black/90 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
