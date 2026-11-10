import { Link } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Button, Snackbar, TextInput as PaperInput } from 'react-native-paper';

import { useAuth } from '@/contexts/auth';
import { AccentColor, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const colors = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);

  function showError(msg: string) {
    setSnackMsg(msg);
    setSnackVisible(true);
  }

  async function handleSignup() {
    if (!email.trim() || !password) return;
    if (password !== confirm) {
      showError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      showError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Sign-up failed';
      showError(friendlyError(message));
    } finally {
      setLoading(false);
    }
  }

  const inputBg = colors.backgroundElement;

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
            <PaperInput
              mode="outlined"
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              left={<PaperInput.Icon icon="email-outline" />}
              style={{ backgroundColor: inputBg }}
            />
            <PaperInput
              mode="outlined"
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              left={<PaperInput.Icon icon="lock-outline" />}
              right={
                <PaperInput.Icon
                  icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  onPress={() => setShowPassword((v) => !v)}
                />
              }
              style={{ backgroundColor: inputBg }}
            />
            <PaperInput
              mode="outlined"
              label="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={handleSignup}
              returnKeyType="done"
              left={<PaperInput.Icon icon="lock-check-outline" />}
              style={{ backgroundColor: inputBg }}
            />
          </View>

          <Button
            mode="contained"
            onPress={handleSignup}
            loading={loading}
            disabled={loading}
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            buttonColor={AccentColor}
          >
            Create account
          </Button>

          <View style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary">Already have an account?{' '}</ThemedText>
            <Link href="/auth/login">
              <ThemedText type="linkPrimary">Sign in</ThemedText>
            </Link>
          </View>
        </View>

      </ScrollView>

      <Snackbar
        visible={snackVisible}
        onDismiss={() => setSnackVisible(false)}
        duration={3500}
        style={styles.snackbar}
      >
        {snackMsg}
      </Snackbar>
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
  button: {
    borderRadius: 14,
    marginTop: Spacing.one,
  },
  buttonContent: { paddingVertical: 6 },
  buttonLabel: { fontSize: 16, fontWeight: '600', letterSpacing: 0.3 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  snackbar: { marginBottom: Spacing.four },
});
