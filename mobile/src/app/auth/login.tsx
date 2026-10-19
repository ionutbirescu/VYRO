import { Link } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/contexts/auth';
import { Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const colors = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Sign-in failed';
      Alert.alert('Sign-in failed', friendlyError(message));
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
          <ThemedText type="title" style={styles.logo}>VYRO</ThemedText>
          <ThemedText type="subtitle" style={styles.heading}>Welcome back</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.sub}>
            Sign in to continue your challenges.
          </ThemedText>

          <View style={styles.fields}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.backgroundSelected }]}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.backgroundSelected }]}
              placeholder="Password"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={handleLogin}
              returnKeyType="done"
            />
          </View>

          <Pressable
            style={[styles.button, { opacity: loading ? 0.6 : 1 }]}
            onPress={handleLogin}
            disabled={loading}>
            <ThemedText style={styles.buttonText}>
              {loading ? 'Signing in…' : 'Sign in'}
            </ThemedText>
          </Pressable>

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
  logo: { textAlign: 'center', letterSpacing: 4 },
  heading: { textAlign: 'center' },
  sub: { textAlign: 'center', marginTop: -Spacing.two },
  fields: { gap: Spacing.two },
  input: {
    borderRadius: 12,
    padding: Spacing.three,
    fontSize: 16,
    borderWidth: 1,
  },
  button: {
    borderRadius: 14,
    padding: Spacing.three,
    alignItems: 'center',
    backgroundColor: '#007AFF',
    marginTop: Spacing.one,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
