import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, refreshSession } from '../api';
import { getSessionSync } from '../session';
import type { Message } from '../types';
import { useSession } from './SessionContext';

export type AgentPreview = { preview: string; typing: boolean };

type RealtimeContextValue = {
  connected: boolean;
  version: number;
  lastMessage: Message | null;
  previews: Record<string, AgentPreview>;
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
  const { session } = useSession();
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState(0);
  const [lastMessage, setLastMessage] = useState<Message | null>(null);
  const [previews, setPreviews] = useState<Record<string, AgentPreview>>({});
  const lastAuthRetry = useRef(0);

  const setTyping = (chatId: string, typing: boolean) => {
    setPreviews((current) => {
      const existing = current[chatId];
      return {
        ...current,
        [chatId]: {
          preview: typing ? (existing?.preview ?? '') : '',
          typing,
        },
      };
    });
  };

  useEffect(() => {
    if (!session) return;

    const socket: Socket = io(API_URL, {
      transports: ['websocket'],
      reconnectionDelay: 900,
      reconnectionDelayMax: 6000,
      auth: (callback) => callback({ token: getSessionSync()?.accessToken }),
    });

    const bump = () => setVersion((value) => value + 1);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('ready', () => setConnected(true));

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
          if (!current[message.chatId]) return current;
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

    socket.on(
      'agent:typing',
      (payload: { chatId: string; value: boolean; reset?: boolean }) => {
        setPreviews((current) => {
          const existing = current[payload.chatId];
          return {
            ...current,
            [payload.chatId]: {
              preview: payload.reset ? '' : (existing?.preview ?? ''),
              typing: payload.value,
            },
          };
        });
      },
    );

    socket.on('agent:delta', (payload: { chatId: string; preview: string }) => {
      setPreviews((current) => ({
        ...current,
        [payload.chatId]: { preview: payload.preview, typing: true },
      }));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      setConnected(false);
      setPreviews({});
    };
  }, [session]);

  return (
    <RealtimeContext.Provider value={{ connected, version, lastMessage, previews, setTyping }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
