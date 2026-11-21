import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from './types';

const STORAGE_KEY = 'soporte.session.v1';

let memory: Session | null = null;

export function getSessionSync() {
  return memory;
}

export async function loadStoredSession() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.user) return null;
    memory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export async function persistSession(session: Session) {
  memory = session;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export async function wipeStoredSession() {
  memory = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
}
