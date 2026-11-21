// Colores exactos extraídos directamente de SismaSalud (sis_themes y sis_theme_details)
// Tema: 'Cyan' (Tema oficial activo de SismaSalud)

export const sismaColorsLight = {
  // Mode = 1 (Diurno / Claro)
  primary: '#06A1B9',
  secondary: '#3C6885',
  tertiary: '#80DEEA',
  quaternary: '#B2EBF2',
  quintary: '#E0F7FA',
  textTitle: '#006064',
  textParagraph: '#0f2438',
  iconColor: '#006064',
  contentBg: '#f0f4f8',

  background: '#f0f4f8',
  surface: '#ffffff',
  surfaceSecondary: '#f8fafc',
  border: '#d1e1ec',
  borderSoft: '#e5eef5',
  text: '#0f2438',
  muted: '#536b82',
  faint: '#8ca2b7',

  // Sisma Navy corporativo
  primaryDark: '#002b49',
  navy: '#002b49',
  navyCard: '#001d32',

  // Burbujas de chat
  bubbleUser: '#06A1B9',
  bubbleUserText: '#ffffff',
  bubbleBot: '#e0f7fa',
  bubbleBotBorder: '#b2ebf2',
  bubbleBotText: '#006064',
  bubbleConsultant: '#002b49',
  bubbleConsultantText: '#ffffff',

  // Controles
  inputBg: '#ffffff',
  inputBorder: '#d1e1ec',
  inputText: '#0f2438',
  headerBg: '#ffffff',
  headerBorder: '#d1e1ec',

  // Semánticos
  sismaGreen: '#8fb838',
  amber: '#b45309',
  amberSoft: '#fef3c7',
  amberBorder: '#fde68a',
  emerald: '#047857',
  emeraldSoft: '#d1fae5',
  emeraldBorder: '#a7f3d0',
  sky: '#0284c7',
  skySoft: '#e0f2fe',
  skyBorder: '#bae6fd',
  slateSoft: '#e2e8f0',
  rose: '#be123c',
  roseSoft: '#ffe4e6',
  white: '#ffffff',
};

export const sismaColorsDark = {
  // Mode = 0 (Nocturno / Oscuro)
  primary: '#00ACC1',
  secondary: '#00838F',
  tertiary: '#0097A7',
  quaternary: '#006064',
  quintary: '#008CA18A',
  textTitle: '#B2EBF2',
  textParagraph: '#E0F7FA',
  iconColor: '#B2EBF2',
  contentBg: '#0a131f',

  background: '#0a131f',
  surface: '#111d2e',
  surfaceSecondary: '#16253b',
  border: '#1c2f48',
  borderSoft: '#18283d',
  text: '#E0F7FA',
  muted: '#829cb5',
  faint: '#577089',

  // Sisma Navy corporativo
  primaryDark: '#001726',
  navy: '#001726',
  navyCard: '#00101d',

  // Burbujas de chat
  bubbleUser: '#00838f',
  bubbleUserText: '#ffffff',
  bubbleBot: '#0e2a3a',
  bubbleBotBorder: '#006064',
  bubbleBotText: '#b2ebf2',
  bubbleConsultant: '#001f36',
  bubbleConsultantText: '#ffffff',

  // Controles
  inputBg: '#16253b',
  inputBorder: '#1c2f48',
  inputText: '#E0F7FA',
  headerBg: '#0e1927',
  headerBorder: '#1c2f48',

  // Semánticos
  sismaGreen: '#8fb838',
  amber: '#d97706',
  amberSoft: '#451a03',
  amberBorder: '#78350f',
  emerald: '#10b981',
  emeraldSoft: '#064e3b',
  emeraldBorder: '#065f46',
  sky: '#38bdf8',
  skySoft: '#082f49',
  skyBorder: '#075985',
  slateSoft: '#1e293b',
  rose: '#f43f5e',
  roseSoft: '#4c0519',
  white: '#ffffff',
};

// Exportación por defecto para retrocompatibilidad
export const colors = sismaColorsLight;

export type ThemeColors = typeof sismaColorsLight;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};

export function getStatusMeta(currentTheme: ThemeColors) {
  return {
    BOT: {
      label: 'Agente',
      color: currentTheme.primary,
      background: currentTheme.bubbleBot,
      border: currentTheme.bubbleBotBorder,
    },
    WAITING: {
      label: 'En espera',
      color: currentTheme.amber,
      background: currentTheme.amberSoft,
      border: currentTheme.amberBorder,
    },
    ASSIGNED: {
      label: 'Asesor',
      color: currentTheme.emerald,
      background: currentTheme.emeraldSoft,
      border: currentTheme.emeraldBorder,
    },
    CLOSED: {
      label: 'Cerrada',
      color: currentTheme.muted,
      background: currentTheme.slateSoft,
      border: currentTheme.border,
    },
  } as const;
}

export const statusMeta = getStatusMeta(sismaColorsLight);
