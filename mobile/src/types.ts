export type Role = 'CLIENTE' | 'CONSULTOR' | 'ADMIN';
export type ChatStatus = 'BOT' | 'WAITING' | 'ASSIGNED' | 'CLOSED';
export type AuthorType = 'USER' | 'BOT' | 'CONSULTANT' | 'SYSTEM';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface ChatSummary {
  id: string;
  title: string;
  status: ChatStatus;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  queueEnteredAt: string | null;
  takenAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; email: string } | null;
  consultant: { id: string; name: string } | null;
  escalation: { reason: string; ready: boolean } | null;
  queuePosition?: number | null;
}

export interface Message {
  id: string;
  chatId: string;
  authorType: AuthorType;
  authorId: string | null;
  content: string;
  imageUrl?: string | null;
  internal: boolean;
  createdAt: string;
}

export interface ChatDetail {
  chat: ChatSummary;
  messages: Message[];
}

export interface BusinessHoursStatus {
  isOpen: boolean;
  enabled: boolean;
  timezone: string;
  currentTimeString: string;
  dayOfWeek: number;
  scheduleText: string;
  message: string;
}

