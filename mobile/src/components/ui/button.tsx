'use no memo';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { AccentColor, BrandColors, GradientPrimary, InterFonts, Spacing } from '@/constants/theme';
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
    transform: [{ scale: scale.get() }],
  }));

  const bg: Record<ButtonVariant, string> = {
    primary:   AccentColor,   // overridden by gradient below
    secondary: BrandColors.cyan,
    outline:   'transparent',
    ghost:     'transparent',
    danger:    '#FF1864',
  };

  const textColor: Record<ButtonVariant, string> = {
    primary:   '#fff',
    secondary: '#0D0B1A',
    outline:   AccentColor,
    ghost:     colors.textSecondary,
    danger:    '#fff',
  };

  const paddingV: Record<ButtonSize, number> = { sm: 8, md: 14, lg: 18 };
  const fontSize:  Record<ButtonSize, number> = { sm: 13, md: 15, lg: 17 };

  const isDisabled = disabled || loading;

  const inner = (
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
  );

  return (
    <Animated.View style={[animStyle, fullWidth && styles.fullWidth]}>
      <Pressable
        onPress={isDisabled ? undefined : onPress}
        onPressIn={() => scale.set(withSpring(0.97, { mass: 0.3, damping: 12 }))}
        onPressOut={() => scale.set(withSpring(1, { mass: 0.3, damping: 12 }))}
        style={{ opacity: isDisabled ? 0.55 : 1 }}
      >
        {variant === 'primary' ? (
          <LinearGradient
            colors={GradientPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.base, { paddingVertical: paddingV[size] }]}
          >
            {inner}
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.base,
              {
                backgroundColor: bg[variant],
                paddingVertical: paddingV[size],
                borderWidth: variant === 'outline' ? 1.5 : 0,
                borderColor: variant === 'outline' ? AccentColor : 'transparent',
              },
            ]}
          >
            {inner}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWidth: { width: '100%' },
  base: {
    borderRadius: 12,
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
