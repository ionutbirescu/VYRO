import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { AccentColor, BrandColors, BottomTabInset, MaxContentWidth, Spacing, StreakColor } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { type ThemePreference, useThemePreference } from '@/contexts/theme-preference';
import { useTheme } from '@/hooks/use-theme';

const HEADER_BG = BrandColors.headerBg;

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
    <View style={styles.root}>
      {/* Decorative glows */}
      <View style={[styles.dec, styles.decPink, { width: 240, height: 240, top: -70, right: -65 }]} pointerEvents="none" />
      <View style={[styles.dec, styles.decCyan, { width: 110, height: 110, top: 25, right: 55 }]} pointerEvents="none" />

      <SafeAreaView edges={['top', 'left', 'right']} style={styles.headerArea}>
        <View style={styles.header}>
          <LinearGradient
            colors={[AccentColor, '#a78bfa']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarRing}>
            <View style={styles.avatarInner}>
              <ThemedText style={styles.avatarLetter}>
                {p.display_name[0].toUpperCase()}
              </ThemedText>
            </View>
          </LinearGradient>
          <ThemedText style={styles.displayName}>{p.display_name}</ThemedText>
          <ThemedText style={styles.username}>@{p.username}</ThemedText>
          {p.bio && <ThemedText style={styles.bio}>{p.bio}</ThemedText>}
        </View>
      </SafeAreaView>

      <View style={styles.sheet}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}>

          {/* XP Progress */}
          <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            <View style={styles.xpHeader}>
              <View style={styles.levelRow}>
                <ThemedText style={styles.levelText}>Level {p.level}</ThemedText>
                {p.is_plus && (
                  <View style={styles.plusBadge}>
                    <Ionicons name="flash" size={11} color="#f59e0b" />
                    <ThemedText style={styles.plusText}>VYRO+</ThemedText>
                  </View>
                )}
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {p.xp.toLocaleString()} / {p.next_level_xp.toLocaleString()} XP
              </ThemedText>
            </View>
            <View style={[styles.xpTrack, { backgroundColor: colors.backgroundSelected }]}>
              <View style={[styles.xpFill, { width: `${xpPct * 100}%` as `${number}%`, backgroundColor: AccentColor }]} />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {Math.round(xpPct * 100)}% to level {p.level + 1}
            </ThemedText>
          </View>

          {/* Stats Grid */}
          <View style={styles.grid}>
            <StatCard icon="flame" iconColor={StreakColor} value={p.current_streak} label="day streak" />
            <StatCard icon="calendar-outline" iconColor={AccentColor} value={p.longest_streak} label="longest streak" />
            <StatCard icon="checkmark-circle-outline" iconColor="#22c55e" value={p.completed_challenges} label="completed" />
            <StatCard
              icon="people-outline"
              iconColor="#a78bfa"
              value={p.followers_count}
              label={`followers · ${p.following_count} following`}
              onPress={() =>
                router.push({
                  pathname: '/user/connections',
                  params: { id: p.id, name: p.display_name, tab: 'followers' },
                })
              }
            />
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
      </View>
    </View>
  );
}

function StatCard({
  icon,
  iconColor,
  value,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  value: number;
  label: string;
  onPress?: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.statCard,
        { backgroundColor: colors.backgroundElement, opacity: pressed && onPress ? 0.7 : 1 },
      ]}
      onPress={onPress}
      disabled={!onPress}>
      <View style={styles.statIconRow}>
        <Ionicons name={icon} size={18} color={iconColor} />
        <ThemedText style={styles.statValue}>{value}</ThemedText>
        {onPress && (
          <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} style={styles.statChevron} />
        )}
      </View>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HEADER_BG },
  dec: { position: 'absolute', borderRadius: 999 },
  decPink: { backgroundColor: 'rgba(255,45,120,0.15)' },
  decCyan: { backgroundColor: 'rgba(0,217,200,0.10)' },
  headerArea: { backgroundColor: HEADER_BG },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  avatarInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: HEADER_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 32, fontWeight: '700', color: '#fff' },
  displayName: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center' },
  username: { fontSize: 13, color: 'rgba(255,255,255,0.65)' },
  bio: { fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingHorizontal: Spacing.four },
  sheet: {
    flex: 1,
    backgroundColor: '#F7F0FF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  levelText: { fontSize: 15, fontWeight: '700' },
  plusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f59e0b18',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
  },
  plusText: { fontSize: 11, fontWeight: '700', color: '#f59e0b' },
  xpTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  statCard: { flex: 1, minWidth: '45%', borderRadius: 16, padding: Spacing.three, gap: Spacing.one },
  statChevron: { marginLeft: 'auto' },
  statIconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  statValue: { fontSize: 26, fontWeight: '700' },
  themeRow: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
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
