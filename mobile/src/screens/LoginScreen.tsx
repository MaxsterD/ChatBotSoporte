import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as StatusBarRN,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL, RAILWAY_DEFAULT_URL, RADMIN_DEFAULT_URL, setCustomApiUrl } from '../api';
import { useSession } from '../context/SessionContext';
import { useTheme } from '../context/ThemeContext';
import { radius, type ThemeColors } from '../theme';

type Mode = 'login' | 'register';

const DEMO_ACCOUNTS = [
  { label: 'Clínica San Rafael', email: 'cliente@sismasalud.demo' },
  { label: 'IPS Salud Total', email: 'cliente2@sismasalud.demo' },
];

export function LoginScreen() {
  const { login, register } = useSession();
  const { isDark, theme, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();

  // Cálculo seguro para librar la barra de notificaciones superior del celular (notch/cámara/reloj)
  const androidStatusBar = StatusBarRN.currentHeight || 24;
  const topSafePadding = Math.max(insets.top, Platform.OS === 'android' ? androidStatusBar : 0);

  // Cálculo seguro para librar los botones de acción del celular (Atrás, Inicio, Recientes o barra de gestos)
  const bottomSafePadding = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 10);

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('cliente@sismasalud.demo');
  const [password, setPassword] = useState('demo1234');
  const [secure, setSecure] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [currentUrl, setCurrentUrl] = useState(API_URL);
  const [showServerModal, setShowServerModal] = useState(false);
  const [editingUrl, setEditingUrl] = useState(API_URL);

  async function handleSaveServerUrl() {
    if (!editingUrl.trim()) return;
    const updated = await setCustomApiUrl(editingUrl.trim());
    setCurrentUrl(updated);
    setShowServerModal(false);
  }

  async function submit() {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@')) {
      setError('Escribe un correo válido.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (mode === 'register' && name.trim().length < 2) {
      setError('Escribe tu nombre o el de tu institución.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(cleanEmail, password);
      } else {
        await register(name, cleanEmail, password);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  const styles = createStyles(theme);

  return (
    <View style={styles.safe}>
      <View style={styles.orbTop} />
      <View style={styles.orbBottom} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: topSafePadding + 10,
              paddingBottom: bottomSafePadding + 18,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Superior - siempre debajo de la barra de notificaciones del celular */}
          <View style={styles.brandRow}>
            <View style={styles.logoBadge}>
              <Image
                source={require('../../assets/sismasalud.png')}
                style={styles.logoImg}
                resizeMode="contain"
              />
            </View>
            <View style={styles.brandRowRight}>
              <Pressable onPress={toggleTheme} hitSlop={8} style={styles.themeToggle}>
                <Ionicons
                  name={isDark ? 'sunny-outline' : 'moon-outline'}
                  size={17}
                  color={isDark ? '#fcd34d' : '#80deea'}
                />
              </Pressable>
              <View style={styles.brandBadge}>
                <Text style={styles.brandBadgeText}>SOPORTE</Text>
              </View>
            </View>
          </View>

          <Text style={styles.headline}>¿Necesitas ayuda con SismaSalud?</Text>
          <Text style={styles.description}>
            Consulta con nuestro agente especializado en SismaSalud o solicita conexión directa con un consultor.
          </Text>

          <View style={styles.card}>
            <View style={styles.segment}>
              {(['login', 'register'] as Mode[]).map((item) => {
                const active = mode === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => {
                      setMode(item);
                      setError(null);
                    }}
                    style={[styles.segmentButton, active && styles.segmentButtonActive]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {item === 'login' ? 'Ingresar' : 'Crear cuenta'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {mode === 'register' && (
              <View style={styles.field}>
                <Text style={styles.label}>Nombre de la institución</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="business-outline" size={17} color={theme.faint} />
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Clínica San Rafael"
                    placeholderTextColor={theme.faint}
                    style={styles.input}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Correo</Text>
              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={17} color={theme.faint} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="usuario@institucion.com"
                  placeholderTextColor={theme.faint}
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Contraseña</Text>
              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={17} color={theme.faint} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mínimo 8 caracteres"
                  placeholderTextColor={theme.faint}
                  secureTextEntry={secure}
                  style={styles.input}
                  returnKeyType="done"
                  onSubmitEditing={() => void submit()}
                />
                <Pressable onPress={() => setSecure((value) => !value)} hitSlop={10}>
                  <Ionicons
                    name={secure ? 'eye-outline' : 'eye-off-outline'}
                    size={17}
                    color={theme.faint}
                  />
                </Pressable>
              </View>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#fda4af" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              onPress={() => void submit()}
              disabled={loading}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>
                    {mode === 'login' ? 'Iniciar sesión' : 'Registrarme'}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                </>
              )}
            </Pressable>
          </View>

          <View style={styles.demoBox}>
            <Text style={styles.demoTitle}>ACCESOS DE DEMOSTRACIÓN · CLAVE: demo1234</Text>
            <View style={styles.demoRow}>
              {DEMO_ACCOUNTS.map((account) => (
                <Pressable
                  key={account.email}
                  onPress={() => {
                    setEmail(account.email);
                    setPassword('demo1234');
                    setMode('login');
                  }}
                  style={({ pressed }) => [styles.demoChip, pressed && styles.demoChipPressed]}
                >
                  <Text style={styles.demoChipText}>{account.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            onPress={() => {
              setEditingUrl(currentUrl);
              setShowServerModal(true);
            }}
            style={({ pressed }) => [styles.serverButton, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="wifi" size={13} color="#06a1b9" />
            <Text style={styles.apiHint}>
              Servidor: <Text style={{ color: '#06a1b9', fontWeight: '700' }}>{currentUrl}</Text> (toca para cambiar)
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showServerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowServerModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="server-outline" size={20} color="#06a1b9" />
              <Text style={styles.modalTitle}>Dirección del Servidor</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              Configura la IP o URL del backend para conectar por Radmin VPN o red local:
            </Text>

            <TextInput
              value={editingUrl}
              onChangeText={setEditingUrl}
              placeholder="http://26.237.103.241:4000"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.modalInput}
            />

            <View style={styles.quickPresets}>
              <Text style={styles.presetsLabel}>Accesos rápidos:</Text>
              <Pressable
                onPress={() => setEditingUrl(RAILWAY_DEFAULT_URL)}
                style={styles.presetChip}
              >
                <Text style={styles.presetChipText}>☁️ Railway Producción ({RAILWAY_DEFAULT_URL})</Text>
              </Pressable>
              <Pressable
                onPress={() => setEditingUrl('http://localhost:4000')}
                style={styles.presetChip}
              >
                <Text style={styles.presetChipText}>💻 Localhost (http://localhost:4000)</Text>
              </Pressable>
              <Pressable
                onPress={() => setEditingUrl(RADMIN_DEFAULT_URL)}
                style={styles.presetChip}
              >
                <Text style={styles.presetChipText}>⚡ Radmin VPN ({RADMIN_DEFAULT_URL})</Text>
              </Pressable>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowServerModal(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveServerUrl}
                style={styles.modalSaveBtn}
              >
                <Text style={styles.modalSaveText}>Guardar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.navy },
    flex: { flex: 1 },
    content: { paddingHorizontal: 22 },
    orbTop: {
      position: 'absolute',
      top: -90,
      right: -70,
      width: 240,
      height: 240,
      borderRadius: 120,
      backgroundColor: 'rgba(6,161,185,0.22)',
    },
    orbBottom: {
      position: 'absolute',
      bottom: -60,
      left: -80,
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: 'rgba(128,222,234,0.15)',
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    brandRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    themeToggle: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoBadge: {
      backgroundColor: theme.navyCard,
      borderColor: 'rgba(6, 161, 185, 0.4)',
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.md,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 5,
      elevation: 3,
    },
    logoImg: { width: 140, height: 32 },
    brandBadge: {
      backgroundColor: 'rgba(6,161,185,0.20)',
      borderColor: theme.primary,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.sm,
    },
    brandBadgeText: { color: '#80deea', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    headline: {
      color: '#ffffff',
      fontSize: 26,
      fontWeight: '800',
      marginTop: 26,
      lineHeight: 32,
    },
    description: {
      color: '#cbd5e1',
      fontSize: 13,
      lineHeight: 20,
      marginTop: 10,
      marginBottom: 22,
    },
    card: {
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      padding: 16,
      gap: 12,
    },
    segment: {
      flexDirection: 'row',
      backgroundColor: 'rgba(15,23,42,0.55)',
      borderRadius: radius.md,
      padding: 3,
    },
    segmentButton: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
    segmentButtonActive: { backgroundColor: theme.primary },
    segmentText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
    segmentTextActive: { color: '#ffffff' },
    field: { gap: 6 },
    label: { color: '#cbd5e1', fontSize: 11, fontWeight: '700' },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      backgroundColor: 'rgba(15,23,42,0.55)',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      paddingHorizontal: 12,
      height: 46,
    },
    input: { flex: 1, color: '#ffffff', fontSize: 13.5, paddingVertical: 0 },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      backgroundColor: 'rgba(244,63,94,0.14)',
      borderRadius: radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    errorText: { flex: 1, color: '#fda4af', fontSize: 12, lineHeight: 17 },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.primary,
      borderRadius: radius.md,
      paddingVertical: 13,
      marginTop: 2,
    },
    primaryButtonPressed: { opacity: 0.75 },
    primaryButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
    demoBox: {
      marginTop: 18,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      padding: 12,
      gap: 9,
    },
    demoTitle: { color: '#94a3b8', fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
    demoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    demoChip: {
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderRadius: radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    demoChipPressed: { backgroundColor: 'rgba(255,255,255,0.16)' },
    demoChipText: { color: '#e2e8f0', fontSize: 11, fontWeight: '600' },
    serverButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 14,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: 'rgba(6,161,185,0.08)',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: 'rgba(6,161,185,0.25)',
      alignSelf: 'center',
    },
    apiHint: { color: '#94a3b8', fontSize: 10, textAlign: 'center' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(11,26,44,0.78)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: '#0d2238',
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
      padding: 20,
      gap: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modalTitle: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700',
    },
    modalSubtitle: {
      color: '#94a3b8',
      fontSize: 12,
      lineHeight: 17,
    },
    modalInput: {
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: '#ffffff',
      fontSize: 13,
    },
    quickPresets: {
      gap: 6,
    },
    presetsLabel: {
      color: '#64748b',
      fontSize: 10,
      fontWeight: '600',
    },
    presetChip: {
      backgroundColor: 'rgba(6,161,185,0.10)',
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: 'rgba(6,161,185,0.25)',
    },
    presetChipText: {
      color: '#38bdf8',
      fontSize: 11,
      fontWeight: '600',
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 8,
    },
    modalCancelBtn: {
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: radius.sm,
    },
    modalCancelText: {
      color: '#94a3b8',
      fontSize: 13,
      fontWeight: '600',
    },
    modalSaveBtn: {
      backgroundColor: theme.primary,
      paddingVertical: 9,
      paddingHorizontal: 18,
      borderRadius: radius.sm,
    },
    modalSaveText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '700',
    },
  });
}
