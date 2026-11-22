import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { logEvent } from '@/api/events';
import type { Schemas } from '@/api/client';
import { ChallengeCard } from '@/components/challenge-card';
import { RescueCard } from '@/components/rescue-card';
import { Screen, ScreenHeader, SectionHeader } from '@/components/screen';
import { InterFonts, UI } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';

type AsyncData<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'empty' };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const { state } = useAuth();
  const profile = state.status === 'ready' ? state.profile : null;

  const [active, setActive] = useState<AsyncData<Schemas['ParticipationWithChallenge'][]>>({ status: 'loading' });
  const [recs, setRecs] = useState<AsyncData<Schemas['Recommendation'][]>>({ status: 'loading' });
  const [rescue, setRescue] = useState<Schemas['RescueOffer'] | null>(null);

  const loadActive = useCallback(() => {
    api.GET('/v1/me/participations', { params: { query: { status: 'active', limit: 10 } } }).then(
      ({ data }) => setActive(data?.items.length ? { status: 'ok', data: data.items } : { status: 'empty' }),
      () => setActive({ status: 'empty' }),
    );
  }, []);

  useEffect(() => {
    loadActive();
    api.GET('/v1/recommendations', { params: { query: { limit: 5 } } }).then(
      ({ data }) => setRecs(data?.items.length ? { status: 'ok', data: data.items } : { status: 'empty' }),
      () => setRecs({ status: 'empty' }),
    );
  }, [loadActive]);

  // The coach checks for a challenge at risk each time Home is shown; at most one offer a day.
  useFocusEffect(
    useCallback(() => {
      api.GET('/v1/coach/rescue').then(
        ({ data }) => setRescue(data?.status === 'open' ? data : null),
        () => setRescue(null),
      );
    }, []),
  );

  const firstName = profile?.display_name.split(' ')[0];

  return (
    <Screen>
      <ScreenHeader title={firstName ? `${greeting()}, ${firstName}` : greeting()} />

      {profile && (
        <View style={styles.stats}>
          <Stat value={profile.level} label="Level" />
          <View style={styles.statSep} />
          <Stat value={profile.xp.toLocaleString()} label="XP" />
          <View style={styles.statSep} />
          <Stat value={profile.current_streak} label="day streak" />
        </View>
      )}

      {rescue && (
        <RescueCard
          offer={rescue}
          onAnswered={() => {
            setRescue(null);
            loadActive();
          }}
        />
      )}

      <Pressable
        onPress={() => router.push('/coach')}
        style={({ pressed }) => [styles.coach, pressed && { backgroundColor: UI.surfaceHi }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.coachTitle}>Ask your coach</Text>
          <Text style={styles.coachSub}>Progress, what to do next, catching up</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={UI.faint} />
      </Pressable>

      <SectionHeader title="In progress" />
      {active.status === 'loading' && <ActivityIndicator color={UI.muted} style={styles.loader} />}
      {active.status === 'empty' && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>You haven&apos;t joined anything yet.</Text>
          <Pressable onPress={() => router.push('/explore')} hitSlop={8}>
            <Text style={styles.link}>Browse challenges</Text>
          </Pressable>
        </View>
      )}
      {active.status === 'ok' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
          {active.data.map((p) => (
            <ChallengeCard
              key={p.id}
              variant="compact"
              challenge={p.challenge}
              progress={{ completed: p.completed_tasks, total: p.total_tasks }}
              onPress={() => router.push(`/challenge/${p.challenge.id}`)}
            />
          ))}
        </ScrollView>
      )}

      <SectionHeader title="Recommended for you" />
      {recs.status === 'loading' && <ActivityIndicator color={UI.muted} style={styles.loader} />}
      {recs.status === 'empty' && (
        <Text style={[styles.emptyText, styles.padded]}>Nothing to suggest yet. Finish a challenge and check back.</Text>
      )}
      {recs.status === 'ok' && (
        <View style={styles.list}>
          {recs.data.map((r) => (
            <ChallengeCard
              key={r.challenge.id}
              variant="full"
              challenge={r.challenge}
              onPress={() => {
                logEvent('recommendation_tapped', { challenge_id: r.challenge.id });
                router.push(`/challenge/${r.challenge.id}`);
              }}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: 'row',
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: UI.surface,
  },
  stat: { flex: 1, paddingHorizontal: 16 },
  statSep: { width: StyleSheet.hairlineWidth, backgroundColor: UI.line },
  statValue: { fontFamily: InterFonts.bold, fontSize: 22, color: UI.text },
  statLabel: { fontFamily: InterFonts.regular, fontSize: 13, color: UI.muted, marginTop: 2 },
  coach: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: UI.surface,
  },
  coachTitle: { fontFamily: InterFonts.semiBold, fontSize: 16, color: UI.text },
  coachSub: { fontFamily: InterFonts.regular, fontSize: 13, color: UI.muted, marginTop: 2 },
  hList: { paddingHorizontal: 20 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: UI.line },
  loader: { alignSelf: 'flex-start', marginLeft: 20 },
  empty: { paddingHorizontal: 20, gap: 8 },
  emptyText: { fontFamily: InterFonts.regular, fontSize: 15, color: UI.muted, lineHeight: 21 },
  padded: { paddingHorizontal: 20 },
  link: { fontFamily: InterFonts.semiBold, fontSize: 15, color: UI.accent },
});
