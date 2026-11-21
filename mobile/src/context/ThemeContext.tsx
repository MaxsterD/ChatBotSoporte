import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getStatusMeta, sismaColorsDark, sismaColorsLight, type ThemeColors } from '../theme';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  theme: ThemeColors;
  statusMeta: ReturnType<typeof getStatusMeta>;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = '@sisma_theme_mode';

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    async function loadSavedTheme() {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'dark' || saved === '0') {
          setMode('dark');
        } else if (saved === 'light' || saved === '1') {
          setMode('light');
        }
      } catch (err) {
        console.warn('Error al cargar tema en AsyncStorage:', err);
      }
    }
    void loadSavedTheme();
  }, []);

  async function updateTheme(newMode: ThemeMode) {
    setMode(newMode);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, newMode === 'dark' ? '0' : '1');
    } catch (err) {
      console.warn('Error al guardar tema en AsyncStorage:', err);
    }
  }

  function toggleTheme() {
    void updateTheme(mode === 'light' ? 'dark' : 'light');
  }

  function setThemeMode(newMode: ThemeMode) {
    void updateTheme(newMode);
  }

  const theme = mode === 'dark' ? sismaColorsDark : sismaColorsLight;
  const statusMeta = getStatusMeta(theme);

  return (
    <ThemeContext.Provider
      value={{
        mode,
        isDark: mode === 'dark',
        theme,
        statusMeta,
        toggleTheme,
        setThemeMode,
      }}
    >
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
