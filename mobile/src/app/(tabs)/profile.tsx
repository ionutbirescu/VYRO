import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { Screen } from '@/components/screen';
import { InterFonts, UI } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';

export default function ProfileScreen() {
  const { state, signOut } = useAuth();
  const [history, setHistory] = useState<Schemas['ParticipationWithChallenge'][] | null>(null);

  useEffect(() => {
    api.GET('/v1/me/participations', { params: { query: { status: 'completed', limit: 20 } } }).then(
      ({ data }) => setHistory(data?.items ?? []),
      () => setHistory([]),
    );
  }, []);

  if (state.status !== 'ready') return null;
  const p = state.profile;
  const pct = Math.min(p.xp / Math.max(p.next_level_xp, 1), 1);

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out of VYRO?')) signOut();
      return;
    }
    Alert.alert('Sign out of VYRO?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <Screen>
      <View style={styles.top}>
        {p.avatar_url ? (
          <Image source={{ uri: p.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{p.display_name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{p.display_name}</Text>
          <Text style={styles.username}>@{p.username}</Text>
        </View>
      </View>
      {p.bio ? <Text style={styles.bio}>{p.bio}</Text> : null}

      <View style={styles.level}>
        <View style={styles.levelRow}>
          <Text style={styles.levelText}>Level {p.level}</Text>
          <Text style={styles.levelXp}>
            {p.xp.toLocaleString()} / {p.next_level_xp.toLocaleString()} XP
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct * 100}%` }]} />
        </View>
      </View>

      <View style={styles.stats}>
        <Stat value={p.current_streak} label="Current streak" />
        <Stat value={p.longest_streak} label="Best streak" />
        <Stat value={p.completed_challenges} label="Completed" />
      </View>

      <Text style={styles.sectionTitle}>Completed challenges</Text>
      {history === null ? (
        <ActivityIndicator color={UI.muted} style={{ alignSelf: 'flex-start', marginLeft: 20 }} />
      ) : history.length === 0 ? (
        <Text style={styles.empty}>Nothing finished yet. Your completed challenges will show up here.</Text>
      ) : (
        <View style={styles.list}>
          {history.map((h) => (
            <Pressable
              key={h.id}
              onPress={() => router.push(`/challenge/${h.challenge.id}`)}
              style={({ pressed }) => [styles.histRow, pressed && { backgroundColor: UI.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.histTitle} numberOfLines={1}>{h.challenge.title}</Text>
                <Text style={styles.histMeta}>
                  {h.ended_at ? new Date(h.ended_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                  {h.ended_at ? ' · ' : ''}
                  {h.completed_tasks}/{h.total_tasks} tasks
                </Text>
              </View>
              <Text style={styles.histXp}>+{h.xp_earned} XP</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable onPress={confirmSignOut} style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.6 }]}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 28 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: UI.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: InterFonts.semiBold, fontSize: 26, color: UI.text },
  name: { fontFamily: InterFonts.bold, fontSize: 24, color: UI.text, letterSpacing: -0.4 },
  username: { fontFamily: InterFonts.regular, fontSize: 15, color: UI.muted, marginTop: 2 },
  bio: { fontFamily: InterFonts.regular, fontSize: 15, lineHeight: 21, color: UI.text, paddingHorizontal: 20, marginTop: 14 },
  level: { marginHorizontal: 20, marginTop: 24 },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  levelText: { fontFamily: InterFonts.semiBold, fontSize: 15, color: UI.text },
  levelXp: { fontFamily: InterFonts.regular, fontSize: 14, color: UI.muted },
  track: { height: 6, borderRadius: 3, backgroundColor: UI.surfaceHi, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: UI.accent },
  stats: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 20 },
  stat: { flex: 1, padding: 14, borderRadius: 14, backgroundColor: UI.surface },
  statValue: { fontFamily: InterFonts.bold, fontSize: 24, color: UI.text },
  statLabel: { fontFamily: InterFonts.regular, fontSize: 13, color: UI.muted, marginTop: 2 },
  sectionTitle: {
    fontFamily: InterFonts.semiBold,
    fontSize: 17,
    color: UI.text,
    paddingHorizontal: 20,
    marginTop: 32,
    marginBottom: 12,
  },
  empty: { fontFamily: InterFonts.regular, fontSize: 15, lineHeight: 21, color: UI.muted, paddingHorizontal: 20 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: UI.line },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: UI.line,
  },
  histTitle: { fontFamily: InterFonts.medium, fontSize: 16, color: UI.text },
  histMeta: { fontFamily: InterFonts.regular, fontSize: 13, color: UI.faint, marginTop: 3 },
  histXp: { fontFamily: InterFonts.medium, fontSize: 14, color: UI.muted },
  signOut: { marginTop: 36, marginHorizontal: 20, paddingVertical: 14, alignItems: 'center' },
  signOutText: { fontFamily: InterFonts.medium, fontSize: 15, color: '#FF6B6B' },
});
