import '@/global.css';

import { Platform } from 'react-native';

// GTA 6 / Miami Vice — sunset neon palette
export const BrandColors = {
  headerBg:    '#0D0B1A',   // deep night — darkest background
  pink:        '#FF1864',   // sunset pink — primary accent / gradient start
  coral:       '#FF6035',   // sunset coral — gradient end
  cyan:        '#00E5FF',   // neon ocean blue — secondary accent
  orange:      '#FF6035',   // warm coral — energy/streak
  purple:      '#BF5FFF',   // electric purple
  green:       '#00C57E',   // neon green
} as const;

// Full dark mode — same palette for both light and dark so the GTA6 theme
// is always on regardless of system preference.
const GTA6_DARK = {
  text:                '#FFFFFF',
  background:          '#0D0B1A',
  backgroundElement:   '#1A1530',
  backgroundSelected:  '#241D3D',
  textSecondary:       '#A89BC2',
} as const;

export const Colors = {
  light: GTA6_DARK,
  dark:  GTA6_DARK,
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
  regular:  'SpaceGrotesk_400Regular',
  medium:   'SpaceGrotesk_500Medium',
  semiBold: 'SpaceGrotesk_600SemiBold',
  bold:     'SpaceGrotesk_700Bold',
} as const;

// Restrained palette for tab screens: one accent, everything else neutral.
export const UI = {
  bg:        '#0D0B1A',
  surface:   '#17142A',
  surfaceHi: '#221D3A',
  line:      'rgba(255,255,255,0.08)',
  text:      '#F4F1FA',
  muted:     '#A39BBA',
  faint:     '#6F6789',
  accent:    BrandColors.pink,
  success:   '#3DD68C',
} as const;

export const CategoryDot: Record<string, string> = {
  fitness: '#FF6B6B', nutrition: '#7BD389', mindfulness: '#B794F6', sleep: '#6CA8FF',
  learning: '#FFC857', reading: '#F4A261', creativity: '#F28FB1', productivity: '#5EC8D8',
  social: '#FF8FA3', outdoors: '#59C9A5', sustainability: '#8BC34A', finance: '#E9C46A',
  digital_detox: '#9AA5B1',
};

export const AccentColor  = BrandColors.pink;
export const StreakColor  = BrandColors.orange;
export const SuccessColor = BrandColors.green;

// Gradient for primary buttons: pink → coral (sunset)
export const GradientPrimary: [string, string] = [BrandColors.pink, BrandColors.coral];

export const DifficultyColors: Record<number, { label: string; color: string }> = {
  1: { label: 'Easy',      color: BrandColors.cyan   },  // neon blue
  2: { label: 'Medium',    color: BrandColors.coral  },  // sunset coral
  3: { label: 'Hard',      color: BrandColors.pink   },  // hot pink
  4: { label: 'Very Hard', color: BrandColors.purple },  // electric purple
  5: { label: 'Extreme',   color: '#FF0040'          },  // deep red
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
