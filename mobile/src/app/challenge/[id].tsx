import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { ActivityCard } from '@/components/activity-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColor, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// How many recent proofs the challenge screen shows; "See all" opens the rest.
const ACTIVITY_PREVIEW = 3;

const DIFFICULTY_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: 'Easy', color: '#22c55e' },
  2: { label: 'Medium', color: '#3b82f6' },
  3: { label: 'Hard', color: '#f59e0b' },
  4: { label: 'Very Hard', color: '#ef4444' },
  5: { label: 'Extreme', color: '#a855f7' },
};

export default function ChallengeScreen() {
  // rec: the recommendation that led here, if any; joins report it for the study.
  const { id, rec } = useLocalSearchParams<{ id: string; rec?: string }>();
  const colors = useTheme();
  const [challenge, setChallenge] = useState<Schemas['ChallengeDetail'] | null>(null);
  const [activity, setActivity] = useState<Schemas['ActivityPage'] | null>(null);
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

  const loadActivity = useCallback(
    () =>
      api
        .GET('/v1/challenges/{challenge_id}/activity', {
          params: { path: { challenge_id: id }, query: { limit: ACTIVITY_PREVIEW } },
        })
        .then(({ data }) => setActivity(data ?? null)),
    [id],
  );

  // Also on return from submitting a proof or commenting.
  useFocusEffect(
    useCallback(() => {
      loadActivity();
    }, [loadActivity]),
  );

  async function handleJoin() {
    if (!challenge) return;
    setJoining(true);
    const { error } = await api.POST('/v1/challenges/{challenge_id}/join', {
      params: { path: { challenge_id: challenge.id } },
      body: rec ? { recommendation_id: rec } : undefined,
    });
    if (error) {
      Alert.alert('Could not join', 'Try again later.');
    } else {
      const { data } = await api.GET('/v1/challenges/{challenge_id}', {
        params: { path: { challenge_id: challenge.id } },
      });
      if (data) setChallenge(data);
      // Joining unlocks photos and comments.
      loadActivity();
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
        <ActivityIndicator color={AccentColor} />
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
              <View style={[styles.diffBadge, { backgroundColor: diff.color + '20' }]}>
                <ThemedText style={[styles.diffBadgeText, { color: diff.color }]}>{diff.label}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.categoryLabel}>
                {challenge.category.replace(/_/g, ' ')}
              </ThemedText>
            </View>

            <ThemedText style={styles.challengeTitle}>{challenge.title}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.description}>
              {challenge.description}
            </ThemedText>

            <View style={styles.statsRow}>
              <Ionicons name="star" size={13} color="#f59e0b" />
              <ThemedText type="small" themeColor="textSecondary">
                {challenge.total_xp.toLocaleString()} XP
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
              <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                {challenge.duration_days === 1 ? '1 day' : `${challenge.duration_days} days`}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
              <Ionicons name="people-outline" size={13} color={colors.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                {challenge.participant_count.toLocaleString()}
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
              isActive
                ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.backgroundSelected }
                : { backgroundColor: AccentColor, borderWidth: 0 },
            ]}
            onPress={isActive ? handleLeave : handleJoin}
            disabled={joining}>
            <ThemedText
              style={{
                color: isActive ? colors.textSecondary : '#fff',
                fontWeight: '700',
                fontSize: 15,
                letterSpacing: -0.2,
              }}>
              {joining ? '…' : isActive ? 'Leave challenge' : 'Join challenge'}
            </ThemedText>
          </Pressable>

          {/* Leaderboard + Chat */}
          <View style={styles.secondaryActions}>
            <Pressable
              style={[styles.secondaryBtn, { backgroundColor: colors.backgroundElement, flex: 1 }]}
              onPress={() =>
                router.push({
                  pathname: '/challenge/leaderboard',
                  params: { challenge_id: challenge.id },
                })
              }>
              <View style={styles.secondaryBtnContent}>
                <Ionicons name="trophy-outline" size={15} color="#f59e0b" />
                <ThemedText type="smallBold">Leaderboard</ThemedText>
              </View>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, { backgroundColor: colors.backgroundElement, flex: 1 }]}
              onPress={() =>
                router.push({
                  pathname: '/challenge/chat',
                  params: { challenge_id: challenge.id },
                })
              }>
              <View style={styles.secondaryBtnContent}>
                <Ionicons name="chatbubble-outline" size={15} color="#94a3b8" />
                <ThemedText type="smallBold">Chat</ThemedText>
              </View>
            </Pressable>
          </View>

          {/* What participants did */}
          <View style={styles.sectionHeader}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
              Activity
            </ThemedText>
            {activity && activity.items.length > 0 && (
              <Pressable
                hitSlop={8}
                onPress={() =>
                  router.push({
                    pathname: '/challenge/activity',
                    params: { challenge_id: challenge.id },
                  })
                }>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLink}>
                  See all ›
                </ThemedText>
              </Pressable>
            )}
          </View>
          {activity && activity.items.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Nobody has completed a day yet. Be the first!
            </ThemedText>
          )}
          {activity && !activity.can_view_proofs && activity.items.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Join to see everyone&apos;s photos and comment on them.
            </ThemedText>
          )}
          {activity?.items.map((item) => (
            <ActivityCard key={item.proof_id} item={item} canView={activity.can_view_proofs} />
          ))}

          {/* Task list */}
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
            Daily tasks
          </ThemedText>

          {challenge.tasks
            .sort((a, b) => a.day_number - b.day_number)
            .map((task) => {
              const done = isActive && task.day_number < nextDay;
              const current = isActive && task.day_number === nextDay;
              // A lighter version accepted from the coach replaces today's task.
              const swap =
                current && participation?.swapped_task?.day_number === task.day_number
                  ? participation.swapped_task
                  : null;
              const shown = swap ?? task;
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
                      {done
                        ? <Ionicons name="checkmark" size={14} color="#fff" />
                        : <ThemedText
                            type="small"
                            numberOfLines={1}
                            style={{ color: current ? '#fff' : colors.textSecondary, fontSize: 12 }}>
                            D{task.day_number}
                          </ThemedText>
                      }
                    </View>
                    <ThemedText type="smallBold" style={styles.taskTitle}>
                      {shown.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      +{shown.xp} XP
                    </ThemedText>
                  </View>
                  {swap && (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.taskInstructions}>
                      Lighter version from your coach. It still counts for your streak.
                    </ThemedText>
                  )}
                  <ThemedText type="small" themeColor="textSecondary" style={styles.taskInstructions}>
                    {shown.instructions}
                  </ThemedText>
                  {current && participation && (
                    <Pressable
                      style={[styles.submitBtn, { backgroundColor: diff.color }]}
                      onPress={() =>
                        router.push({
                          pathname: '/proof/submit',
                          params: {
                            task_id: task.id,
                            participation_id: participation.id,
                            task_title: shown.title,
                            proof_hint: shown.proof_hint,
                            challenge_id: challenge.id,
                          },
                        })
                      }>
                      <View style={styles.submitBtnContent}>
                        <Ionicons name="camera-outline" size={15} color="#fff" />
                        <ThemedText type="smallBold" style={{ color: '#fff' }}>Submit proof</ThemedText>
                      </View>
                    </Pressable>
                  )}
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
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  header: { paddingTop: Spacing.three, gap: Spacing.two },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  diffBadgeText: { fontSize: 12, fontWeight: '700' },
  categoryLabel: { textTransform: 'capitalize' },
  challengeTitle: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
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
  secondaryActions: { flexDirection: 'row', gap: Spacing.two },
  secondaryBtn: { borderRadius: 12, padding: Spacing.three, alignItems: 'center' },
  secondaryBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { marginTop: Spacing.two },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  sectionLink: { marginTop: Spacing.two },
  taskCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  taskHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dayBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 99,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  taskTitle: { flex: 1 },
  taskInstructions: { lineHeight: 20, paddingLeft: 40 },
  submitBtn: { marginTop: Spacing.two, borderRadius: 10, padding: Spacing.two, alignItems: 'center', marginLeft: 40 },
  submitBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
