import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';

// Colores exactos extraídos directamente de SismaSalud (sis_themes y sis_theme_details)
// Tema: 'Cyan' (Tema oficial activo de SismaSalud)
export const SISMA_THEMES = {
  light: {
    // Mode = 1 (Diurno / Claro)
    '--primary-color': '#06A1B9',
    '--secondary-color': '#3C6885',
    '--tertiary-color': '#80DEEA',
    '--quaternary-color': '#B2EBF2',
    '--quintary-color': '#E0F7FA',
    '--text-title-color': '#006064',
    '--text-paragraph-color': '#0f2438',
    '--icon-color': '#FFFFFF',
    '--content-bg-color': '#F5F5F5',
    // Estructura y contenedores
    '--surface-color': '#FFFFFF',
    '--surface-muted': '#F8FAFC',
    '--border-color': '#E2E8F0',
    '--sidebar-bg': '#002B49',
    '--sidebar-card-bg': '#001D32',
    '--header-bg': '#FFFFFF',
  },
  dark: {
    // Mode = 0 (Nocturno / Oscuro)
    '--primary-color': '#006064',
    '--secondary-color': '#00838F',
    '--tertiary-color': '#0097A7',
    '--quaternary-color': '#00ACC1',
    '--quintary-color': '#008CA18A',
    '--text-title-color': '#B2EBF2',
    '--text-paragraph-color': '#E0F7FA',
    '--icon-color': '#FFFFFF',
    '--content-bg-color': '#0A131F',
    // Estructura y contenedores
    '--surface-color': '#111D2E',
    '--surface-muted': '#16253B',
    '--border-color': '#1C2F48',
    '--sidebar-bg': '#001726',
    '--sidebar-card-bg': '#00101D',
    '--header-bg': '#0E1927',
  },
} as const;

interface ThemeContextType {
  theme: ThemeMode;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function applyThemeVariables(mode: ThemeMode) {
  const root = document.documentElement;
  const colors = SISMA_THEMES[mode];

  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    // SismaSalud guarda '1' para diurno y '0' para nocturno en 'mode'
    const savedMode = localStorage.getItem('mode');
    if (savedMode === '0') return 'dark';
    if (savedMode === '1') return 'light';

    const savedTheme = localStorage.getItem('sisma_theme') as ThemeMode | null;
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;

    return 'light';
  });

  useEffect(() => {
    applyThemeVariables(theme);
    localStorage.setItem('mode', theme === 'dark' ? '0' : '1');
    localStorage.setItem('sisma_theme', theme);
  }, [theme]);

  function toggleTheme() {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  }

  function setTheme(newMode: ThemeMode) {
    setThemeState(newMode);
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme debe ser utilizado dentro de un ThemeProvider');
  }
  return context;
}
