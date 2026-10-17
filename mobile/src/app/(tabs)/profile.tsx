import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import type { Schemas } from '@/api/client';

export default function ProfileScreen() {
  const { state, signOut } = useAuth();
  const colors = useTheme();

  if (state.status !== 'ready') return null;

  const p = state.profile;

  const xpPct = Math.min(p.xp / Math.max(p.next_level_xp, 1), 1);

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}>

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatar, { backgroundColor: colors.backgroundElement }]}>
              <ThemedText style={styles.avatarLetter}>
                {p.display_name[0].toUpperCase()}
              </ThemedText>
            </View>
            <ThemedText type="subtitle" style={styles.displayName}>
              {p.display_name}
            </ThemedText>
            <ThemedText themeColor="textSecondary">@{p.username}</ThemedText>
            {p.bio && (
              <ThemedText
                themeColor="textSecondary"
                style={styles.bio}>
                {p.bio}
              </ThemedText>
            )}
          </View>

          {/* XP Progress */}
          <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            <View style={styles.xpHeader}>
              <ThemedText type="smallBold">Level {p.level}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {p.xp.toLocaleString()} / {p.next_level_xp.toLocaleString()} XP
              </ThemedText>
            </View>
            <View style={[styles.xpTrack, { backgroundColor: colors.backgroundSelected }]}>
              <View style={[styles.xpFill, { width: `${xpPct * 100}%` as `${number}%` }]} />
            </View>
            {p.is_plus && (
              <ThemedText type="small" style={styles.plusBadge}>⚡ ChallengeMe+</ThemedText>
            )}
          </View>

          {/* Stats Grid */}
          <View style={styles.grid}>
            <StatCard
              value={`🔥 ${p.current_streak}`}
              label="day streak"
            />
            <StatCard
              value={`📅 ${p.longest_streak}`}
              label="longest streak"
            />
            <StatCard
              value={`✅ ${p.completed_challenges}`}
              label="completed"
            />
            <StatCard
              value={`👥 ${p.followers_count}`}
              label="followers"
            />
          </View>

          {/* Sign out */}
          <Pressable
            style={[styles.signOutBtn, { borderColor: colors.backgroundElement }]}
            onPress={signOut}>
            <ThemedText type="small" themeColor="textSecondary">Sign out</ThemedText>
          </Pressable>

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  const colors = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.backgroundElement }]}>
      <ThemedText type="subtitle" style={styles.statValue}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1, alignItems: 'center' },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  avatarSection: {
    alignItems: 'center',
    paddingTop: Spacing.four,
    gap: Spacing.one,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  avatarLetter: {
    fontSize: 36,
    fontWeight: '700',
  },
  displayName: {
    textAlign: 'center',
  },
  bio: {
    textAlign: 'center',
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.four,
  },
  card: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xpTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  plusBadge: {
    color: '#f59e0b',
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  statValue: {
    fontSize: 24,
  },
  signOutBtn: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
});
