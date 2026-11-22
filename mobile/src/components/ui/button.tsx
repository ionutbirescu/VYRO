'use no memo';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { AccentColor, BrandColors, InterFonts, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize    = 'sm' | 'md' | 'lg';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = true,
}: ButtonProps) {
  const colors = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bg: Record<ButtonVariant, string> = {
    primary:   AccentColor,
    secondary: BrandColors.cyan,
    outline:   'transparent',
    ghost:     'transparent',
    danger:    '#EF4444',
  };

  const textColor: Record<ButtonVariant, string> = {
    primary:   '#fff',
    secondary: '#0D0A1E',
    outline:   AccentColor,
    ghost:     colors.textSecondary,
    danger:    '#fff',
  };

  const paddingV: Record<ButtonSize, number> = { sm: 8, md: 14, lg: 18 };
  const fontSize:  Record<ButtonSize, number> = { sm: 13, md: 15, lg: 17 };

  const isDisabled = disabled || loading;

  return (
    <Animated.View style={[animStyle, fullWidth && styles.fullWidth]}>
      <Pressable
        onPress={isDisabled ? undefined : onPress}
        onPressIn={() => { scale.value = withSpring(0.97, { mass: 0.3, damping: 12 }); }}
        onPressOut={() => { scale.value = withSpring(1, { mass: 0.3, damping: 12 }); }}
        style={[
          styles.base,
          {
            backgroundColor: bg[variant],
            paddingVertical: paddingV[size],
            opacity: isDisabled ? 0.55 : 1,
            borderWidth: variant === 'outline' ? 1.5 : 0,
            borderColor: variant === 'outline' ? AccentColor : 'transparent',
          },
        ]}
      >
        <View style={styles.row}>
          {loading && (
            <ActivityIndicator
              size="small"
              color={textColor[variant]}
              style={styles.spinner}
            />
          )}
          <ThemedText
            style={{
              color: textColor[variant],
              fontSize: fontSize[size],
              fontFamily: InterFonts.bold,
              letterSpacing: -0.2,
            }}
          >
            {label}
          </ThemedText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWidth: { width: '100%' },
  base: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  spinner: { marginRight: 2 },
});
