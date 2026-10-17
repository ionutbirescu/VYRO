import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { logEvent } from '@/api/events';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    logEvent('app_opened');
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="challenge/[id]" options={{ title: 'Challenge' }} />
      </Stack>
    </ThemeProvider>
  );
}
