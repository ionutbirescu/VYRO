import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from 'react-native-paper';

import { logEvent } from '@/api/events';
import { AccentColor } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/contexts/auth';
import { ThemePreferenceProvider, useThemePreference } from '@/contexts/theme-preference';

const paperLight = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: AccentColor,
    secondary: '#a78bfa',
    background: '#F2F2F7',
    surface: '#FFFFFF',
    onSurface: '#000000',
    surfaceVariant: '#E5E5EA',
    onSurfaceVariant: '#6C6C70',
    outline: '#C7C7CC',
  },
};

const paperDark = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: AccentColor,
    secondary: '#a78bfa',
    background: '#000000',
    surface: '#1C1C1E',
    onSurface: '#FFFFFF',
    surfaceVariant: '#2C2C2E',
    onSurfaceVariant: '#8E8E93',
    outline: '#3A3A3C',
  },
};

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'loading') return;

    const inAuthGroup = segments[0] === 'auth';

    if (state.status === 'unauthenticated' && !inAuthGroup) {
      router.replace('/auth/login');
    } else if (state.status === 'needs_profile' && (segments as string[])[1] !== 'create-profile') {
      router.replace('/auth/create-profile');
    } else if (state.status === 'ready' && inAuthGroup) {
      router.replace('/');
    }
  }, [state.status, segments]);

  if (state.status === 'loading') return null;

  return <>{children}</>;
}

function ThemedStack() {
  const { resolvedScheme } = useThemePreference();

  useEffect(() => {
    logEvent('app_opened');
  }, []);

  return (
    <PaperProvider theme={resolvedScheme === 'dark' ? paperDark : paperLight}>
      <ThemeProvider value={resolvedScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <AuthGuard>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="auth" options={{ headerShown: false }} />
              <Stack.Screen name="challenge/[id]" options={{ title: 'Challenge' }} />
              <Stack.Screen name="challenge/leaderboard" options={{ title: 'Leaderboard' }} />
              <Stack.Screen name="challenge/chat" options={{ title: 'Chat' }} />
              <Stack.Screen name="proof/submit" options={{ title: 'Submit Proof' }} />
            </Stack>
          </AuthGuard>
        </AuthProvider>
      </ThemeProvider>
    </PaperProvider>
  );
}

export default function RootLayout() {
  useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  return (
    <ThemePreferenceProvider>
      <ThemedStack />
    </ThemePreferenceProvider>
  );
}
