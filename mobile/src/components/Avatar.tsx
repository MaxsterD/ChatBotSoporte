import { StyleSheet, Text, View } from 'react-native';
import { initials } from '../format';
import { colors } from '../theme';

export function Avatar({
  name,
  size = 40,
  tone = 'slate',
}: {
  name?: string | null;
  size?: number;
  tone?: 'slate' | 'indigo' | 'amber' | 'emerald';
}) {
  const palette = {
    slate: { backgroundColor: '#e2e8f0', color: '#475569' },
    indigo: { backgroundColor: colors.primary, color: colors.white },
    amber: { backgroundColor: colors.amberSoft, color: colors.amber },
    emerald: { backgroundColor: colors.emeraldSoft, color: colors.emerald },
  }[tone];

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: palette.backgroundColor,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: palette.color, fontSize: Math.max(10, Math.round(size * 0.3)) },
        ]}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '800', letterSpacing: 0.3 },
});
