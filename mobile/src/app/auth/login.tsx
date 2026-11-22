import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/contexts/auth';
import { BrandColors, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const colors = useTheme();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setError('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: unknown) {
      setError(friendlyError(e instanceof Error ? e.message : 'Sign-in failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText style={styles.logo}>VYRO</ThemedText>

          <View style={styles.headingGroup}>
            <ThemedText style={styles.heading}>Welcome back</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.sub}>
              Sign in to continue your challenges.
            </ThemedText>
          </View>

          <View style={styles.fields}>
            <Input
              label="Email"
              leftIcon="mail-outline"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              leftIcon="lock-closed-outline"
              isPassword
              value={password}
              onChangeText={setPassword}
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={handleLogin}
              returnKeyType="done"
              placeholder="••••••••"
            />
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          <Button label="Sign in" onPress={handleLogin} loading={loading} disabled={loading} />

          <View style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary">Don&apos;t have an account?{' '}</ThemedText>
            <Link href="/auth/signup">
              <ThemedText type="linkPrimary">Sign up</ThemedText>
            </Link>
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendlyError(message: string): string {
  if (message.includes('invalid-credential') || message.includes('wrong-password'))
    return 'Incorrect email or password.';
  if (message.includes('user-not-found')) return 'No account with that email.';
  if (message.includes('too-many-requests')) return 'Too many attempts. Try again later.';
  return message;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 24,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  logo: {
    textAlign: 'center',
    fontSize: 32,
    fontWeight: '900',
    color: BrandColors.pink,
    letterSpacing: 4,
  },
  headingGroup: { gap: 4 },
  heading: { fontSize: 22, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 },
  sub: { textAlign: 'center', fontSize: 14 },
  fields: { gap: Spacing.three },
  errorBanner: {
    backgroundColor: '#EF444420',
    borderRadius: 10,
    padding: Spacing.two + 4,
  },
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center', fontWeight: '500' },
  footer: { flexDirection: 'row', justifyContent: 'center' },
});
