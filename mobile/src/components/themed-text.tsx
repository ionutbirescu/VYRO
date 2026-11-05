import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, InterFonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[nativeFontFamily[type], { color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const nativeFontFamily: Record<NonNullable<ThemedTextProps['type']>, object> = {
  default:    { fontFamily: InterFonts.medium },
  small:      { fontFamily: InterFonts.medium },
  smallBold:  { fontFamily: InterFonts.bold },
  title:      { fontFamily: InterFonts.semiBold },
  subtitle:   { fontFamily: InterFonts.semiBold },
  link:       { fontFamily: InterFonts.regular },
  linkPrimary:{ fontFamily: InterFonts.medium },
  code:       { fontFamily: Fonts.mono },
};

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontSize: 48,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: '#3c87f7',
  },
  code: {
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
