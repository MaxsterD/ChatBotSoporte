import { Alert, Platform } from 'react-native';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
};

/** Alert.alert no está implementado en web; usamos confirm del navegador. */
export function showConfirm(options: ConfirmOptions) {
  if (Platform.OS === 'web') {
    const accepted =
      typeof window !== 'undefined' && window.confirm(`${options.title}\n\n${options.message}`);
    if (accepted) options.onConfirm();
    return;
  }

  Alert.alert(options.title, options.message, [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: options.confirmLabel,
      style: options.destructive ? 'destructive' : 'default',
      onPress: options.onConfirm,
    },
  ]);
}

export function showNotice(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
