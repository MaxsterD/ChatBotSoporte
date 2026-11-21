import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RealtimeProvider } from '@/context/RealtimeContext';
import { SessionProvider } from '@/context/SessionContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';

SplashScreen.setOptions({ duration: 350, fade: true });

function NavigationRoot() {
  const { isDark, theme } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'slide_from_right',
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <RealtimeProvider>
            <NavigationRoot />
          </RealtimeProvider>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
