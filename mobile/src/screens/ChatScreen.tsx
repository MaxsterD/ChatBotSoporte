import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StatusBar as StatusBarRN,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, resolveMediaUrl } from '../api';
import { Avatar } from '../components/Avatar';
import { StatusPill } from '../components/StatusPill';
import { useRealtime } from '../context/RealtimeContext';
import { useTheme } from '../context/ThemeContext';
import { formatTime } from '../format';
import { radius, type ThemeColors } from '../theme';
import type { ChatDetail, Message } from '../types';
import { showConfirm } from '../ui/dialog';

export function ChatScreen({ chatId, onBack }: { chatId: string; onBack: () => void }) {
  const { version, previews, connected, setTyping } = useRealtime();
  const { isDark, theme, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();

  // Cálculo seguro para librar la barra de notificaciones superior del celular (notch/cámara/reloj)
  const androidStatusBar = StatusBarRN.currentHeight || 24;
  const topSafePadding = Math.max(insets.top, Platform.OS === 'android' ? androidStatusBar : 0);

  // Cálculo seguro para librar los botones de acción del celular (Atrás, Inicio, Recientes o barra de gestos)
  const bottomSafePadding = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 10);

  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{
    uri: string;
    base64?: string;
    filename?: string;
    mimeType?: string;
  } | null>(null);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const lastVersion = useRef(0);
  const preview = previews[chatId];

  const load = useCallback(
    async (silent = false) => {
      try {
        const data = await api.getChat(chatId);
        setDetail(data);
        setError(null);
      } catch (caught) {
        if (!silent) {
          setError(caught instanceof Error ? caught.message : 'No se pudo abrir la conversación.');
        }
      } finally {
        setLoading(false);
      }
    },
    [chatId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (version === lastVersion.current) return;
    lastVersion.current = version;
    const timer = setTimeout(() => void load(true), 180);
    return () => clearTimeout(timer);
  }, [version, load]);

  // Mientras está en cola, el puesto cambia si otros clientes avanzan.
  useEffect(() => {
    if (detail?.chat.status !== 'WAITING') return;
    const timer = setInterval(() => void load(true), 15_000);
    return () => clearInterval(timer);
  }, [detail?.chat.status, load]);

  const messageCount = detail?.messages.length ?? 0;

  useEffect(() => {
    if (!messageCount) return;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messageCount, preview?.preview, preview?.typing]);

  async function pickImage() {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setSelectedImage({
          uri: asset.uri,
          base64: asset.base64 ?? undefined,
          filename: asset.fileName ?? 'imagen.jpg',
          mimeType: asset.mimeType ?? 'image/jpeg',
        });
      }
    } catch {
      setError('No se pudo abrir la galería de imágenes');
    }
  }

  async function send() {
    const content = text.trim();
    if ((!content && !selectedImage) || sending) return;
    setSending(true);
    setText('');
    const imageToSend = selectedImage;
    setSelectedImage(null);
    setError(null);

    // Si el chat está en modo BOT, mostrar de inmediato la burbuja de escritura (0 ms)
    if (detail?.chat.status === 'BOT') {
      setTyping(chatId, true);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 30);
    }

    try {
      let imageUrl: string | null = null;
      if (imageToSend?.base64) {
        const uploadRes = await api.uploadImage(
          imageToSend.base64,
          imageToSend.filename,
          imageToSend.mimeType,
        );
        imageUrl = uploadRes.url;
      }
      await api.sendMessage(chatId, content, imageUrl);
      await load(true);
    } catch (caught) {
      setText(content);
      setSelectedImage(imageToSend);
      if (detail?.chat.status === 'BOT') {
        setTyping(chatId, false);
      }
      setError(caught instanceof Error ? caught.message : 'No se pudo enviar el mensaje.');
    } finally {
      setSending(false);
    }
  }

  function askHuman() {
    showConfirm({
      title: 'Hablar con un asesor',
      message: 'Te pondremos en la cola de espera para que un consultor humano tome tu caso.',
      confirmLabel: 'Conectar',
      onConfirm: () => {
        void (async () => {
          setRequesting(true);
          setError(null);
          try {
            await api.requestHuman(chatId);
            await load(true);
          } catch (caught) {
            setError(
              caught instanceof Error ? caught.message : 'No se pudo solicitar un asesor.',
            );
          } finally {
            setRequesting(false);
          }
        })();
      },
    });
  }

  function closeChat() {
    showConfirm({
      title: 'Cerrar conversación',
      message: '¿Seguro que quieres cerrarla? No podrás seguir escribiendo en ella.',
      confirmLabel: 'Cerrar',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          try {
            await api.closeChat(chatId);
            await load(true);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'No se pudo cerrar la conversación.');
          }
        })();
      },
    });
  }

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  const chat = detail?.chat;
  const messages = detail?.messages ?? [];
  const status = chat?.status ?? 'BOT';

  const subtitle =
    status === 'CLOSED'
      ? 'Conversación cerrada'
      : status === 'ASSIGNED'
        ? chat?.consultant
          ? `Asesor: ${chat.consultant.name}`
          : 'Asesor asignado'
        : status === 'WAITING'
          ? 'En espera de un asesor'
          : connected
            ? 'Agente de soporte'
            : 'Reconectando…';

  const styles = createStyles(theme);

  return (
    <View style={styles.safe}>
      {/* Header Superior - siempre debajo de la barra de notificaciones del celular */}
      <View style={[styles.header, { paddingTop: topSafePadding + 6 }]}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {chat?.title ?? 'Conversación'}
            </Text>
            {chat && <StatusPill status={chat.status} compact />}
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={toggleTheme} hitSlop={10} style={styles.headerAction}>
            <Ionicons
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              size={19}
              color={isDark ? '#fcd34d' : theme.primary}
            />
          </Pressable>
          {status !== 'CLOSED' && (
            <Pressable onPress={closeChat} hitSlop={10} style={styles.headerAction}>
              <Ionicons name="ellipsis-horizontal" size={20} color={theme.muted} />
            </Pressable>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {error && (
          <Pressable onPress={() => void load()} style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={15} color={theme.rose} />
            <Text style={styles.errorText}>{error}</Text>
          </Pressable>
        )}

        {status === 'WAITING' && (
          <View style={[styles.banner, styles.bannerWaiting]}>
            <Ionicons name="time-outline" size={16} color={theme.amber} />
            <View style={styles.bannerBody}>
              <Text style={[styles.bannerTitle, { color: theme.amber }]}>
                Estás en la cola
                {chat?.queuePosition ? ` · posición #${chat.queuePosition}` : ''}
              </Text>
              <Text style={styles.bannerText}>
                Un asesor se unirá a la conversación y verá todo lo que hablamos.
              </Text>
            </View>
          </View>
        )}

        {status === 'ASSIGNED' && (
          <View style={[styles.banner, styles.bannerAssigned]}>
            <Ionicons name="headset-outline" size={16} color={theme.emerald} />
            <View style={styles.bannerBody}>
              <Text style={[styles.bannerTitle, { color: theme.emerald }]}>
                {chat?.consultant ? `Te atiende ${chat.consultant.name}` : 'Un asesor te atiende'}
              </Text>
              <Text style={styles.bannerText}>Puedes escribirle directamente por aquí.</Text>
            </View>
          </View>
        )}

        {status === 'CLOSED' && (
          <View style={[styles.banner, styles.bannerClosed]}>
            <Ionicons name="lock-closed-outline" size={16} color={theme.muted} />
            <Text style={styles.bannerText}>
              Esta conversación está cerrada. Abre una nueva si necesitas más ayuda.
            </Text>
          </View>
        )}

        {loading && !detail ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.primary} />
            <Text style={styles.loadingText}>Cargando conversación…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            style={styles.flex}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                tintColor={theme.primary}
              />
            }
            renderItem={({ item }) => (
              <MessageRow
                message={item}
                customerName={chat?.customer?.name}
                theme={theme}
                onImagePress={setPreviewModalUrl}
              />
            )}
            ListFooterComponent={
              preview?.typing ? (
                <View style={styles.typingRow}>
                  <View style={styles.botAvatar}>
                    <Text style={styles.botAvatarText}>AI</Text>
                  </View>
                  <View style={styles.typingBubble}>
                    {preview.preview ? (
                      <Text style={styles.bubbleText}>
                        {preview.preview}
                        <Text style={styles.caret}>▍</Text>
                      </Text>
                    ) : (
                      <View style={styles.dotsRow}>
                        <View style={styles.typingDot} />
                        <View style={[styles.typingDot, { opacity: 0.7 }]} />
                        <View style={[styles.typingDot, { opacity: 0.45 }]} />
                        <Text style={styles.typingLabel}>el agente está escribiendo…</Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : undefined
            }
          />
        )}

        {status === 'BOT' && (
          <View style={styles.quickActionRow}>
            <Pressable
              onPress={askHuman}
              disabled={requesting}
              style={({ pressed }) => [styles.askButton, pressed && styles.askButtonPressed]}
            >
              {requesting ? (
                <ActivityIndicator size="small" color={theme.primaryDark} />
              ) : (
                <Ionicons name="headset-outline" size={15} color={theme.primaryDark} />
              )}
              <Text style={styles.askButtonText}>
                {requesting ? 'Conectando…' : 'Hablar con un asesor'}
              </Text>
            </Pressable>
          </View>
        )}

        {status === 'CLOSED' ? (
          <View style={[styles.closedFooter, { paddingBottom: bottomSafePadding + 8 }]}>
            <Text style={styles.closedFooterText}>
              El historial queda disponible. Para retomar el tema abre otra conversación.
            </Text>
          </View>
        ) : (
          <View style={[styles.composerWrap, { paddingBottom: bottomSafePadding + 6 }]}>
            {selectedImage && (
              <View style={styles.previewContainer}>
                <Image source={{ uri: selectedImage.uri }} style={styles.previewThumb} />
                <View style={styles.previewInfo}>
                  <Text style={styles.previewTitle} numberOfLines={1}>
                    {selectedImage.filename || 'Imagen seleccionada'}
                  </Text>
                  <Text style={styles.previewSubtitle}>Adjunta y lista para enviar</Text>
                </View>
                <Pressable onPress={() => setSelectedImage(null)} style={styles.removeImageButton}>
                  <Ionicons name="close-circle" size={22} color={theme.muted} />
                </Pressable>
              </View>
            )}
            <View style={styles.composer}>
              <Pressable
                onPress={() => void pickImage()}
                disabled={sending}
                accessibilityLabel="Adjuntar imagen"
                style={({ pressed }) => [styles.attachButton, pressed && styles.attachButtonPressed]}
              >
                <Ionicons name="image-outline" size={22} color={theme.primary} />
              </Pressable>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={
                  selectedImage
                    ? 'Agrega un detalle sobre la imagen…'
                    : status === 'ASSIGNED'
                      ? 'Escribe al asesor…'
                      : 'Escribe tu mensaje…'
                }
                placeholderTextColor={theme.faint}
                style={styles.input}
                multiline
                maxLength={4000}
                textAlignVertical="center"
              />
              <Pressable
                onPress={() => void send()}
                disabled={sending || (!text.trim() && !selectedImage)}
                accessibilityLabel="Enviar mensaje"
                testID="send-button"
                style={({ pressed }) => [
                  styles.sendButton,
                  ((!text.trim() && !selectedImage) || sending) && styles.sendButtonDisabled,
                  pressed && styles.sendButtonPressed,
                ]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="send" size={17} color="#ffffff" />
                )}
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal
        visible={Boolean(previewModalUrl)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewModalUrl(null)}
      >
        <View style={styles.modalBg}>
          <Pressable style={styles.modalClose} onPress={() => setPreviewModalUrl(null)}>
            <Ionicons name="close" size={28} color="#ffffff" />
          </Pressable>
          {previewModalUrl && (
            <Image source={{ uri: previewModalUrl }} style={styles.modalImage} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}

function MessageRow({
  message,
  customerName,
  theme,
  onImagePress,
}: {
  message: Message;
  customerName?: string | null;
  theme: ThemeColors;
  onImagePress?: (url: string) => void;
}) {
  const styles = createStyles(theme);

  if (message.authorType === 'SYSTEM') {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  const mine = message.authorType === 'USER';
  const fromBot = message.authorType === 'BOT';
  const fromConsultant = message.authorType === 'CONSULTANT';
  const imageUrl = message.imageUrl ? resolveMediaUrl(message.imageUrl) : null;

  if (mine) {
    return (
      <View style={[styles.messageRow, styles.rowRight]}>
        <View style={[styles.bubble, styles.bubbleUser]}>
          {imageUrl && (
            <Pressable onPress={() => onImagePress?.(imageUrl)} style={styles.imageContainer}>
              <Image source={{ uri: imageUrl }} style={styles.messageImage} resizeMode="cover" />
            </Pressable>
          )}
          {message.content ? (
            <Text style={[styles.bubbleText, styles.userText]}>{message.content}</Text>
          ) : null}
        </View>
        <Text style={[styles.meta, styles.metaRight]}>{formatTime(message.createdAt)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.messageRow}>
      {fromBot ? (
        <View style={styles.botAvatar}>
          <Text style={styles.botAvatarText}>AI</Text>
        </View>
      ) : (
        <Avatar name={customerName} size={28} tone={fromConsultant ? 'emerald' : 'slate'} />
      )}
      <View style={styles.bubbleWrap}>
        <Text style={[styles.author, fromConsultant && styles.authorConsultant]}>
          {fromBot ? 'Agente de soporte' : 'Asesor humano'}
        </Text>
        <View style={[styles.bubble, fromBot ? styles.bubbleBot : styles.bubbleConsultant]}>
          {imageUrl && (
            <Pressable onPress={() => onImagePress?.(imageUrl)} style={styles.imageContainer}>
              <Image source={{ uri: imageUrl }} style={styles.messageImage} resizeMode="cover" />
            </Pressable>
          )}
          {message.content ? <Text style={styles.bubbleText}>{message.content}</Text> : null}
        </View>
        <Text style={styles.meta}>{formatTime(message.createdAt)}</Text>
      </View>
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
      gap: 8,
      paddingHorizontal: 12,
      paddingBottom: 10,
      backgroundColor: theme.headerBg,
      borderBottomWidth: 2,
      borderBottomColor: theme.primary,
    },
    backButton: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerCenter: { flex: 1, gap: 2 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    title: { flexShrink: 1, fontSize: 14, fontWeight: '800', color: theme.text },
    subtitle: { fontSize: 10.5, color: theme.muted, fontWeight: '600' },
    headerAction: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      marginHorizontal: 14,
      marginTop: 8,
      padding: 10,
      borderRadius: radius.md,
      backgroundColor: theme.roseSoft,
    },
    errorText: { flex: 1, color: theme.rose, fontSize: 11.5, lineHeight: 16 },
    banner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginHorizontal: 14,
      marginTop: 10,
      padding: 11,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    bannerWaiting: { backgroundColor: theme.amberSoft, borderColor: theme.amberBorder },
    bannerAssigned: { backgroundColor: theme.emeraldSoft, borderColor: theme.emeraldBorder },
    bannerClosed: { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
    bannerBody: { flex: 1, gap: 2 },
    bannerTitle: { fontSize: 11.5, fontWeight: '800' },
    bannerText: { flex: 1, fontSize: 10.8, color: theme.muted, lineHeight: 15 },
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { color: theme.muted, fontSize: 12 },
    listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
    systemRow: { alignItems: 'center', marginVertical: 7 },
    systemText: {
      maxWidth: '86%',
      textAlign: 'center',
      fontSize: 10.5,
      lineHeight: 15,
      color: theme.muted,
      backgroundColor: theme.surfaceSecondary,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
    rowRight: { justifyContent: 'flex-end' },
    bubbleWrap: { maxWidth: '78%' },
    botAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
    },
    botAvatarText: { color: '#ffffff', fontSize: 9, fontWeight: '900' },
    author: { fontSize: 9, fontWeight: '700', color: theme.muted, marginBottom: 3, marginLeft: 3 },
    authorConsultant: { color: theme.emerald },
    bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
    bubbleBot: {
      backgroundColor: theme.bubbleBot,
      borderWidth: 1,
      borderColor: theme.bubbleBotBorder,
      borderTopLeftRadius: 5,
    },
    bubbleConsultant: {
      backgroundColor: theme.emeraldSoft,
      borderWidth: 1,
      borderColor: theme.emeraldBorder,
      borderTopLeftRadius: 5,
    },
    bubbleUser: {
      backgroundColor: theme.bubbleUser,
      borderTopRightRadius: 5,
      maxWidth: '82%',
    },
    imageContainer: {
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 6,
    },
    messageImage: {
      width: 220,
      height: 180,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.06)',
    },
    bubbleText: { fontSize: 13, lineHeight: 19, color: theme.text },
    userText: { color: '#ffffff' },
    meta: { fontSize: 9, color: theme.faint, marginTop: 4, marginLeft: 4 },
    metaRight: { textAlign: 'right', marginRight: 4 },
    caret: { color: theme.primary },
    typingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
    typingBubble: {
      maxWidth: '78%',
      borderRadius: 16,
      borderTopLeftRadius: 5,
      borderWidth: 1,
      borderColor: theme.bubbleBotBorder,
      backgroundColor: theme.bubbleBot,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    typingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.primary },
    typingLabel: { marginLeft: 5, fontSize: 10.5, color: theme.textTitle },
    quickActionRow: {
      paddingHorizontal: 14,
      paddingTop: 8,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    askButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.bubbleBot,
      borderWidth: 1,
      borderColor: theme.bubbleBotBorder,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    askButtonPressed: { opacity: 0.8 },
    askButtonText: { color: theme.textTitle, fontSize: 11, fontWeight: '700' },
    composerWrap: {
      backgroundColor: theme.surface,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    previewContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.bubbleBot,
      borderBottomWidth: 1,
      borderBottomColor: theme.bubbleBotBorder,
      gap: 10,
    },
    previewThumb: {
      width: 44,
      height: 44,
      borderRadius: 8,
      backgroundColor: theme.border,
    },
    previewInfo: {
      flex: 1,
    },
    previewTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.text,
    },
    previewSubtitle: {
      fontSize: 10.5,
      color: theme.muted,
      marginTop: 2,
    },
    removeImageButton: {
      padding: 4,
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 8,
    },
    attachButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    attachButtonPressed: {
      opacity: 0.7,
      backgroundColor: theme.bubbleBot,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 116,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.inputBg,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
      fontSize: 13,
      color: theme.inputText,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: { opacity: 0.4 },
    sendButtonPressed: { opacity: 0.8 },
    closedFooter: { padding: 14, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border },
    closedFooterText: { fontSize: 11, color: theme.muted, textAlign: 'center', lineHeight: 16 },
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.92)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalClose: {
      position: 'absolute',
      top: 48,
      right: 20,
      zIndex: 10,
      padding: 8,
    },
    modalImage: {
      width: '94%',
      height: '80%',
    },
  });
}
