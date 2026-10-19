import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { ChallengeCard } from '@/components/challenge-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TabBarWebInset } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

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
  const colors = useTheme();
  const profile = state.status === 'ready' ? state.profile : null;

  const [active, setActive] = useState<AsyncData<Schemas['ParticipationWithChallenge'][]>>({
    status: 'loading',
  });
  const [recs, setRecs] = useState<AsyncData<Schemas['Recommendation'][]>>({
    status: 'loading',
  });

  useEffect(() => {
    api.GET('/v1/me/participations', { params: { query: { status: 'active', limit: 10 } } }).then(
      ({ data }) => setActive(data?.items.length ? { status: 'ok', data: data.items } : { status: 'empty' }),
      () => setActive({ status: 'empty' }),
    );

    api.GET('/v1/recommendations', { params: { query: { limit: 5 } } }).then(
      ({ data }) => setRecs(data?.items.length ? { status: 'ok', data: data.items } : { status: 'empty' }),
      () => setRecs({ status: 'empty' }),
    );
  }, []);

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <ThemedText type="subtitle">
              {greeting()}{profile ? `, ${profile.display_name.split(' ')[0]}` : ''}
            </ThemedText>
            {profile && (
              <View style={styles.statsRow}>
                <View style={[styles.statBadge, { backgroundColor: colors.backgroundElement }]}>
                  <ThemedText type="smallBold">Lv {profile.level}</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {profile.xp.toLocaleString()} XP
                </ThemedText>
                {profile.current_streak > 0 && (
                  <ThemedText type="small" themeColor="textSecondary">
                    🔥 {profile.current_streak} day{profile.current_streak !== 1 ? 's' : ''}
                  </ThemedText>
                )}
              </View>
            )}
          </View>

          {/* Active Challenges */}
          <Section title="Active Challenges">
            {active.status === 'loading' && (
              <ThemedText type="small" themeColor="textSecondary">Loading…</ThemedText>
            )}
            {active.status === 'empty' && (
              <EmptyState message="No active challenges yet. Explore some below." />
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
          </Section>

          {/* Recommended */}
          <Section title="Recommended for you">
            {recs.status === 'loading' && (
              <ThemedText type="small" themeColor="textSecondary">Loading…</ThemedText>
            )}
            {recs.status === 'empty' && (
              <EmptyState message="Recommendations coming soon." />
            )}
            {recs.status === 'ok' && (
              <View style={styles.verticalList}>
                {recs.data.map((r) => (
                  <View key={r.challenge.id}>
                    <ChallengeCard
                      variant="full"
                      challenge={r.challenge}
                      onPress={() => router.push(`/challenge/${r.challenge.id}`)}
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
          </Section>

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.emptyState}>
      {message}
    </ThemedText>
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
  },
  header: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 99,
  },
  section: {
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  sectionTitle: {
    letterSpacing: 0.8,
  },
  horizontalList: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  verticalList: {
    gap: Spacing.two,
  },
  reason: {
    marginTop: -Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  emptyState: {
    paddingVertical: Spacing.three,
  },
});
