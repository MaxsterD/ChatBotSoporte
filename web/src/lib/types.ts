export type Role = 'CLIENTE' | 'CONSULTOR' | 'ADMIN';
export type ChatStatus = 'BOT' | 'WAITING' | 'ASSIGNED' | 'CLOSED';
export type AuthorType = 'USER' | 'BOT' | 'CONSULTANT' | 'SYSTEM';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: string;
  environmentId?: string | null;
}

export interface ClientUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  environmentId: string | null;
  environment: {
    id: string;
    name: string;
    dbDatabase: string;
    dbServer: string;
  } | null;
  chatsCount: number;
  lastChatAt: string | null;
  lastChatStatus: ChatStatus | null;
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
  environment?: {
    id: string;
    name: string;
    dbDatabase: string;
    dbServer: string;
    sourcePath: string;
    sourceType: string;
  } | null;
  escalation: { reason: string; ready: boolean; createdAt: string } | null;
  queuePosition?: number | null;
  position?: number;
  waitingMinutes?: number;
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

export interface ConsultantNote {
  id: string;
  chatId: string;
  author: { id: string; name: string } | null;
  content: string;
  createdAt: string;
}

export interface ChatDetail {
  chat: ChatSummary;
  messages: Message[];
  notes: ConsultantNote[];
}

export interface Analysis {
  available: boolean;
  reason: string | null;
  summary: string;
  probableCause: string;
  suggestedSolution: string;
  missingInfo: string;
  ready: boolean;
  createdAt: string | null;
}

export interface Stats {
  waiting: number;
  assigned: number;
  bots: number;
  closedToday: number;
  mine: number;
  analysesPending: number;
  longestWaitMinutes: number;
  agent: {
    mode: string;
    model: string;
    queue: { active: number; waiting: number; chats: number };
  };
}

export interface ClientEnvironment {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  dbServer: string;
  dbPort: number;
  dbDatabase: string;
  dbUser: string;
  sourceType: 'SMB_UNC' | 'LOCAL_PATH';
  sourcePath: string;
  smbUser: string | null;
  smbDomain: string | null;
  createdAt: string;
  updatedAt: string;
  usersCount?: number;
  chatsCount?: number;
  users?: User[];
}

export interface ProposedAction {
  type: 'SQL' | 'FILE';
  description: string;
  sql?: string;
  filePath?: string;
  targetContent?: string;
  replacementContent?: string;
  diff?: string;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  rowsAffected?: number;
  backupPath?: string;
  executedAt: string;
  executedBy: string;
}

export interface LocalEnvironmentConfig {
  id: string;
  dbServer: string;
  dbPort: number;
  dbDatabase: string;
  dbUser: string;
  hasPassword: boolean;
  dbEnabled: boolean;
  sourcePath: string;
  updatedAt: string;
}

export interface StaffSession {
  id: string;
  title: string;
  environmentId: string | null;
  environmentName: string;
  createdAt: string;
  updatedAt: string;
  messagesCount?: number;
  messages?: StaffMessage[];
}

export interface StaffMessage {
  id: string;
  role: 'CONSULTANT' | 'AGENT';
  content: string;
  imageUrl?: string | null;
  planAction?: {
    type: 'SQL' | 'FILE';
    title?: string;
    description: string;
    status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
    steps?: string[];
    verificationCriteria?: string;
    sql?: string;
    filePath?: string;
    targetContent?: string;
    replacementContent?: string;
    diff?: string;
  } | null;
  executionResult?: {
    success: boolean;
    message: string;
    rowsAffected?: number;
    backupPath?: string;
    executedAt: string;
    executedBy: string;
  } | null;
  createdAt: string;
}

export interface CopilotTurn {
  id: string;
  role: 'CONSULTANT' | 'COPILOT' | 'SYSTEM';
  authorName?: string;
  content: string;
  status: 'INFO' | 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';
  proposedAction: ProposedAction | null;
  executionResult: ExecutionResult | null;
  createdAt: string;
}

export interface CopilotState {
  hasEnvironment: boolean;
  environment: {
    id: string;
    name: string;
    dbServer: string;
    dbDatabase: string;
    sourcePath: string;
    sourceType: string;
  } | null;
  turns: CopilotTurn[];
}

export interface BusinessHoursConfig {
  id: string;
  enabled: boolean;
  timezone: string;
  daysEnabled: number[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  customMessage: string;
  scheduleText: string;
  updatedAt: string;
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

