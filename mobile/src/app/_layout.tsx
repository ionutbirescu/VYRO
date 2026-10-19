import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { logEvent } from '@/api/events';
import { AuthProvider, useAuth } from '@/contexts/auth';
import { ThemePreferenceProvider, useThemePreference } from '@/contexts/theme-preference';

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
  );
}

export default function RootLayout() {
  return (
    <ThemePreferenceProvider>
      <ThemedStack />
    </ThemePreferenceProvider>
  );
}
