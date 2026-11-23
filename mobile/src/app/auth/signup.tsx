import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/contexts/auth';
import { BrandColors, InterFonts, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/hooks/use-theme';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const colors = useTheme();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSignup() {
    if (!email.trim() || !password) return;
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return; }
    setError('');
    setLoading(true);
    try {
      await signUp(email.trim(), password);
    } catch (e: unknown) {
      setError(friendlyError(e instanceof Error ? e.message : 'Sign-up failed'));
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
            <ThemedText style={styles.heading}>Create account</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.sub}>
              Start your first challenge today.
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
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="••••••••"
            />
            <Input
              label="Confirm password"
              leftIcon="shield-checkmark-outline"
              isPassword
              value={confirm}
              onChangeText={setConfirm}
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={handleSignup}
              returnKeyType="done"
              placeholder="••••••••"
            />
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          <Button label="Create account" onPress={handleSignup} loading={loading} disabled={loading} />

          <View style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary">Already have an account?{' '}</ThemedText>
            <Link href="/auth/login">
              <ThemedText type="linkPrimary">Sign in</ThemedText>
            </Link>
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendlyError(message: string): string {
  if (message.includes('email-already-in-use')) return 'An account with that email already exists.';
  if (message.includes('invalid-email')) return 'Enter a valid email address.';
  if (message.includes('weak-password')) return 'Choose a stronger password.';
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
    fontFamily: InterFonts.bold,
    fontSize: 32,
    lineHeight: 44,
    color: BrandColors.pink,
    letterSpacing: 4,
    paddingLeft: 4, // balances the trailing letter-spacing so the word stays centred
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
