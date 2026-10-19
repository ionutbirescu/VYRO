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

import { api } from '@/api/client';
import { useAuth } from '@/contexts/auth';
import { Spacing } from '@/constants/theme';
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

  async function handleCreate() {
    if (!username || !displayName) {
      Alert.alert('Fill in all fields');
      return;
    }
    if (!/^[a-z0-9_.]{3,32}$/.test(username)) {
      Alert.alert('Invalid username', 'Lowercase letters, digits, _ and . only; 3-32 characters.');
      return;
    }
    if (!confirmsAdult) {
      Alert.alert('Age confirmation required', 'You must be 18 or older to use VYRO.');
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
        Alert.alert('Could not create profile', detail.includes('taken') ? 'Username is already taken.' : detail);
        return;
      }
      await refreshProfile();
      // AuthGuard redirects to / once profile is ready.
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ThemedText type="subtitle" style={styles.heading}>Set up your profile</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.sub}>
          This takes 30 seconds and you only do it once.
        </ThemedText>

        <ThemedText type="smallBold" style={styles.label}>Username</ThemedText>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.backgroundSelected }]}
          placeholder="e.g. stefan.rares"
          placeholderTextColor={colors.textSecondary}
          value={username}
          onChangeText={(t) => setUsername(t.toLowerCase())}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={32}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Lowercase letters, digits, _ and . · 3-32 characters
        </ThemedText>

        <ThemedText type="smallBold" style={styles.label}>Display name</ThemedText>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.backgroundSelected }]}
          placeholder="How others see you"
          placeholderTextColor={colors.textSecondary}
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={64}
        />

        <ThemedText type="smallBold" style={styles.label}>Timezone</ThemedText>
        <View style={[styles.readOnly, { backgroundColor: colors.background, borderColor: colors.backgroundSelected }]}>
          <ThemedText themeColor="textSecondary">{DETECTED_TIMEZONE}</ThemedText>
        </View>

        <View style={styles.divider} />

        <Pressable style={styles.checkRow} onPress={() => setConfirmsAdult((v) => !v)}>
          <View style={[styles.checkbox, { borderColor: colors.textSecondary, backgroundColor: confirmsAdult ? colors.text : 'transparent' }]} />
          <ThemedText type="small" style={styles.checkLabel}>
            I confirm I am 18 years of age or older
          </ThemedText>
        </Pressable>

        <Pressable style={styles.checkRow} onPress={() => setResearchConsent((v) => !v)}>
          <View style={[styles.checkbox, { borderColor: colors.textSecondary, backgroundColor: researchConsent ? colors.text : 'transparent' }]} />
          <ThemedText type="small" style={styles.checkLabel}>
            I agree to participate in the anonymous pilot study (optional — you can still use the app without this)
          </ThemedText>
        </Pressable>

        <Pressable
          style={[styles.button, { opacity: loading ? 0.6 : 1 }]}
          onPress={handleCreate}
          disabled={loading}>
          <ThemedText style={styles.buttonText}>
            {loading ? 'Creating…' : "Let's go"}
          </ThemedText>
        </Pressable>

        <Pressable style={styles.signOutLink} onPress={signOut}>
          <ThemedText type="small" themeColor="textSecondary">Sign out</ThemedText>
        </Pressable>
      </ScrollView>
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
  heading: { marginBottom: Spacing.one },
  sub: { marginBottom: Spacing.four },
  label: { marginBottom: Spacing.one, marginTop: Spacing.three },
  hint: { marginTop: Spacing.one },
  input: {
    borderRadius: 12,
    padding: Spacing.three,
    fontSize: 16,
    borderWidth: 1,
    width: '100%',
    maxWidth: 440,
  },
  readOnly: {
    borderRadius: 12,
    padding: Spacing.three,
    borderWidth: 1,
    width: '100%',
    maxWidth: 440,
  },
  divider: { height: 1, marginVertical: Spacing.three, width: '100%', maxWidth: 440 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginBottom: Spacing.three,
    width: '100%',
    maxWidth: 440,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    marginTop: 2,
    flexShrink: 0,
  },
  checkLabel: { flex: 1 },
  button: {
    borderRadius: 14,
    padding: Spacing.three,
    alignItems: 'center',
    backgroundColor: '#007AFF',
    marginTop: Spacing.two,
    width: '100%',
    maxWidth: 440,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  signOutLink: {
    alignItems: 'center',
    marginTop: Spacing.three,
  },
});
