import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { ChatStatus } from '../types';

export function StatusPill({ status, compact = false }: { status: ChatStatus; compact?: boolean }) {
  const { statusMeta } = useTheme();
  const meta = statusMeta[status];

  return (
    <View
      style={[
        styles.pill,
        compact && styles.compact,
        { backgroundColor: meta.background, borderColor: meta.border },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: meta.color }]} />
      <Text style={[styles.label, compact && styles.labelCompact, { color: meta.color }]}>
        {meta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  compact: { paddingHorizontal: 7, paddingVertical: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: '700' },
  labelCompact: { fontSize: 10 },
});
