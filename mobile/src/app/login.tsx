import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SplashScreen } from '@/components/SplashScreen';
import { useSession } from '@/context/SessionContext';
import { LoginScreen } from '@/screens/LoginScreen';

export default function LoginRoute() {
  const { session, booting } = useSession();

  if (booting) return <SplashScreen message="Cargando tu cuenta…" />;
  if (session) return <Redirect href="/" />;

  return (
    <>
      <StatusBar style="light" />
      <LoginScreen />
    </>
  );
}
