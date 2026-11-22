import '@/global.css';

import { Platform } from 'react-native';

// GTA 6 / Miami Vice palette
export const BrandColors = {
  headerBg:    '#0D0A1E',   // deep night sky
  pink:        '#FF2D78',   // hot pink — primary accent
  cyan:        '#00D9C8',   // teal cyan — secondary accent
  orange:      '#FF6B00',   // warm orange — energy/streak
  purple:      '#BF5FFF',   // electric purple
  green:       '#00C57E',   // neon green
} as const;

export const Colors = {
  light: {
    text:                '#1A0A2E',
    background:          '#F7F0FF',
    backgroundElement:   '#FFFFFF',
    backgroundSelected:  '#EDE0FF',
    textSecondary:       '#7B5FA0',
  },
  dark: {
    text:                '#FFFFFF',
    background:          '#0D0A1E',
    backgroundElement:   '#1A1432',
    backgroundSelected:  '#26193F',
    textSecondary:       '#9B8EC4',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans:    'system-ui',
    serif:   'ui-serif',
    rounded: 'ui-rounded',
    mono:    'ui-monospace',
  },
  default: {
    sans:    'normal',
    serif:   'serif',
    rounded: 'normal',
    mono:    'monospace',
  },
  web: {
    sans:    'var(--font-display)',
    serif:   'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono:    'var(--font-mono)',
  },
});

export const InterFonts = {
  regular:  'Inter_400Regular',
  medium:   'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold:     'Inter_700Bold',
} as const;

export const AccentColor  = BrandColors.pink;
export const StreakColor  = BrandColors.orange;
export const SuccessColor = BrandColors.green;

export const DifficultyColors: Record<number, { label: string; color: string }> = {
  1: { label: 'Easy',      color: BrandColors.green  },
  2: { label: 'Medium',    color: BrandColors.cyan   },
  3: { label: 'Hard',      color: BrandColors.orange },
  4: { label: 'Very Hard', color: BrandColors.pink   },
  5: { label: 'Extreme',   color: BrandColors.purple },
};

export const Spacing = {
  half:  2,
  one:   4,
  two:   8,
  three: 16,
  four:  24,
  five:  32,
  six:   64,
} as const;

export const BottomTabInset  = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const TabBarWebInset  = Platform.select({ web: 48, default: 0 }) ?? 0;
export const MaxContentWidth = 800;
