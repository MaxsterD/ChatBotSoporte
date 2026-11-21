import { prisma } from '../db';
import { badRequest } from '../lib/errors';

export interface BusinessHoursDTO {
  id: string;
  enabled: boolean;
  timezone: string;
  daysEnabled: number[]; // 0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  customMessage: string;
  scheduleText: string;
  updatedAt: Date;
}

export interface UpdateBusinessHoursInput {
  enabled?: boolean;
  timezone?: string;
  daysEnabled?: number[];
  startHour?: number;
  startMinute?: number;
  endHour?: number;
  endMinute?: number;
  customMessage?: string;
}

export interface BusinessHoursStatus {
  isOpen: boolean;
  enabled: boolean;
  timezone: string;
  currentTimeString: string;
  dayOfWeek: number;
  scheduleText: string;
  message: string;
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function formatTime12h(hour: number, minute: number): string {
  const period = hour >= 12 ? 'pm' : 'am';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const m = minute > 0 ? `:${String(minute).padStart(2, '0')}` : ':00';
  return `${h12}${m} ${period}`;
}

export function generateScheduleText(days: number[], startHour: number, startMinute: number, endHour: number, endMinute: number): string {
  if (!days || days.length === 0) return 'Cerrado temporalmente';

  const sorted = [...days].sort((a, b) => a - b);
  let daysStr = '';

  // Detección común: Lunes a Viernes (1,2,3,4,5)
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) {
    daysStr = 'Lunes a Viernes';
  } else if (sorted.length === 6 && sorted.every((d, i) => d === i + 1)) {
    daysStr = 'Lunes a Sábado';
  } else if (sorted.length === 7) {
    daysStr = 'Todos los días';
  } else {
    daysStr = sorted.map((d) => DAY_NAMES[d] || `Día ${d}`).join(', ');
  }

  const timeStr = `de ${formatTime12h(startHour, startMinute)} a ${formatTime12h(endHour, endMinute)}`;
  return `${daysStr} ${timeStr}`;
}

function parseDaysString(str: string): number[] {
  if (!str) return [1, 2, 3, 4, 5];
  return str
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !isNaN(n) && n >= 0 && n <= 6);
}

/**
 * Obtiene o crea la configuración inicial de horario de atención.
 */
export async function getBusinessHoursConfig(): Promise<BusinessHoursDTO> {
  let record = await prisma.businessHoursConfig.findUnique({
    where: { id: 'default' },
  });

  if (!record) {
    record = await prisma.businessHoursConfig.create({
      data: {
        id: 'default',
        enabled: true,
        timezone: 'America/Bogota',
        daysEnabled: '1,2,3,4,5',
        startHour: 8,
        startMinute: 0,
        endHour: 17,
        endMinute: 0,
        customMessage:
          'En estos momentos no hay servicio disponible. Vuelve a ponerte en contacto en nuestro horario de atención: Lunes a Viernes de 8:00 am a 5:00 pm.',
      },
    });
  }

  const days = parseDaysString(record.daysEnabled);
  const scheduleText = generateScheduleText(days, record.startHour, record.startMinute, record.endHour, record.endMinute);

  return {
    id: record.id,
    enabled: record.enabled,
    timezone: record.timezone,
    daysEnabled: days,
    startHour: record.startHour,
    startMinute: record.startMinute,
    endHour: record.endHour,
    endMinute: record.endMinute,
    customMessage: record.customMessage,
    scheduleText,
    updatedAt: record.updatedAt,
  };
}

/**
 * Actualiza la configuración de horario de atención (Solo Administrador).
 */
export async function updateBusinessHoursConfig(input: UpdateBusinessHoursInput): Promise<BusinessHoursDTO> {
  const current = await getBusinessHoursConfig();

  const days = input.daysEnabled !== undefined ? input.daysEnabled : current.daysEnabled;
  const startHour = input.startHour !== undefined ? input.startHour : current.startHour;
  const startMinute = input.startMinute !== undefined ? input.startMinute : current.startMinute;
  const endHour = input.endHour !== undefined ? input.endHour : current.endHour;
  const endMinute = input.endMinute !== undefined ? input.endMinute : current.endMinute;

  // Validaciones
  if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
    throw badRequest('Las horas deben estar entre 0 y 23');
  }
  if (startMinute < 0 || startMinute > 59 || endMinute < 0 || endMinute > 59) {
    throw badRequest('Los minutos deben estar entre 0 y 59');
  }
  const startMins = startHour * 60 + startMinute;
  const endMins = endHour * 60 + endMinute;
  if (startMins >= endMins) {
    throw badRequest('La hora de inicio debe ser anterior a la hora de fin');
  }

  const scheduleText = generateScheduleText(days, startHour, startMinute, endHour, endMinute);
  const defaultMsg = `En estos momentos no hay servicio disponible. Vuelve a ponerte en contacto en nuestro horario de atención: ${scheduleText}.`;

  const updated = await prisma.businessHoursConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      enabled: input.enabled ?? current.enabled,
      timezone: input.timezone ?? current.timezone,
      daysEnabled: days.join(','),
      startHour,
      startMinute,
      endHour,
      endMinute,
      customMessage: input.customMessage?.trim() || defaultMsg,
    },
    update: {
      enabled: input.enabled !== undefined ? input.enabled : current.enabled,
      timezone: input.timezone !== undefined ? input.timezone : current.timezone,
      daysEnabled: days.join(','),
      startHour,
      startMinute,
      endHour,
      endMinute,
      customMessage: input.customMessage !== undefined ? input.customMessage.trim() : current.customMessage,
    },
  });

  return {
    id: updated.id,
    enabled: updated.enabled,
    timezone: updated.timezone,
    daysEnabled: parseDaysString(updated.daysEnabled),
    startHour: updated.startHour,
    startMinute: updated.startMinute,
    endHour: updated.endHour,
    endMinute: updated.endMinute,
    customMessage: updated.customMessage,
    scheduleText,
    updatedAt: updated.updatedAt,
  };
}

/**
 * Extrae componentes de fecha en la zona horaria indicada.
 */
function getZonedTime(date: Date, timeZone: string) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    });
    const parts = dtf.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';

    const localDate = new Date(
      Date.UTC(
        Number(get('year')),
        Number(get('month')) - 1,
        Number(get('day')),
        Number(get('hour')),
        Number(get('minute')),
        Number(get('second')),
      ),
    );

    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    return {
      dayOfWeek: localDate.getUTCDay(),
      hour,
      minute,
      timeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
  } catch {
    // Fallback a hora local del servidor
    return {
      dayOfWeek: date.getDay(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      timeString: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
    };
  }
}

/**
 * Valida si el servicio de atención está actualmente abierto o cerrado.
 */
export async function checkBusinessHoursStatus(atDate: Date = new Date()): Promise<BusinessHoursStatus> {
  const config = await getBusinessHoursConfig();

  const zoned = getZonedTime(atDate, config.timezone);
  const currentTotalMins = zoned.hour * 60 + zoned.minute;
  const startTotalMins = config.startHour * 60 + config.startMinute;
  const endTotalMins = config.endHour * 60 + config.endMinute;

  // Si la restricción está deshabilitada, siempre está abierto
  if (!config.enabled) {
    return {
      isOpen: true,
      enabled: false,
      timezone: config.timezone,
      currentTimeString: zoned.timeString,
      dayOfWeek: zoned.dayOfWeek,
      scheduleText: config.scheduleText,
      message: 'Servicio 24/7 activo',
    };
  }

  const isDayEnabled = config.daysEnabled.includes(zoned.dayOfWeek);
  const isTimeInRange = currentTotalMins >= startTotalMins && currentTotalMins < endTotalMins;

  const isOpen = isDayEnabled && isTimeInRange;

  return {
    isOpen,
    enabled: true,
    timezone: config.timezone,
    currentTimeString: zoned.timeString,
    dayOfWeek: zoned.dayOfWeek,
    scheduleText: config.scheduleText,
    message: isOpen ? 'En horario de atención' : config.customMessage,
  };
}
