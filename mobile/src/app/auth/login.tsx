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

export default function LoginScreen() {
  const { signIn } = useAuth();
  const colors = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);

  function showError(msg: string) {
    setSnackMsg(msg);
    setSnackVisible(true);
  }

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Sign-in failed';
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
          <ThemedText type="subtitle" style={styles.heading}>Welcome back</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.sub}>
            Sign in to continue your challenges.
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
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={handleLogin}
              returnKeyType="done"
              left={<PaperInput.Icon icon="lock-outline" />}
              right={
                <PaperInput.Icon
                  icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  onPress={() => setShowPassword((v) => !v)}
                />
              }
              style={{ backgroundColor: inputBg }}
            />
          </View>

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
            buttonColor={AccentColor}
          >
            Sign in
          </Button>

          <View style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary">Don&apos;t have an account?{' '}</ThemedText>
            <Link href="/auth/signup">
              <ThemedText type="linkPrimary">Sign up</ThemedText>
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
