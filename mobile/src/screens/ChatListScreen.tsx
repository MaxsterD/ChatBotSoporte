import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StatusBar as StatusBarRN,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { StatusPill } from '../components/StatusPill';
import { useRealtime } from '../context/RealtimeContext';
import { useSession } from '../context/SessionContext';
import { useTheme } from '../context/ThemeContext';
import { firstName, formatRelative } from '../format';
import { radius, type ThemeColors } from '../theme';
import type { BusinessHoursStatus, ChatStatus, ChatSummary } from '../types';
import { showConfirm, showNotice } from '../ui/dialog';

type TabMode = 'active' | 'closed';

export function ChatListScreen({ onOpenChat }: { onOpenChat: (chatId: string) => void }) {
  const { session, logout } = useSession();
  const { version, lastMessage, connected } = useRealtime();
  const { isDark, theme, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();

  // Cálculo seguro para librar la barra de notificaciones superior del celular (notch/cámara/reloj)
  const androidStatusBar = StatusBarRN.currentHeight || 24;
  const topSafePadding = Math.max(insets.top, Platform.OS === 'android' ? androidStatusBar : 0);

  // Cálculo seguro para librar los botones de acción del celular (Atrás, Inicio, Recientes o barra de gestos)
  const bottomSafePadding = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 10);

  const [tab, setTab] = useState<TabMode>('active');
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [hoursStatus, setHoursStatus] = useState<BusinessHoursStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVersion = useRef(0);

  const load = useCallback(async (silent = false) => {
    try {
      const [data, hoursRes] = await Promise.all([
        api.listChats(),
        api.getBusinessHours().catch(() => null),
      ]);
      setChats(data.chats);
      if (hoursRes?.status) {
        setHoursStatus(hoursRes.status);
      }
      setError(null);
    } catch (caught) {
      if (!silent) {
        setError(caught instanceof Error ? caught.message : 'No se pudieron cargar las conversaciones.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (version === lastVersion.current) return;
    lastVersion.current = version;
    const timer = setTimeout(() => void load(true), 350);
    return () => clearTimeout(timer);
  }, [version, load]);

  useEffect(() => {
    if (!lastMessage || lastMessage.authorType === 'USER') return;
    const preview = lastMessage.content.replace(/\s+/g, ' ').slice(0, 90);
    setNotice(
      lastMessage.authorType === 'CONSULTANT'
        ? `Mensaje de un asesor: ${preview}`
        : `El agente respondió: ${preview}`,
    );
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [lastMessage]);

  async function startChat() {
    if (creating) return;

    // Validación preventiva de horario de atención
    if (hoursStatus && hoursStatus.enabled && !hoursStatus.isOpen) {
      showNotice(
        'Servicio no disponible',
        hoursStatus.message ||
          `En estos momentos no hay servicio disponible. Vuelve a colocarte en contacto en nuestro horario de atención: ${hoursStatus.scheduleText}.`,
      );
      return;
    }

    setCreating(true);
    try {
      const created = await api.createChat();
      setChats((current) => [created.chat, ...current]);
      onOpenChat(created.chat.id);
    } catch (caught) {
      showNotice(
        'Servicio no disponible',
        caught instanceof Error
          ? caught.message
          : 'En estos momentos no hay servicio disponible. Vuelve a colocarte en contacto en nuestro horario de atención.',
      );
    } finally {
      setCreating(false);
    }
  }

  function confirmLogout() {
    showConfirm({
      title: 'Cerrar sesión',
      message: '¿Quieres salir de tu cuenta?',
      confirmLabel: 'Salir',
      destructive: true,
      onConfirm: () => void logout(),
    });
  }

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  const activeChats = chats.filter((c) => c.status !== 'CLOSED');
  const closedChats = chats.filter((c) => c.status === 'CLOSED');
  const displayedChats = tab === 'active' ? activeChats : closedChats;

  const unreadActiveCount = activeChats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const waitingCount = activeChats.filter((chat) => chat.status === 'WAITING').length;

  const styles = createStyles(theme);

  return (
    <View style={[styles.safe, { paddingTop: topSafePadding + 6 }]}>
      {/* Header Superior - siempre debajo de la barra de notificaciones del celular */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Avatar name={session?.user.name} size={38} tone="indigo" />
          <View style={styles.headerText}>
            <Text style={styles.greeting}>Hola, {firstName(session?.user.name) || 'bienvenido'}</Text>
            <View style={styles.presence}>
              <View
                style={[styles.presenceDot, { backgroundColor: connected ? '#a5c31c' : '#fbbf24' }]}
              />
              <Text style={styles.presenceText}>
                {connected ? 'Soporte en línea' : 'Reconectando…'}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.headerLogoBadge}>
            <Image
              source={require('../../assets/sismasalud.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </View>
          {/* Botón cambiar Modo Nocturno / Diurno estilo SismaSalud */}
          <Pressable onPress={toggleTheme} hitSlop={8} style={styles.actionButton}>
            <Ionicons
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              size={18}
              color={isDark ? '#fcd34d' : theme.primary}
            />
          </Pressable>
          <Pressable onPress={confirmLogout} hitSlop={8} style={styles.actionButton}>
            <Ionicons name="log-out-outline" size={19} color={theme.muted} />
          </Pressable>
        </View>
      </View>

      {/* Banner de Notificación */}
      {notice && (
        <View style={styles.notice}>
          <Ionicons name="notifications-outline" size={15} color={theme.primary} />
          <Text style={styles.noticeText} numberOfLines={2}>
            {notice}
          </Text>
          <Pressable onPress={() => setNotice(null)} hitSlop={8}>
            <Ionicons name="close" size={15} color={theme.primary} />
          </Pressable>
        </View>
      )}

      {/* Lista de Chats (filtrada según pestaña activa) */}
      <View style={styles.flex}>
        <FlatList
          data={displayedChats}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: 24 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.primary} />
          }
          ListHeaderComponent={
            <View>
              {hoursStatus && hoursStatus.enabled && !hoursStatus.isOpen && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: isDark ? 'rgba(217, 119, 6, 0.15)' : '#fffbeb',
                    borderColor: isDark ? 'rgba(217, 119, 6, 0.4)' : '#fde68a',
                    borderWidth: 1,
                    borderRadius: radius.md,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 12,
                  }}
                >
                  <Ionicons name="time-outline" size={18} color="#d97706" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#fcd34d' : '#92400e' }}>
                      Fuera de horario de atención
                    </Text>
                    <Text style={{ fontSize: 11, color: isDark ? '#fde68a' : '#b45309', marginTop: 1 }}>
                      Atención: {hoursStatus.scheduleText}
                    </Text>
                  </View>
                </View>
              )}
              {tab === 'active' ? (
                <>
                  <View style={styles.hero}>
                    <View style={styles.heroOrb} />
                    <View style={styles.heroIcon}>
                      <Ionicons name="chatbubbles-outline" size={19} color="#ffffff" />
                    </View>
                    <Text style={styles.heroTitle}>¿En qué te ayudamos?</Text>
                    <Text style={styles.heroText}>
                      Cuéntanos tu duda de SismaSalud. El agente responde al instante y, si hace falta,
                      te conecta con un asesor humano.
                    </Text>
                    <Pressable
                      onPress={() => void startChat()}
                      disabled={creating}
                      style={({ pressed }) => [styles.heroButton, pressed && styles.heroButtonPressed]}
                    >
                      {creating ? (
                        <ActivityIndicator color={theme.primaryDark} size="small" />
                      ) : (
                        <>
                          <Ionicons name="add" size={18} color={theme.primaryDark} />
                          <Text style={styles.heroButtonText}>Nueva conversación</Text>
                        </>
                      )}
                    </Pressable>
                  </View>

                  <View style={styles.sectionRow}>
                    <Text style={styles.sectionTitle}>Chats activos</Text>
                    <Text style={styles.sectionCount}>
                      {activeChats.length} {activeChats.length === 1 ? 'activo' : 'activos'}
                      {waitingCount > 0 ? ` · ${waitingCount} en espera` : ''}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.archiveHeaderCard}>
                    <View style={styles.archiveHeaderTop}>
                      <View style={styles.archiveHeaderIcon}>
                        <Ionicons name="archive-outline" size={20} color={theme.primary} />
                      </View>
                      <View style={styles.archiveHeaderText}>
                        <Text style={styles.archiveHeaderTitle}>Historial de atenciones</Text>
                        <Text style={styles.archiveHeaderSubtitle}>
                          Conversaciones finalizadas. Puedes consultar todas las respuestas anteriores cuando lo necesites.
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.sectionRow}>
                    <Text style={styles.sectionTitle}>Chats cerrados</Text>
                    <Text style={styles.sectionCount}>
                      {closedChats.length} {closedChats.length === 1 ? 'cerrado' : 'cerrados'}
                    </Text>
                  </View>
                </>
              )}

              {error && (
                <Pressable onPress={() => void load()} style={styles.errorBox}>
                  <Ionicons name="cloud-offline-outline" size={16} color={theme.rose} />
                  <Text style={styles.errorText}>{error} Toca para reintentar.</Text>
                </Pressable>
              )}
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={theme.primary} />
                <Text style={styles.loadingText}>
                  {tab === 'active' ? 'Cargando chats activos…' : 'Cargando historial…'}
                </Text>
              </View>
            ) : tab === 'active' ? (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="chatbubbles-outline" size={24} color={theme.primary} />
                </View>
                <Text style={styles.emptyTitle}>No tienes chats activos</Text>
                <Text style={styles.emptyText}>
                  Inicia una consulta para resolver tus dudas sobre citas, facturación, RIPS o autorizaciones.
                </Text>
                <Pressable
                  onPress={() => void startChat()}
                  disabled={creating}
                  style={styles.emptyActionButton}
                >
                  <Ionicons name="add-circle-outline" size={16} color="#ffffff" />
                  <Text style={styles.emptyActionButtonText}>Iniciar conversación</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="archive-outline" size={24} color={theme.muted} />
                </View>
                <Text style={styles.emptyTitle}>No hay chats cerrados</Text>
                <Text style={styles.emptyText}>
                  Las conversaciones que des por finalizadas con el agente o asesor aparecerán aquí.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onOpenChat(item.id)}
              style={({ pressed }) => [styles.chatCard, pressed && styles.chatCardPressed]}
            >
              <View style={styles.chatTop}>
                <ChatStatusIcon status={item.status} theme={theme} />
                <View style={styles.chatHeading}>
                  <Text style={styles.chatTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.chatTime}>{formatRelative(item.lastMessageAt)}</Text>
                </View>
              </View>

              <Text style={styles.chatPreview} numberOfLines={2}>
                {item.lastMessagePreview || 'Sin mensajes todavía'}
              </Text>

              <View style={styles.chatFooter}>
                <StatusPill status={item.status} compact />
                {item.status === 'WAITING' && item.queuePosition ? (
                  <View style={styles.queueChip}>
                    <Ionicons name="time-outline" size={11} color={theme.amber} />
                    <Text style={styles.queueChipText}>Posición #{item.queuePosition}</Text>
                  </View>
                ) : null}
                {item.status === 'ASSIGNED' && item.consultant ? (
                  <Text style={styles.consultantText}>Te atiende {item.consultant.name}</Text>
                ) : null}
                {item.unreadCount > 0 && item.status !== 'CLOSED' ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      </View>

      {/* Navbar Inferior - respeta los botones de acción del celular (Atrás, Inicio, Recientes / barra de gestos) */}
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: bottomSafePadding + 8,
            minHeight: 62 + bottomSafePadding,
          },
        ]}
      >
        <Pressable
          onPress={() => setTab('active')}
          style={styles.tabButton}
          accessibilityRole="tab"
          accessibilityLabel="Conversaciones activas"
          accessibilityState={{ selected: tab === 'active' }}
        >
          {tab === 'active' && <View style={styles.tabIndicator} />}
          <View style={styles.tabIconWrap}>
            <Ionicons
              name={tab === 'active' ? 'chatbubbles' : 'chatbubbles-outline'}
              size={22}
              color={tab === 'active' ? theme.primary : theme.muted}
            />
            {unreadActiveCount > 0 ? (
              <View style={[styles.tabBadge, { backgroundColor: theme.primary }]}>
                <Text style={styles.tabBadgeText}>
                  {unreadActiveCount > 99 ? '99+' : unreadActiveCount}
                </Text>
              </View>
            ) : activeChats.length > 0 ? (
              <View
                style={[
                  styles.tabBadge,
                  { backgroundColor: tab === 'active' ? theme.primary : theme.border },
                ]}
              >
                <Text
                  style={[
                    styles.tabBadgeText,
                    { color: tab === 'active' ? '#ffffff' : theme.muted },
                  ]}
                >
                  {activeChats.length > 99 ? '99+' : activeChats.length}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: tab === 'active' ? theme.primary : theme.muted },
              tab === 'active' && styles.tabLabelActive,
            ]}
          >
            Activos
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setTab('closed')}
          style={styles.tabButton}
          accessibilityRole="tab"
          accessibilityLabel="Conversaciones cerradas"
          accessibilityState={{ selected: tab === 'closed' }}
        >
          {tab === 'closed' && <View style={styles.tabIndicator} />}
          <View style={styles.tabIconWrap}>
            <Ionicons
              name={tab === 'closed' ? 'archive' : 'archive-outline'}
              size={21}
              color={tab === 'closed' ? theme.primary : theme.muted}
            />
            {closedChats.length > 0 && (
              <View
                style={[
                  styles.tabBadge,
                  { backgroundColor: tab === 'closed' ? theme.primary : theme.border },
                ]}
              >
                <Text
                  style={[
                    styles.tabBadgeText,
                    { color: tab === 'closed' ? '#ffffff' : theme.muted },
                  ]}
                >
                  {closedChats.length > 99 ? '99+' : closedChats.length}
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: tab === 'closed' ? theme.primary : theme.muted },
              tab === 'closed' && styles.tabLabelActive,
            ]}
          >
            Cerrados
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ChatStatusIcon({ status, theme }: { status: ChatStatus; theme: ThemeColors }) {
  const meta = {
    BOT: { name: 'sparkles-outline', color: theme.primary, background: theme.bubbleBot },
    WAITING: { name: 'time-outline', color: theme.amber, background: theme.amberSoft },
    ASSIGNED: { name: 'headset-outline', color: theme.emerald, background: theme.emeraldSoft },
    CLOSED: { name: 'checkmark-done-outline', color: theme.muted, background: theme.surfaceSecondary },
  }[status] as { name: keyof typeof Ionicons.glyphMap; color: string; background: string };

  return (
    <View style={[{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: meta.background }]}>
      <Ionicons name={meta.name} size={19} color={meta.color} />
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingTop: 6,
      paddingBottom: 10,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerLogoBadge: {
      backgroundColor: theme.navyCard,
      borderColor: 'rgba(6, 161, 185, 0.4)',
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.sm,
    },
    headerLogo: { width: 84, height: 20 },
    headerText: { gap: 2, flexShrink: 1 },
    greeting: { fontSize: 14, fontWeight: '800', color: theme.text },
    presence: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    presenceDot: { width: 6, height: 6, borderRadius: 3 },
    presenceText: { fontSize: 10.5, color: theme.muted, fontWeight: '600' },
    actionButton: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 18,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radius.md,
      backgroundColor: theme.bubbleBot,
      borderWidth: 1,
      borderColor: theme.bubbleBotBorder,
    },
    noticeText: { flex: 1, color: theme.textTitle, fontSize: 11.5, fontWeight: '600' },
    listContent: { paddingHorizontal: 18 },
    hero: {
      marginTop: 6,
      borderRadius: radius.xl,
      backgroundColor: theme.navy,
      padding: 18,
      overflow: 'hidden',
    },
    heroOrb: {
      position: 'absolute',
      top: -40,
      right: -30,
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: 'rgba(6,161,185,0.22)',
    },
    heroIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: 'rgba(255,255,255,0.16)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: { color: '#ffffff', fontSize: 19, fontWeight: '800', marginTop: 12 },
    heroText: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 12.5,
      lineHeight: 18.5,
      marginTop: 6,
    },
    heroButton: {
      marginTop: 15,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#ffffff',
      borderRadius: radius.md,
      paddingHorizontal: 13,
      paddingVertical: 9,
    },
    heroButtonPressed: { opacity: 0.85 },
    heroButtonText: { color: theme.primaryDark, fontSize: 12.5, fontWeight: '800' },

    archiveHeaderCard: {
      marginTop: 6,
      borderRadius: radius.xl,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
    },
    archiveHeaderTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    archiveHeaderIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.bubbleBot,
      alignItems: 'center',
      justifyContent: 'center',
    },
    archiveHeaderText: {
      flex: 1,
      gap: 3,
    },
    archiveHeaderTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: theme.text,
    },
    archiveHeaderSubtitle: {
      fontSize: 11.5,
      lineHeight: 16.5,
      color: theme.muted,
    },

    sectionRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: 20,
      marginBottom: 10,
    },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: theme.text },
    sectionCount: { fontSize: 11, color: theme.muted, fontWeight: '600' },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 7,
      backgroundColor: theme.roseSoft,
      borderRadius: radius.md,
      padding: 11,
      marginBottom: 10,
    },
    errorText: { flex: 1, color: theme.rose, fontSize: 11.5, lineHeight: 16 },
    chatCard: {
      backgroundColor: theme.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 13,
      marginBottom: 10,
    },
    chatCardPressed: { opacity: 0.8 },
    chatTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    chatHeading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    chatTitle: { flex: 1, fontSize: 13.5, fontWeight: '700', color: theme.text },
    chatTime: { fontSize: 10, color: theme.faint, fontWeight: '600' },
    chatPreview: { marginTop: 8, fontSize: 11.5, lineHeight: 16, color: theme.muted },
    chatFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    queueChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: theme.amberSoft,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    queueChipText: { fontSize: 9.5, color: theme.amber, fontWeight: '700' },
    consultantText: { fontSize: 9.5, color: theme.emerald, fontWeight: '600' },
    unreadBadge: {
      marginLeft: 'auto',
      minWidth: 19,
      height: 19,
      borderRadius: 10,
      paddingHorizontal: 5,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unreadText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
    loadingBox: { alignItems: 'center', gap: 10, paddingVertical: 40 },
    loadingText: { fontSize: 12, color: theme.muted },
    emptyBox: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 36,
      paddingHorizontal: 26,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.border,
      marginTop: 4,
    },
    emptyIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: theme.bubbleBot,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    emptyTitle: { fontSize: 13.5, fontWeight: '700', color: theme.text },
    emptyText: { fontSize: 11.5, color: theme.muted, textAlign: 'center', lineHeight: 16.5 },
    emptyActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.primary,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 9,
      marginTop: 8,
    },
    emptyActionButtonText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '700',
    },

    /* Navbar Inferior */
    bottomBar: {
      flexDirection: 'row',
      backgroundColor: theme.surface,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.08,
      shadowRadius: 5,
      elevation: 10,
    },
    tabButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      gap: 3,
      position: 'relative',
    },
    tabIndicator: {
      position: 'absolute',
      top: -8,
      width: 34,
      height: 3,
      borderBottomLeftRadius: 3,
      borderBottomRightRadius: 3,
      backgroundColor: theme.primary,
    },
    tabIconWrap: {
      position: 'relative',
      width: 34,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabBadge: {
      position: 'absolute',
      top: -3,
      right: -8,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3.5,
    },
    tabBadgeText: {
      color: '#ffffff',
      fontSize: 9,
      fontWeight: '800',
    },
    tabLabel: {
      fontSize: 11,
      fontWeight: '600',
    },
    tabLabelActive: {
      fontWeight: '800',
    },
  });
}
