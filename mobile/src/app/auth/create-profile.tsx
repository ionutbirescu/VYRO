import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Button, Checkbox, Snackbar, TextInput as PaperInput } from 'react-native-paper';

import { api } from '@/api/client';
import { useAuth } from '@/contexts/auth';
import { AccentColor, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const DETECTED_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function CreateProfileScreen() {
  const { refreshProfile, signOut } = useAuth();
  const colors = useTheme();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmsAdult, setConfirmsAdult] = useState(false);
  const [researchConsent, setResearchConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);

  function showError(msg: string) {
    setSnackMsg(msg);
    setSnackVisible(true);
  }

  async function handleCreate() {
    if (!username || !displayName) {
      showError('Please fill in all fields.');
      return;
    }
    if (!/^[a-z0-9_.]{3,32}$/.test(username)) {
      showError('Username: lowercase letters, digits, _ and . only; 3–32 characters.');
      return;
    }
    if (!confirmsAdult) {
      showError('You must confirm you are 18 or older to use VYRO.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await api.POST('/v1/me', {
        body: {
          username,
          display_name: displayName,
          timezone: DETECTED_TIMEZONE,
          confirms_adult: true,
          research_consent: researchConsent,
        },
      });
      if (error) {
        const detail =
          typeof error === 'object' && 'detail' in error ? String(error.detail) : 'Unknown error';
        showError(detail.includes('taken') ? 'Username is already taken.' : detail);
        return;
      }
      await refreshProfile();
      // AuthGuard redirects to / once profile is ready.
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const inputBg = colors.background;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.heading}>Set up your profile</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.sub}>
            This takes 30 seconds and you only do it once.
          </ThemedText>
        </View>

        <View style={styles.fields}>
          <PaperInput
            mode="outlined"
            label="Username"
            value={username}
            onChangeText={(t) => setUsername(t.toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={32}
            left={<PaperInput.Icon icon="at" />}
            placeholder="e.g. stefan.rares"
            style={{ backgroundColor: inputBg }}
          />

          <PaperInput
            mode="outlined"
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={64}
            left={<PaperInput.Icon icon="account-outline" />}
            placeholder="How others see you"
            style={{ backgroundColor: inputBg }}
          />

          <PaperInput
            mode="outlined"
            label="Timezone"
            value={DETECTED_TIMEZONE}
            editable={false}
            left={<PaperInput.Icon icon="earth" />}
            style={{ backgroundColor: inputBg }}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.backgroundSelected }]} />

        <View style={styles.consents}>
          <Pressable
            style={styles.checkRow}
            onPress={() => setConfirmsAdult((v) => !v)}>
            <Checkbox
              status={confirmsAdult ? 'checked' : 'unchecked'}
              color={AccentColor}
              onPress={() => setConfirmsAdult((v) => !v)}
            />
            <ThemedText type="small" style={styles.checkLabel}>
              I confirm I am 18 years of age or older
            </ThemedText>
          </Pressable>

          <Pressable
            style={styles.checkRow}
            onPress={() => setResearchConsent((v) => !v)}>
            <Checkbox
              status={researchConsent ? 'checked' : 'unchecked'}
              color={AccentColor}
              onPress={() => setResearchConsent((v) => !v)}
            />
            <ThemedText type="small" style={styles.checkLabel}>
              I agree to participate in the anonymous pilot study{' '}
              <ThemedText type="small" themeColor="textSecondary">(optional)</ThemedText>
            </ThemedText>
          </Pressable>
        </View>

        <Button
          mode="contained"
          onPress={handleCreate}
          loading={loading}
          disabled={loading}
          style={styles.button}
          contentStyle={styles.buttonContent}
          labelStyle={styles.buttonLabel}
          buttonColor={AccentColor}
        >
          {"Let's go"}
        </Button>

        <Pressable style={styles.signOutLink} onPress={signOut}>
          <ThemedText type="small" themeColor="textSecondary">Sign out</ThemedText>
        </Pressable>

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

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: Spacing.four,
    paddingTop: Spacing.five,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    gap: Spacing.one,
    marginBottom: Spacing.four,
    width: '100%',
    maxWidth: 440,
  },
  heading: { textAlign: 'center' },
  sub: { textAlign: 'center' },
  fields: {
    gap: Spacing.two,
    width: '100%',
    maxWidth: 440,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.three,
    width: '100%',
    maxWidth: 440,
  },
  consents: {
    gap: Spacing.two,
    width: '100%',
    maxWidth: 440,
    marginBottom: Spacing.three,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  checkLabel: { flex: 1 },
  button: {
    borderRadius: 14,
    width: '100%',
    maxWidth: 440,
  },
  buttonContent: { paddingVertical: 6 },
  buttonLabel: { fontSize: 16, fontWeight: '600', letterSpacing: 0.3 },
  signOutLink: {
    alignItems: 'center',
    marginTop: Spacing.three,
    paddingVertical: Spacing.two,
  },
  snackbar: { marginBottom: Spacing.four },
});
