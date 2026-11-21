import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { SplashScreen } from '@/components/SplashScreen';
import { useSession } from '@/context/SessionContext';
import { ChatScreen } from '@/screens/ChatScreen';

export default function ChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, booting } = useSession();

  if (booting) return <SplashScreen message="Abriendo conversación…" />;
  if (!session) return <Redirect href="/login" />;
  if (!id) return <Redirect href="/" />;

  return <ChatScreen chatId={id} onBack={() => router.back()} />;
}
