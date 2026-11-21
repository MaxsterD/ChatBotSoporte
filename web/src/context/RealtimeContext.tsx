import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken, getApiUrl, refreshSession } from '../lib/api';
import { useAuth } from './AuthContext';
import type { Message } from '../lib/types';

type Preview = { preview: string; typing: boolean; updatedAt: number };

type RealtimeContextValue = {
  connected: boolean;
  version: number;
  lastMessage: Message | null;
  previews: Record<string, Preview>;
  setTyping: (chatId: string, typing: boolean) => void;
};

const RealtimeContext = createContext<RealtimeContextValue>({
  connected: false,
  version: 0,
  lastMessage: null,
  previews: {},
  setTyping: () => {},
});

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState(0);
  const [lastMessage, setLastMessage] = useState<Message | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const socketRef = useRef<Socket | null>(null);
  const lastAuthRetry = useRef(0);

  const setTyping = (chatId: string, typing: boolean) => {
    setPreviews((current) => {
      const existing = current[chatId];
      return {
        ...current,
        [chatId]: {
          preview: typing ? (existing?.preview ?? '') : '',
          typing,
          updatedAt: Date.now(),
        },
      };
    });
  };

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      setPreviews({});
      return;
    }

    const socket = io(getApiUrl(), {
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket', 'polling'],
      reconnectionDelay: 800,
    });
    socketRef.current = socket;

    const bump = () => setVersion((value) => value + 1);

    socket.on('connect', () => setConnected(true));
    socket.on('ready', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('connect_error', (error: Error) => {
      setConnected(false);
      if (!/unauthorized/i.test(error?.message ?? '')) return;
      const now = Date.now();
      if (now - lastAuthRetry.current < 10_000) return;
      lastAuthRetry.current = now;
      void refreshSession().then((renewed) => {
        if (renewed) socket.connect();
      });
    });

    socket.on('message:new', (message: Message) => {
      setLastMessage(message);
      if (message.authorType === 'BOT' || message.authorType === 'CONSULTANT') {
        setPreviews((current) => {
          const next = { ...current };
          delete next[message.chatId];
          return next;
        });
      }
      bump();
    });

    socket.on('chat:new', bump);
    socket.on('chat:updated', bump);
    socket.on('chat:assigned', bump);
    socket.on('queue:updated', bump);
    socket.on('analysis:ready', bump);
    socket.on('note:new', bump);

    socket.on(
      'agent:typing',
      (payload: { chatId: string; value: boolean; reset?: boolean }) => {
        setPreviews((current) => {
          const existing = current[payload.chatId];
          if (payload.reset) {
            return {
              ...current,
              [payload.chatId]: { preview: '', typing: payload.value, updatedAt: Date.now() },
            };
          }
          return {
            ...current,
            [payload.chatId]: {
              preview: existing?.preview ?? '',
              typing: payload.value,
              updatedAt: Date.now(),
            },
          };
        });
      },
    );

    socket.on(
      'agent:delta',
      (payload: { chatId: string; preview: string }) => {
        setPreviews((current) => ({
          ...current,
          [payload.chatId]: { preview: payload.preview, typing: true, updatedAt: Date.now() },
        }));
      },
    );

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user?.id]);

  return (
    <RealtimeContext.Provider value={{ connected, version, lastMessage, previews, setTyping }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
