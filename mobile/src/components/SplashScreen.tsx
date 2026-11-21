import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

export function SplashScreen({ message = 'Preparando tu soporte…' }: { message?: string }) {
  return (
    <View style={styles.splash}>
      <StatusBar style="light" />
      <View style={styles.logo}>
        <Text style={styles.logoText}>SS</Text>
      </View>
      <Text style={styles.title}>Soporte SismaSalud</Text>
      <Text style={styles.message}>{message}</Text>
      <ActivityIndicator color="#a5b4fc" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logo: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: colors.white, fontWeight: '900', fontSize: 17 },
  title: { color: colors.white, fontSize: 14, fontWeight: '700', marginTop: 4 },
  message: { color: '#94a3b8', fontSize: 11.5 },
  spinner: { marginTop: 10 },
});
