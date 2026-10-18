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
      // AuthGuard in _layout.tsx handles the redirect after state updates.
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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ThemedText type="title" style={styles.logo}>VYRO</ThemedText>
        <ThemedText type="subtitle" style={styles.heading}>Welcome back</ThemedText>

        <TextInput
          style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text }]}
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
          style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text }]}
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

        <Pressable
          style={[styles.button, { backgroundColor: colors.text, opacity: loading ? 0.6 : 1 }]}
          onPress={handleLogin}
          disabled={loading}>
          <ThemedText style={{ color: colors.background, fontWeight: '600' }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </ThemedText>
        </Pressable>

        <View style={styles.footer}>
          <ThemedText type="small" themeColor="textSecondary">Don&apos;t have an account?{' '}</ThemedText>
          <Link href="/auth/signup">
            <ThemedText type="linkPrimary">Sign up</ThemedText>
          </Link>
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
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four },
  logo: { textAlign: 'center', marginBottom: Spacing.two },
  heading: { marginBottom: Spacing.four },
  input: {
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    fontSize: 16,
  },
  button: {
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
});
