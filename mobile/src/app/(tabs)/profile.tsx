import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColor, BottomTabInset, MaxContentWidth, Spacing, TabBarWebInset } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { type ThemePreference, useThemePreference } from '@/contexts/theme-preference';
import { useTheme } from '@/hooks/use-theme';
import type { Schemas } from '@/api/client';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'system', label: 'System', icon: 'contrast-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

export default function ProfileScreen() {
  const { state, signOut } = useAuth();
  const colors = useTheme();
  const { preference, setPreference } = useThemePreference();

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
            <LinearGradient
              colors={[AccentColor, '#a78bfa']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarRing}>
              <View style={[styles.avatarInner, { backgroundColor: colors.background }]}>
                <View style={[styles.avatar, { backgroundColor: colors.backgroundElement }]}>
                  <ThemedText style={styles.avatarLetter}>
                    {p.display_name[0].toUpperCase()}
                  </ThemedText>
                </View>
              </View>
            </LinearGradient>
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
              <LinearGradient
                colors={[AccentColor, '#a78bfa']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.xpFill, { width: `${xpPct * 100}%` as `${number}%` }]}
              />
            </View>
            {p.is_plus && (
              <View style={styles.plusRow}>
                <Ionicons name="flash" size={13} color="#f59e0b" />
                <ThemedText type="small" style={styles.plusBadge}>ChallengeMe+</ThemedText>
              </View>
            )}
          </View>

          {/* Stats Grid */}
          <View style={styles.grid}>
            <StatCard icon="flame" iconColor="#f97316" value={p.current_streak} label="day streak" />
            <StatCard icon="calendar-outline" iconColor={AccentColor} value={p.longest_streak} label="longest streak" />
            <StatCard icon="checkmark-circle-outline" iconColor="#22c55e" value={p.completed_challenges} label="completed" />
            <StatCard icon="people-outline" iconColor="#a78bfa" value={p.followers_count} label="followers" />
          </View>

          {/* Theme picker */}
          <View style={[styles.themeRow, { backgroundColor: colors.backgroundElement }]}>
            {THEME_OPTIONS.map((opt) => {
              const active = opt.value === preference;
              return (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.themeBtn,
                    active && { backgroundColor: colors.backgroundSelected },
                  ]}
                  onPress={() => setPreference(opt.value)}>
                  <Ionicons
                    name={opt.icon}
                    size={15}
                    color={active ? colors.text : colors.textSecondary}
                  />
                  <ThemedText
                    type="small"
                    themeColor={active ? 'text' : 'textSecondary'}
                    style={{ fontWeight: active ? '700' : '500' }}>
                    {opt.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Sign out */}
          <Pressable
            style={[styles.signOutBtn, { borderColor: colors.backgroundSelected }]}
            onPress={signOut}>
            <Ionicons name="log-out-outline" size={16} color={colors.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">Sign out</ThemedText>
          </Pressable>

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function StatCard({
  icon,
  iconColor,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  value: number;
  label: string;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.backgroundElement }]}>
      <View style={styles.statIconRow}>
        <Ionicons name={icon} size={18} color={iconColor} />
        <ThemedText type="subtitle" style={styles.statValue}>{value}</ThemedText>
      </View>
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
    paddingTop: TabBarWebInset,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  avatarSection: {
    alignItems: 'center',
    paddingTop: Spacing.four,
    gap: Spacing.one,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  avatarInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 34,
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
  },
  plusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  plusBadge: {
    color: '#f59e0b',
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
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  statValue: {
    fontSize: 24,
  },
  themeRow: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  themeBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  signOutBtn: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
});
