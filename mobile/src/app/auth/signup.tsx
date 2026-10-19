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

export default function SignupScreen() {
  const { signUp } = useAuth();
  const colors = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!email.trim() || !password) return;
    if (password !== confirm) {
      Alert.alert('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Sign-up failed';
      Alert.alert('Sign-up failed', friendlyError(message));
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
          <ThemedText type="subtitle" style={styles.heading}>Create account</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.sub}>
            Start your first challenge today.
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
              autoComplete="new-password"
              textContentType="newPassword"
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.backgroundSelected }]}
              placeholder="Confirm password"
              placeholderTextColor={colors.textSecondary}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={handleSignup}
              returnKeyType="done"
            />
          </View>

          <Pressable
            style={[styles.button, { opacity: loading ? 0.6 : 1 }]}
            onPress={handleSignup}
            disabled={loading}>
            <ThemedText style={styles.buttonText}>
              {loading ? 'Creating account…' : 'Sign up'}
            </ThemedText>
          </Pressable>

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
