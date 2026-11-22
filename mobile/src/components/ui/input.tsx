import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AccentColor, InterFonts, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type InputProps = TextInputProps & {
  label?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  error?: string;
  isPassword?: boolean;
};

export function Input({ label, leftIcon, error, isPassword, style, ...props }: InputProps) {
  const colors = useTheme();
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const borderColor = error
    ? '#EF4444'
    : focused
      ? AccentColor
      : colors.backgroundSelected;

  return (
    <View style={styles.wrapper}>
      {label && (
        <ThemedText style={[styles.label, { color: focused ? AccentColor : colors.textSecondary }]}>
          {label}
        </ThemedText>
      )}
      <View style={[styles.container, { backgroundColor: colors.backgroundElement, borderColor }]}>
        {leftIcon && (
          <Ionicons
            name={leftIcon}
            size={18}
            color={focused ? AccentColor : colors.textSecondary}
            style={styles.leftIcon}
          />
        )}
        <TextInput
          {...props}
          secureTextEntry={isPassword && !showPassword}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            {
              color: colors.text,
              fontFamily: InterFonts.medium,
            },
            style as object,
          ]}
        />
        {isPassword && (
          <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn} hitSlop={8}>
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>
        )}
      </View>
      {error && (
        <ThemedText style={styles.error}>{error}</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.one },
  label: {
    fontSize: 12,
    fontFamily: InterFonts.semiBold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    gap: Spacing.two,
  },
  leftIcon: { flexShrink: 0 },
  input: {
    flex: 1,
    fontSize: 15,
    padding: 0,
    outlineStyle: 'none',
  } as object,
  eyeBtn: { flexShrink: 0 },
  error: {
    fontSize: 12,
    color: '#EF4444',
    fontFamily: InterFonts.medium,
  },
});
