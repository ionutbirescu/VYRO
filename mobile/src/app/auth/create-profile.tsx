import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { api } from '@/api/client';
import { useAuth } from '@/contexts/auth';
import { AccentColor, BrandColors, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/hooks/use-theme';

const DETECTED_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function Checkbox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: React.ReactNode }) {
  const colors = useTheme();
  return (
    <Pressable style={styles.checkRow} onPress={onToggle}>
      <View style={[
        styles.checkBox,
        { borderColor: checked ? AccentColor : colors.backgroundSelected,
          backgroundColor: checked ? AccentColor : 'transparent' },
      ]}>
        {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <View style={styles.checkLabelWrap}>
        {label}
      </View>
    </Pressable>
  );
}

export default function CreateProfileScreen() {
  const { refreshProfile, signOut } = useAuth();
  const colors = useTheme();

  const [username, setUsername]           = useState('');
  const [displayName, setDisplayName]     = useState('');
  const [confirmsAdult, setConfirmsAdult] = useState(false);
  const [researchConsent, setResearchConsent] = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');

  async function handleCreate() {
    if (!username || !displayName) { setError('Please fill in all fields.'); return; }
    if (!/^[a-z0-9_.]{3,32}$/.test(username)) {
      setError('Username: lowercase letters, digits, _ and . only; 3–32 characters.');
      return;
    }
    if (!confirmsAdult) { setError('You must confirm you are 18 or older to use VYRO.'); return; }

    setError('');
    setLoading(true);
    try {
      const { error: apiErr } = await api.POST('/v1/me', {
        body: {
          username,
          display_name: displayName,
          timezone: DETECTED_TIMEZONE,
          confirms_adult: true,
          research_consent: researchConsent,
        },
      });
      if (apiErr) {
        const detail =
          typeof apiErr === 'object' && 'detail' in apiErr ? String(apiErr.detail) : 'Unknown error';
        setError(detail.includes('taken') ? 'Username is already taken.' : detail);
        return;
      }
      await refreshProfile();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
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

        <View style={styles.header}>
          <ThemedText style={styles.logo}>VYRO</ThemedText>
          <ThemedText type="subtitle" style={styles.heading}>Set up your profile</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.sub}>
            This takes 30 seconds and you only do it once.
          </ThemedText>
        </View>

        <View style={styles.fields}>
          <Input
            label="Username"
            leftIcon="at-outline"
            value={username}
            onChangeText={(t) => setUsername(t.toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={32}
            placeholder="e.g. stefan.rares"
          />
          <Input
            label="Display name"
            leftIcon="person-outline"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={64}
            placeholder="How others see you"
          />
          <Input
            label="Timezone"
            leftIcon="earth-outline"
            value={DETECTED_TIMEZONE}
            editable={false}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.backgroundSelected }]} />

        <View style={styles.consents}>
          <Checkbox
            checked={confirmsAdult}
            onToggle={() => setConfirmsAdult((v) => !v)}
            label={
              <ThemedText type="small">
                I confirm I am 18 years of age or older
              </ThemedText>
            }
          />
          <Checkbox
            checked={researchConsent}
            onToggle={() => setResearchConsent((v) => !v)}
            label={
              <ThemedText type="small">
                I agree to participate in the anonymous pilot study{' '}
                <ThemedText type="small" themeColor="textSecondary">(optional)</ThemedText>
              </ThemedText>
            }
          />
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}

        <Button label="Let's go" onPress={handleCreate} loading={loading} disabled={loading} />

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
    gap: Spacing.three,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.one,
    width: '100%',
    maxWidth: 440,
  },
  logo: {
    fontSize: 28,
    fontWeight: '900',
    color: BrandColors.pink,
    letterSpacing: 4,
    marginBottom: Spacing.two,
  },
  heading: { textAlign: 'center' },
  sub: { textAlign: 'center' },
  fields: {
    gap: Spacing.three,
    width: '100%',
    maxWidth: 440,
  },
  divider: {
    height: 1,
    width: '100%',
    maxWidth: 440,
  },
  consents: {
    gap: Spacing.two,
    width: '100%',
    maxWidth: 440,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkLabelWrap: { flex: 1 },
  errorBanner: {
    backgroundColor: '#EF444420',
    borderRadius: 10,
    padding: Spacing.two + 4,
    width: '100%',
    maxWidth: 440,
  },
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center', fontWeight: '500' },
  signOutLink: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
