import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import { logEvent } from '@/api/events';
import type { Schemas } from '@/api/client';
import { ChallengeCard } from '@/components/challenge-card';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, BottomTabInset, MaxContentWidth, Spacing, StreakColor } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';

const HEADER_BG = BrandColors.headerBg;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

type AsyncData<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'empty' };

export default function HomeScreen() {
  const { state } = useAuth();
  const profile = state.status === 'ready' ? state.profile : null;

  const [active, setActive] = useState<AsyncData<Schemas['ParticipationWithChallenge'][]>>({
    status: 'loading',
  });
  const [recommendationId, setRecommendationId] = useState<string | null>(null);
  const [recs, setRecs] = useState<AsyncData<Schemas['Recommendation'][]>>({
    status: 'loading',
  });

  useEffect(() => {
    api.GET('/v1/me/participations', { params: { query: { status: 'active', limit: 10 } } }).then(
      ({ data }) => setActive(data?.items.length ? { status: 'ok', data: data.items } : { status: 'empty' }),
      () => setActive({ status: 'empty' }),
    );

    api.GET('/v1/recommendations', { params: { query: { limit: 5 } } }).then(
      ({ data }) => {
        setRecommendationId(data?.recommendation_id ?? null);
        setRecs(data?.items.length ? { status: 'ok', data: data.items } : { status: 'empty' });
      },
      () => setRecs({ status: 'empty' }),
    );
  }, []);

  return (
    <View style={styles.root}>
      {/* Decorative glows */}
      <View style={[styles.dec, styles.decPink, { width: 260, height: 260, top: -90, right: -70 }]} pointerEvents="none" />
      <View style={[styles.dec, styles.decCyan, { width: 130, height: 130, top: 10, right: 40 }]} pointerEvents="none" />

      <SafeAreaView edges={['top', 'left', 'right']} style={styles.headerArea}>
        <View style={styles.header}>
          <ThemedText style={styles.greeting}>
            {greeting()}{profile ? `, ${profile.display_name.split(' ')[0]}` : ''} 👋
          </ThemedText>
          {profile && (
            <View style={styles.subRow}>
              <ThemedText style={styles.subText}>
                Level {profile.level} · {profile.xp.toLocaleString()} XP
              </ThemedText>
              {profile.current_streak > 0 && (
                <View style={styles.streakPill}>
                  <Ionicons name="flame" size={12} color={StreakColor} />
                  <ThemedText style={styles.streakText}>{profile.current_streak}d</ThemedText>
                </View>
              )}
            </View>
          )}
        </View>
      </SafeAreaView>

      <View style={styles.sheet}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Active Challenges</ThemedText>
            </View>
            {active.status === 'loading' && (
              <ThemedText type="small" themeColor="textSecondary">Loading…</ThemedText>
            )}
            {active.status === 'empty' && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyState}>
                No active challenges yet. Explore some below.
              </ThemedText>
            )}
            {active.status === 'ok' && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalList}>
                {active.data.map((p) => (
                  <ChallengeCard
                    key={p.id}
                    variant="compact"
                    challenge={p.challenge}
                    progress={{ completed: p.completed_tasks, total: p.total_tasks }}
                    onPress={() => router.push(`/challenge/${p.challenge_id}`)}
                  />
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Recommended for you</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Based on your activity</ThemedText>
            </View>
            {recs.status === 'loading' && (
              <ThemedText type="small" themeColor="textSecondary">Loading…</ThemedText>
            )}
            {recs.status === 'empty' && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyState}>
                Recommendations coming soon.
              </ThemedText>
            )}
            {recs.status === 'ok' && (
              <View style={styles.verticalList}>
                {recs.data.map((r) => (
                  <View key={r.challenge.id}>
                    <ChallengeCard
                      variant="full"
                      challenge={r.challenge}
                      onPress={() => {
                        logEvent('recommendation_opened', {
                          recommendation_id: recommendationId,
                          challenge_id: r.challenge.id,
                          rank: r.rank,
                        });
                        router.push({
                          pathname: '/challenge/[id]',
                          params: recommendationId
                            ? { id: r.challenge.id, rec: recommendationId }
                            : { id: r.challenge.id },
                        });
                      }}
                    />
                    {r.reason && (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.reason}>
                        {r.reason}
                      </ThemedText>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HEADER_BG },
  dec: { position: 'absolute', borderRadius: 999 },
  decPink: { backgroundColor: 'rgba(255,45,120,0.14)' },
  decCyan: { backgroundColor: 'rgba(0,217,200,0.10)' },
  headerArea: { backgroundColor: HEADER_BG },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.one,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  subText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
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
    gap: Spacing.one,
  },
  section: { gap: Spacing.two, paddingTop: Spacing.two },
  sectionHeader: { gap: 2 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A0A2E',
    letterSpacing: -0.3,
  },
  horizontalList: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  verticalList: { gap: Spacing.two },
  reason: {
    marginTop: -Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  emptyState: { paddingVertical: Spacing.three },
});
