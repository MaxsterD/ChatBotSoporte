import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { useApiData } from '../hooks/useApiData';
import { api, resolveMediaUrl, uploadImage } from '../lib/api';
import { formatDateTime, formatRelative, formatTime, initials } from '../lib/format';
import type { ChatDetail } from '../lib/types';
import { AnalysisPanel } from './AnalysisPanel';
import { CopilotPanel } from './CopilotPanel';
import { ArrowLeftIcon, CheckIcon, CloseCircleIcon, ImageIcon, NoteIcon, SendIcon, SparkIcon, TrashIcon } from './Icons';
import { StatusBadge } from './StatusBadge';

export function Conversation({
  chatId,
  onBack,
}: {
  chatId: string;
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const { previews } = useRealtime();
  const { data, loading, error } = useApiData<ChatDetail | null>(
    `/consultant/chats/${chatId}`,
    null,
    [chatId],
  );
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [showCopilot, setShowCopilot] = useState(true);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const lastCount = useRef(0);
  const preview = previews[chatId];

  const chat = data?.chat;
  const messages = data?.messages ?? [];
  const notes = data?.notes ?? [];

  useEffect(() => {
    initialized.current = false;
    lastCount.current = 0;
  }, [chatId]);

  // Al abrir el chat se muestra el análisis desde arriba; después se sigue el final.
  useEffect(() => {
    if (!initialized.current) {
      if (messages.length === 0) return;
      initialized.current = true;
      lastCount.current = messages.length;
      scrollRef.current?.scrollTo({ top: 0 });
      return;
    }
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length]);

  useEffect(() => {
    if (!preview?.typing) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [preview?.preview, preview?.typing]);

  if (loading && !data) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        Cargando conversación…
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No se pudo abrir la conversación</p>
        <p className="text-xs text-slate-400">{error ?? 'Intenta de nuevo.'}</p>
      </div>
    );
  }

  const isMine = chat.consultant?.id === user?.id;
  const isStaffAdmin = user?.role === 'ADMIN';
  const assignedToOther = chat.status === 'ASSIGNED' && !isMine && !isStaffAdmin;
  const canReply = chat.status === 'ASSIGNED' && (isMine || isStaffAdmin);
  const canTake = chat.status === 'WAITING' || (chat.status === 'BOT' && !chat.consultant);
  const isClosed = chat.status === 'CLOSED';

  async function runAction(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : message);
    } finally {
      setBusy(false);
    }
  }

  function take() {
    void runAction(
      () => api(`/consultant/chats/${chatId}/take`, { method: 'POST' }),
      'No se pudo tomar el caso',
    );
  }

  function release() {
    if (!window.confirm('¿Devolver la conversación al agente? El cliente seguirá hablando con el bot.')) {
      return;
    }
    void runAction(
      () => api(`/consultant/chats/${chatId}/release`, { method: 'POST' }),
      'No se pudo devolver la conversación',
    );
  }

  function close() {
    if (!window.confirm('¿Cerrar definitivamente esta conversación?')) return;
    void runAction(
      () => api(`/consultant/chats/${chatId}/close`, { method: 'POST' }),
      'No se pudo cerrar la conversación',
    );
  }

  function deleteCurrentChat() {
    if (!window.confirm('¿Deseas eliminar definitivamente este chat? También se limpiará la conversación en Antigravity CLI.')) return;
    void runAction(
      async () => {
        await api(`/consultant/chats/${chatId}`, { method: 'DELETE' });
        if (onBack) onBack();
        else window.location.reload();
      },
      'No se pudo eliminar el chat',
    );
  }

  function handleImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function removeSelectedImage() {
    setSelectedImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const content = text.trim();
    if ((!content && !selectedImage) || sending) return;
    setSending(true);
    setActionError(null);
    try {
      if (mode === 'note') {
        if (!content) return;
        await api(`/consultant/chats/${chatId}/notes`, {
          method: 'POST',
          body: { content },
        });
        setShowNotes(true);
      } else {
        let imageUrl: string | undefined = undefined;
        if (selectedImage) {
          const uploadRes = await uploadImage(selectedImage);
          imageUrl = uploadRes.url;
        }
        await api(`/consultant/chats/${chatId}/messages`, {
          method: 'POST',
          body: { content, imageUrl },
        });
      }
      setText('');
      removeSelectedImage();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  }

  const hasEnvironment = Boolean(chat.environment);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-row overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-[#0e1927] transition-colors overflow-hidden">
        <header className="flex items-start gap-3 border-b border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#0e1927] px-5 py-3.5 transition-colors">
        {onBack && (
          <button
            onClick={onBack}
            className="mt-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-[#16253b] lg:hidden cursor-pointer"
          >
            <ArrowLeftIcon />
          </button>
        )}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#002b49] dark:bg-[#001726] border border-[#06a1b9]/30 text-xs font-bold text-white shadow-sm">
          {initials(chat.customer?.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-bold text-slate-900 dark:text-[#b2ebf2]">
              {chat.customer?.name ?? 'Cliente'}
            </h2>
            <StatusBadge status={chat.status} />
            {chat.status === 'WAITING' && chat.queuePosition && (
              <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800">
                posición #{chat.queuePosition}
              </span>
            )}
            {chat.status === 'ASSIGNED' && chat.consultant && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {isMine ? 'Asignada a ti' : `Asignada a ${chat.consultant.name}`}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {chat.title} · {chat.customer?.email}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {canTake && (
            <button
              onClick={take}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#06a1b9] dark:bg-[#00838f] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60 cursor-pointer"
            >
              <CheckIcon width={14} height={14} />
              Tomar caso
            </button>
          )}
          {canReply && (
            <>
              <button
                onClick={release}
                disabled={busy}
                className="rounded-lg border border-slate-200 dark:border-[#1c2f48] px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-[#16253b] disabled:opacity-60 cursor-pointer"
              >
                Devolver al bot
              </button>
              <button
                onClick={close}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-[#1c2f48] px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-[#16253b] disabled:opacity-60 cursor-pointer"
              >
                <CloseCircleIcon width={14} height={14} />
                Cerrar
              </button>
            </>
          )}
          {isClosed && (
            <span className="text-[11px] text-slate-400">
              Cerrada {formatRelative(chat.closedAt)}
            </span>
          )}
          {chat.environment && (
            <button
              type="button"
              onClick={() => setShowCopilot((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                showCopilot
                  ? 'border-[#06a1b9] bg-[#e0f7fa]/60 text-[#006064] dark:bg-[#006064]/40 dark:text-[#80deea]'
                  : 'border-slate-200 dark:border-[#1c2f48] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#16253b]'
              }`}
              title="Copiloto IA de Entorno"
            >
              <SparkIcon width={13} height={13} className="text-[#06a1b9] dark:text-[#80deea]" />
              <span>Copiloto ({chat.environment.name})</span>
            </button>
          )}
          <button
            type="button"
            onClick={deleteCurrentChat}
            disabled={busy}
            title="Eliminar chat y sincronizar con Antigravity CLI"
            className="rounded-lg border border-slate-200 dark:border-[#1c2f48] p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer disabled:opacity-50"
          >
            <TrashIcon width={14} height={14} />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 dark:bg-[#0a131f] px-4 py-4 transition-colors">
        <div className="mx-auto max-w-3xl space-y-4">
          {(chat.escalation || chat.status === 'WAITING' || chat.status === 'ASSIGNED') && (
            <AnalysisPanel chatId={chatId} />
          )}

          {notes.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30">
              <button
                onClick={() => setShowNotes((value) => !value)}
                className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[12px] font-semibold text-amber-900 dark:text-amber-200 cursor-pointer"
              >
                <NoteIcon width={14} height={14} />
                Notas internas ({notes.length})
                <span className="ml-auto text-[10px] font-normal text-amber-700 dark:text-amber-400">
                  {showNotes ? 'ocultar' : 'ver'}
                </span>
              </button>
              {showNotes && (
                <ul className="space-y-1.5 border-t border-amber-200/70 dark:border-amber-800/60 px-3.5 py-2.5">
                  {notes.map((note) => (
                    <li key={note.id} className="text-[12px] text-amber-900 dark:text-amber-200">
                      <span className="font-semibold">{note.author?.name ?? 'Consultor'}:</span>{' '}
                      {note.content}
                      <span className="ml-1.5 text-[10px] text-amber-700 dark:text-amber-400">
                        {formatRelative(note.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {messages.length === 0 && (
            <p className="py-8 text-center text-xs text-slate-400">Sin mensajes todavía.</p>
          )}

          <div className="space-y-3">
            {messages.map((message) => {
              if (message.authorType === 'SYSTEM') {
                return (
                  <div key={message.id} className="flex justify-center">
                    <p className="max-w-[80%] rounded-full bg-slate-200/70 dark:bg-slate-800 px-3 py-1 text-center text-[11px] text-slate-600 dark:text-slate-300">
                      {message.content}
                    </p>
                  </div>
                );
              }

              const fromCustomer = message.authorType === 'USER';
              const fromConsultant = message.authorType === 'CONSULTANT';
              const fromBot = message.authorType === 'BOT';
              const alignRight = fromConsultant;

              return (
                <div
                  key={message.id}
                  className={`flex gap-2 ${alignRight ? 'justify-end' : 'justify-start'}`}
                >
                  {!alignRight && (
                    <div
                      className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        fromBot ? 'bg-[#06a1b9] dark:bg-[#00838f] text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {fromBot ? 'AI' : initials(chat.customer?.name)}
                    </div>
                  )}
                  <div className={`max-w-[78%] ${alignRight ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-sm ${
                        fromCustomer
                          ? 'rounded-tl-sm border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] text-slate-800 dark:text-[#e0f7fa]'
                          : fromBot
                            ? 'rounded-tl-sm border border-[#b2ebf2] dark:border-[#006064] bg-[#e0f7fa]/70 dark:bg-[#0e2a3a] text-slate-800 dark:text-[#b2ebf2]'
                            : 'rounded-tr-sm bg-[#06a1b9] dark:bg-[#00838f] text-white'
                      }`}
                    >
                      {message.imageUrl && (
                        <div className="mb-2 overflow-hidden rounded-xl">
                          <a
                            href={resolveMediaUrl(message.imageUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="block cursor-pointer transition hover:opacity-90"
                            title="Ver imagen completa"
                          >
                            <img
                              src={resolveMediaUrl(message.imageUrl)}
                              alt="Adjunto"
                              className="max-h-72 w-auto max-w-full rounded-lg object-contain bg-black/5 dark:bg-black/20"
                              loading="lazy"
                            />
                          </a>
                        </div>
                      )}
                      {message.content ? <p className="whitespace-pre-wrap">{message.content}</p> : null}
                    </div>
                    <p
                      className={`mt-1 text-[10px] text-slate-400 dark:text-slate-500 ${
                        alignRight ? 'text-right' : 'text-left'
                      }`}
                    >
                      {fromBot ? 'Agente · ' : fromCustomer ? '' : 'Asesor · '}
                      {formatTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}

            {preview?.typing && (
              <div className="flex justify-start gap-2">
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#06a1b9] dark:bg-[#00838f] text-[10px] font-bold text-white">
                  AI
                </div>
                <div className="max-w-[78%]">
                  <div className="rounded-2xl rounded-tl-sm border border-[#b2ebf2] dark:border-[#006064] bg-[#e0f7fa]/60 dark:bg-[#0e2a3a] px-3.5 py-2 text-[13px] text-slate-700 dark:text-[#b2ebf2] shadow-sm">
                    {preview.preview ? (
                      <p className="whitespace-pre-wrap">{preview.preview}</p>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#06a1b9] dark:bg-[#80deea]" />
                        <span
                          className="typing-dot h-1.5 w-1.5 rounded-full bg-[#06a1b9] dark:bg-[#80deea]"
                          style={{ animationDelay: '0.15s' }}
                        />
                        <span
                          className="typing-dot h-1.5 w-1.5 rounded-full bg-[#06a1b9] dark:bg-[#80deea]"
                          style={{ animationDelay: '0.3s' }}
                        />
                        <span className="ml-1 text-[11px] text-[#06a1b9] dark:text-[#80deea]">
                          el agente está escribiendo…
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      <footer className="border-t border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#0e1927] px-4 py-3 transition-colors">
        {actionError && (
          <div className="mb-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
            {actionError}
          </div>
        )}
        {isClosed ? (
          <p className="py-1 text-center text-xs text-slate-400">
            Esta conversación está cerrada. El cliente debe abrir una nueva.
          </p>
        ) : assignedToOther ? (
          <p className="py-1 text-center text-xs text-slate-400">
            {chat.consultant?.name} tiene asignada esta conversación. Solo esa persona puede responder.
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-1 text-[11px] font-semibold">
              <button
                onClick={() => setMode('reply')}
                className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                  mode === 'reply'
                    ? 'bg-[#e0f7fa] dark:bg-[#006064]/50 text-[#006064] dark:text-[#b2ebf2]'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#16253b]'
                }`}
              >
                Responder al cliente
              </button>
              <button
                onClick={() => setMode('note')}
                className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                  mode === 'note'
                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#16253b]'
                }`}
              >
                Nota interna
              </button>
              {chat.status === 'WAITING' && (
                <span className="ml-auto text-[10px] font-normal text-amber-600 dark:text-amber-400">
                  Al enviar se toma el caso automáticamente
                </span>
              )}
            </div>

            {imagePreview && (
              <div className="mb-2 relative inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-[#1c2f48] bg-slate-50 dark:bg-[#111d2e] p-1.5 pr-3 shadow-xs">
                <img src={imagePreview} alt="Adjunto" className="h-10 w-10 rounded-lg object-cover" />
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate max-w-[200px]">
                    {selectedImage?.name}
                  </span>
                  <span className="text-[10px] text-slate-400">Imagen lista para enviar</span>
                </div>
                <button
                  type="button"
                  onClick={removeSelectedImage}
                  className="ml-2 rounded-full p-1 text-slate-400 hover:text-rose-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                  title="Quitar imagen"
                >
                  <CloseCircleIcon width={16} height={16} />
                </button>
              </div>
            )}

            <form onSubmit={submit} className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              {mode === 'reply' && (
                <button
                  type="button"
                  disabled={sending || !canReply}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] text-slate-500 dark:text-slate-400 hover:text-[#06a1b9] dark:hover:text-[#80deea] hover:border-[#06a1b9] dark:hover:border-[#00838f] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  title="Adjuntar imagen (captura de pantalla, guía o error)"
                >
                  <ImageIcon width={18} height={18} />
                </button>
              )}
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                rows={1}
                disabled={sending || !canReply}
                placeholder={
                  canReply
                    ? mode === 'note'
                      ? 'Nota interna (el cliente no la ve)…'
                      : selectedImage
                        ? 'Agrega un detalle o explicación para la imagen (opcional)…'
                        : 'Escribe tu respuesta al cliente…'
                    : 'Toma el caso para responder…'
                }
                className={`max-h-40 min-h-[42px] flex-1 resize-none rounded-xl border px-3.5 py-2.5 text-[13px] outline-none transition ${
                  mode === 'note'
                    ? 'border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 focus:border-amber-400'
                    : 'border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#111d2e] text-slate-800 dark:text-[#e0f7fa] placeholder-slate-400 dark:placeholder-slate-500 focus:border-[#06a1b9]'
                }`}
              />
              <button
                type="submit"
                disabled={sending || (!text.trim() && !selectedImage) || (mode === 'reply' && !canReply)}
                className={`inline-flex h-[42px] items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
                  mode === 'note' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-[#06a1b9] dark:bg-[#00838f] hover:bg-[#058a9e]'
                }`}
              >
                <SendIcon width={15} height={15} />
                {sending ? 'Enviando' : mode === 'note' ? 'Guardar' : 'Enviar'}
              </button>
            </form>
            {chat.status === 'BOT' && !chat.consultant && (
              <p className="mt-1.5 text-[10px] text-slate-400">
                El agente está a cargo. Puedes tomar el caso cuando quieras.
              </p>
            )}
          </>
        )}
        <p className="mt-1 text-right text-[10px] text-slate-300 dark:text-slate-500">
          Última actividad {formatDateTime(chat.lastMessageAt)}
        </p>
      </footer>
    </div>

    {hasEnvironment && showCopilot && chat.environment && (
      <CopilotPanel
        chatId={chatId}
        environment={chat.environment}
        onClose={() => setShowCopilot(false)}
      />
    )}
  </div>
);
}

export function EmptyConversation() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-slate-50/50 dark:bg-[#0a131f] p-10 text-center transition-colors">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white dark:bg-[#111d2e] text-[#06a1b9] dark:text-[#80deea] shadow-sm ring-1 ring-slate-200 dark:ring-[#1c2f48]">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5H8L3 21l1.3-4.2A8.5 8.5 0 1 1 21 12Z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-[#b2ebf2]">Selecciona una conversación</p>
        <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
          Aquí verás el historial completo, el análisis del agente y podrás tomar el caso para
          responder en tiempo real.
        </p>
      </div>
    </div>
  );
}
