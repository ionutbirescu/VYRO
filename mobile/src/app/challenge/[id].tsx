import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DIFFICULTY_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: 'Easy', color: '#22c55e' },
  2: { label: 'Medium', color: '#3b82f6' },
  3: { label: 'Hard', color: '#f59e0b' },
  4: { label: 'Very Hard', color: '#ef4444' },
  5: { label: 'Extreme', color: '#a855f7' },
};

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useTheme();
  const [challenge, setChallenge] = useState<Schemas['ChallengeDetail'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    api.GET('/v1/challenges/{challenge_id}', {
      params: { path: { challenge_id: id } },
    }).then(({ data }) => {
      setChallenge(data ?? null);
      setLoading(false);
    });
  }, [id]);

  async function handleJoin() {
    if (!challenge) return;
    setJoining(true);
    const { error } = await api.POST('/v1/challenges/{challenge_id}/join', {
      params: { path: { challenge_id: challenge.id } },
    });
    if (error) {
      Alert.alert('Could not join', 'Try again later.');
    } else {
      const { data } = await api.GET('/v1/challenges/{challenge_id}', {
        params: { path: { challenge_id: challenge.id } },
      });
      if (data) setChallenge(data);
    }
    setJoining(false);
  }

  async function handleLeave() {
    if (!challenge) return;
    Alert.alert('Leave challenge?', 'Your progress will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive', onPress: async () => {
          setJoining(true);
          await api.POST('/v1/challenges/{challenge_id}/leave', {
            params: { path: { challenge_id: challenge.id } },
          });
          const { data } = await api.GET('/v1/challenges/{challenge_id}', {
            params: { path: { challenge_id: challenge.id } },
          });
          if (data) setChallenge(data);
          setJoining(false);
        },
      },
    ]);
  }

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!challenge) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="textSecondary">Challenge not found.</ThemedText>
      </ThemedView>
    );
  }

  const diff = DIFFICULTY_LABEL[challenge.difficulty] ?? DIFFICULTY_LABEL[1];
  const participation = challenge.my_participation;
  const isActive = participation?.status === 'active';
  const nextDay = participation?.next_day_number ?? 1;

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.badgeRow}>
              <View style={[styles.diffBadge, { backgroundColor: diff.color + '22' }]}>
                <ThemedText type="small" style={{ color: diff.color }}>{diff.label}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {challenge.duration_days === 1 ? '1 day' : `${challenge.duration_days} days`}
              </ThemedText>
            </View>

            <ThemedText type="subtitle">{challenge.title}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.description}>
              {challenge.description}
            </ThemedText>

            <View style={styles.statsRow}>
              <ThemedText type="small" themeColor="textSecondary">
                ⭐ {challenge.total_xp} XP
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                👥 {challenge.participant_count} joined
              </ThemedText>
            </View>
          </View>

          {/* Progress bar if active */}
          {isActive && participation && (
            <View style={[styles.progressCard, { backgroundColor: colors.backgroundElement }]}>
              <View style={styles.progressHeader}>
                <ThemedText type="smallBold">Your progress</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Day {participation.completed_tasks}/{participation.total_tasks}
                </ThemedText>
              </View>
              <View style={[styles.track, { backgroundColor: colors.backgroundSelected }]}>
                <View style={[
                  styles.fill,
                  {
                    width: `${(participation.completed_tasks / Math.max(participation.total_tasks, 1)) * 100}%` as `${number}%`,
                    backgroundColor: diff.color,
                  },
                ]} />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {participation.xp_earned} XP earned so far
              </ThemedText>
            </View>
          )}

          {/* Join / Leave button */}
          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: isActive ? 'transparent' : colors.text, borderColor: colors.text, borderWidth: isActive ? 1 : 0 },
            ]}
            onPress={isActive ? handleLeave : handleJoin}
            disabled={joining}>
            <ThemedText
              style={{ color: isActive ? colors.text : colors.background, fontWeight: '600' }}>
              {joining ? '…' : isActive ? 'Leave challenge' : 'Join challenge'}
            </ThemedText>
          </Pressable>

          {/* Task list */}
          <ThemedText type="smallBold" style={styles.sectionTitle}>
            DAILY TASKS
          </ThemedText>

          {challenge.tasks
            .sort((a, b) => a.day_number - b.day_number)
            .map((task) => {
              const done = isActive && task.day_number < nextDay;
              const current = isActive && task.day_number === nextDay;
              return (
                <View
                  key={task.id}
                  style={[
                    styles.taskCard,
                    {
                      backgroundColor: colors.backgroundElement,
                      opacity: isActive && task.day_number > nextDay ? 0.5 : 1,
                    },
                  ]}>
                  <View style={styles.taskHeader}>
                    <View style={[
                      styles.dayBadge,
                      {
                        backgroundColor: done ? '#22c55e' : current ? diff.color : colors.backgroundSelected,
                      },
                    ]}>
                      <ThemedText type="small" style={{ color: done || current ? '#fff' : colors.textSecondary }}>
                        {done ? '✓' : `D${task.day_number}`}
                      </ThemedText>
                    </View>
                    <ThemedText type="smallBold" style={styles.taskTitle}>
                      {task.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      +{task.xp} XP
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.taskInstructions}>
                    {task.instructions}
                  </ThemedText>
                </View>
              );
            })}

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1, alignItems: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  header: { paddingTop: Spacing.three, gap: Spacing.two },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  diffBadge: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: 99 },
  description: { lineHeight: 22 },
  statsRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  progressCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  actionBtn: {
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
  },
  sectionTitle: { letterSpacing: 0.8, marginTop: Spacing.two },
  taskCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  taskHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dayBadge: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  taskTitle: { flex: 1 },
  taskInstructions: { lineHeight: 20, paddingLeft: 40 },
});
