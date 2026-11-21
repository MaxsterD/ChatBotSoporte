import { useState, useEffect, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApiData } from '../hooks/useApiData';
import { api } from '../lib/api';
import type { BusinessHoursConfig, BusinessHoursStatus } from '../lib/types';
import { CheckIcon, ClockIcon, RefreshIcon } from '../components/Icons';

const DAY_OPTIONS = [
  { day: 1, label: 'Lunes', short: 'Lun' },
  { day: 2, label: 'Martes', short: 'Mar' },
  { day: 3, label: 'Miércoles', short: 'Mié' },
  { day: 4, label: 'Jueves', short: 'Jue' },
  { day: 5, label: 'Viernes', short: 'Vie' },
  { day: 6, label: 'Sábado', short: 'Sáb' },
  { day: 0, label: 'Domingo', short: 'Dom' },
];

const TIMEZONE_OPTIONS = [
  { value: 'America/Bogota', label: 'Colombia / Perú / Ecuador (UTC-5 - America/Bogota)' },
  { value: 'America/Mexico_City', label: 'México (UTC-6 - America/Mexico_City)' },
  { value: 'America/Caracas', label: 'Venezuela (UTC-4 - America/Caracas)' },
  { value: 'America/Santiago', label: 'Chile (UTC-4 - America/Santiago)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (UTC-3 - America/Buenos_Aires)' },
  { value: 'UTC', label: 'Tiempo Universal Coordinado (UTC)' },
];

function formatTime12h(hour: number, minute: number): string {
  const period = hour >= 12 ? 'pm' : 'am';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const m = minute > 0 ? `:${String(minute).padStart(2, '0')}` : ':00';
  return `${h12}${m} ${period}`;
}

export function BusinessHoursPage() {
  const { user } = useAuth();
  if (user && user.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  const [refreshKey, setRefreshKey] = useState(0);

  const { data, loading } = useApiData<{
    config: BusinessHoursConfig | null;
    status: BusinessHoursStatus | null;
  }>('/consultant/business-hours', { config: null, status: null }, [refreshKey]);

  // Form states
  const [enabled, setEnabled] = useState(true);
  const [timezone, setTimezone] = useState('America/Bogota');
  const [daysEnabled, setDaysEnabled] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startHour, setStartHour] = useState(8);
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState(17);
  const [endMinute, setEndMinute] = useState(0);
  const [customMessage, setCustomMessage] = useState('');

  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Sincronizar estados locales al cargar datos
  useEffect(() => {
    if (data.config) {
      setEnabled(data.config.enabled);
      setTimezone(data.config.timezone);
      setDaysEnabled(data.config.daysEnabled);
      setStartHour(data.config.startHour);
      setStartMinute(data.config.startMinute);
      setEndHour(data.config.endHour);
      setEndMinute(data.config.endMinute);
      setCustomMessage(data.config.customMessage);
    }
  }, [data.config]);

  function toggleDay(day: number) {
    if (daysEnabled.includes(day)) {
      if (daysEnabled.length === 1) {
        alert('Debe haber al menos un día habilitado si la restricción está activa');
        return;
      }
      setDaysEnabled(daysEnabled.filter((d) => d !== day));
    } else {
      setDaysEnabled([...daysEnabled, day].sort((a, b) => a - b));
    }
  }

  function applyPreset(days: number[]) {
    setDaysEnabled(days);
  }

  function handleGenerateDefaultMessage() {
    let daysStr = '';
    const sorted = [...daysEnabled].sort((a, b) => a - b);
    if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) {
      daysStr = 'Lunes a Viernes';
    } else if (sorted.length === 6 && sorted.every((d, i) => d === i + 1)) {
      daysStr = 'Lunes a Sábado';
    } else if (sorted.length === 7) {
      daysStr = 'Todos los días';
    } else {
      daysStr = sorted.map((d) => DAY_OPTIONS.find((o) => o.day === d)?.label || `Día ${d}`).join(', ');
    }
    const timeStr = `${formatTime12h(startHour, startMinute)} a ${formatTime12h(endHour, endMinute)}`;
    setCustomMessage(
      `En estos momentos no hay servicio disponible. Vuelve a ponerte en contacto en nuestro horario de atención: ${daysStr} de ${timeStr}.`,
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const startMins = startHour * 60 + startMinute;
    const endMins = endHour * 60 + endMinute;
    if (startMins >= endMins) {
      setFormError('La hora de inicio debe ser anterior a la hora de fin');
      setSaving(false);
      return;
    }

    try {
      await api('/consultant/business-hours', {
        method: 'PUT',
        body: {
          enabled,
          timezone,
          daysEnabled,
          startHour,
          startMinute,
          endHour,
          endMinute,
          customMessage: customMessage.trim(),
        },
      });

      setSuccessToast('Horario de atención guardado y aplicado correctamente');
      setTimeout(() => setSuccessToast(null), 3500);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar horario');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-[#0a131f] p-6 text-slate-800 dark:text-[#E0F7FA] transition-colors">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Encabezado */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-slate-200 dark:border-[#1c2f48] pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#06a1b9]/15 text-[#06a1b9] dark:bg-[#006064]/40 dark:text-[#80deea]">
                <ClockIcon width={22} height={22} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Horario de Atención</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Controla en qué horarios los clientes de las clínicas pueden abrir chats de soporte.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111d2e] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <RefreshIcon width={13} height={13} className={loading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
        </div>

        {/* Notificación de éxito */}
        {successToast && (
          <div className="rounded-xl border border-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 p-3.5 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2 shadow-xs">
            <CheckIcon width={16} height={16} className="text-emerald-500 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {/* Panel de Estado en Vivo */}
        {data.status && (
          <div
            className={`rounded-2xl border p-4.5 shadow-xs transition-colors ${
              !data.status.enabled
                ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111d2e]'
                : data.status.isOpen
                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30'
                : 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30'
            }`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      !data.status.enabled
                        ? 'bg-slate-400'
                        : data.status.isOpen
                        ? 'bg-emerald-500 animate-pulse'
                        : 'bg-amber-500'
                    }`}
                  />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    {!data.status.enabled
                      ? 'Restricción Desactivada (Atención 24/7)'
                      : data.status.isOpen
                      ? 'Servicio Actualmente Disponible'
                      : 'Servicio Actualmente Fuera de Horario'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Horario configurado: <strong>{data.status.scheduleText}</strong>
                </p>
              </div>

              <div className="rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-right">
                <div className="text-[10.5px] text-slate-400">Hora actual en {data.status.timezone}:</div>
                <div className="text-sm font-mono font-bold text-slate-800 dark:text-slate-100">
                  {data.status.currentTimeString}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Formulario de Configuración */}
        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-200 dark:border-[#1c2f48] bg-white dark:bg-[#0e1927] p-6 shadow-sm">
          {formError && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/60 p-3 text-xs text-rose-700 dark:text-rose-200">
              {formError}
            </div>
          )}

          {/* 1. Interruptor General */}
          <div className="flex items-center justify-between pb-5 border-b border-slate-200 dark:border-[#1c2f48]">
            <div className="space-y-0.5">
              <label htmlFor="enabled-toggle" className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer">
                Activar restricción de horario
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Al estar activo, los clientes móviles no podrán crear nuevos chats fuera del horario establecido.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                id="enabled-toggle"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#06a1b9]"></div>
            </label>
          </div>

          {/* 2. Días de la semana */}
          <div className="space-y-2.5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Días de Atención Habilitados
              </label>
              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => applyPreset([1, 2, 3, 4, 5])}
                  className="rounded px-2 py-0.5 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Lun - Vie
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset([1, 2, 3, 4, 5, 6])}
                  className="rounded px-2 py-0.5 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Lun - Sáb
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset([0, 1, 2, 3, 4, 5, 6])}
                  className="rounded px-2 py-0.5 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Todos
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {DAY_OPTIONS.map((item) => {
                const isSelected = daysEnabled.includes(item.day);
                return (
                  <button
                    key={item.day}
                    type="button"
                    onClick={() => toggleDay(item.day)}
                    className={`flex flex-col items-center justify-center rounded-xl p-2.5 border text-xs font-semibold transition cursor-pointer ${
                      isSelected
                        ? 'border-[#06a1b9] bg-[#06a1b9]/15 text-[#006064] dark:text-[#80deea]'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{item.short}</span>
                    <span className="text-[10px] font-normal opacity-80">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Rango de Horarios */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Hora de Apertura */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 p-3.5 space-y-2 bg-slate-50/50 dark:bg-slate-900/40">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Hora de Inicio (Apertura)
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Hora (0 - 23)</span>
                  <select
                    value={startHour}
                    onChange={(e) => setStartHour(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-[#06a1b9]"
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}:00 ({formatTime12h(h, 0)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-24">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Minutos</span>
                  <select
                    value={startMinute}
                    onChange={(e) => setStartMinute(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-[#06a1b9]"
                  >
                    {[0, 15, 30, 45].map((m) => (
                      <option key={m} value={m}>
                        :{String(m).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="text-[11px] text-[#06a1b9] font-medium pt-1">
                Abre a las: <strong>{formatTime12h(startHour, startMinute)}</strong>
              </div>
            </div>

            {/* Hora de Cierre */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 p-3.5 space-y-2 bg-slate-50/50 dark:bg-slate-900/40">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Hora de Fin (Cierre)
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Hora (0 - 23)</span>
                  <select
                    value={endHour}
                    onChange={(e) => setEndHour(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-[#06a1b9]"
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}:00 ({formatTime12h(h, 0)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-24">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Minutos</span>
                  <select
                    value={endMinute}
                    onChange={(e) => setEndMinute(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-[#06a1b9]"
                  >
                    {[0, 15, 30, 45].map((m) => (
                      <option key={m} value={m}>
                        :{String(m).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="text-[11px] text-[#06a1b9] font-medium pt-1">
                Cierra a las: <strong>{formatTime12h(endHour, endMinute)}</strong>
              </div>
            </div>
          </div>

          {/* 4. Zona Horaria */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Zona Horaria
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-[#06a1b9]"
            >
              {TIMEZONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Mensaje de Alerta al Cliente */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Mensaje de Alerta para el Cliente
              </label>
              <button
                type="button"
                onClick={handleGenerateDefaultMessage}
                className="text-[11px] text-[#06a1b9] hover:underline font-medium cursor-pointer"
              >
                Regenerar texto automático
              </button>
            </div>
            <textarea
              rows={3}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="En estos momentos no hay servicio disponible. Vuelve a ponerte en contacto en nuestro horario de atención..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-[#06a1b9] leading-relaxed"
            />
            <p className="text-[11px] text-slate-400">
              Este mensaje es el que aparecerá en un cuadro de diálogo cuando el cliente intente abrir una nueva conversación fuera del horario configurado.
            </p>
          </div>

          {/* Botón Guardar */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-[#1c2f48]">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#06a1b9] hover:bg-[#00838f] text-white px-5 py-2.5 text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Guardando horario...</span>
                </>
              ) : (
                <>
                  <CheckIcon width={14} height={14} />
                  <span>Guardar Horario de Atención</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
