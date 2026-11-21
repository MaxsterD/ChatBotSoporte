import { Redirect, router } from 'expo-router';
import { SplashScreen } from '@/components/SplashScreen';
import { useSession } from '@/context/SessionContext';
import { ChatListScreen } from '@/screens/ChatListScreen';

export default function HomeRoute() {
  const { session, booting } = useSession();

  if (booting) return <SplashScreen />;
  if (!session) return <Redirect href="/login" />;

  return (
    <ChatListScreen
      onOpenChat={(chatId) =>
        router.push({ pathname: '/chat/[id]', params: { id: chatId } })
      }
    />
  );
}
