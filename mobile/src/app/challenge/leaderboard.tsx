import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardScreen() {
  const { challenge_id } = useLocalSearchParams<{ challenge_id: string }>();
  const { state } = useAuth();
  const colors = useTheme();
  const [leaderboard, setLeaderboard] = useState<Schemas['Leaderboard'] | null>(null);
  const [loading, setLoading] = useState(true);

  const myId = state.status === 'ready' ? state.profile.id : null;

  useEffect(() => {
    api.GET('/v1/challenges/{challenge_id}/leaderboard', {
      params: { path: { challenge_id }, query: { limit: 50 } },
    }).then(({ data }) => {
      setLeaderboard(data ?? null);
      setLoading(false);
    });
  }, [challenge_id]);

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!leaderboard || leaderboard.entries.length === 0) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="textSecondary">No participants yet.</ThemedText>
      </ThemedView>
    );
  }

  const myEntry = leaderboard.me;
  const myInList = leaderboard.entries.some((e) => e.user.id === myId);

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={leaderboard.entries}
          keyExtractor={(item) => item.user.id}
          style={styles.flex}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            myEntry && !myInList ? (
              <View style={[styles.myBanner, { backgroundColor: colors.backgroundElement }]}>
                <ThemedText type="smallBold" style={styles.myBannerRank}>
                  #{myEntry.rank}
                </ThemedText>
                <View style={styles.myBannerInfo}>
                  <ThemedText type="smallBold">{myEntry.user.display_name} (you)</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {myEntry.completed_tasks} tasks · {myEntry.xp_earned} XP
                  </ThemedText>
                </View>
              </View>
            ) : undefined
          }
          renderItem={({ item }) => {
            const isMe = item.user.id === myId;
            const medal = MEDALS[item.rank - 1];
            return (
              <View style={[
                styles.row,
                isMe && { backgroundColor: colors.backgroundElement },
              ]}>
                <View style={styles.rankCol}>
                  {medal ? (
                    <ThemedText style={styles.medal}>{medal}</ThemedText>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.rankNum}>
                      {item.rank}
                    </ThemedText>
                  )}
                </View>
                <View style={styles.userCol}>
                  <ThemedText type="smallBold">
                    {item.user.display_name}{isMe ? ' (you)' : ''}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    @{item.user.username} · Lv {item.user.level}
                  </ThemedText>
                </View>
                <View style={styles.statsCol}>
                  <ThemedText type="smallBold">{item.xp_earned} XP</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.completed_tasks} tasks
                  </ThemedText>
                </View>
              </View>
            );
          }}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.backgroundElement }]} />
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: {
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.one,
  },
  myBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 12,
    marginBottom: Spacing.three,
    gap: Spacing.two,
  },
  myBannerRank: { width: 40, textAlign: 'center' },
  myBannerInfo: { flex: 1, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: 10,
    gap: Spacing.two,
  },
  rankCol: { width: 40, alignItems: 'center' },
  medal: { fontSize: 22 },
  rankNum: { fontWeight: '700' },
  userCol: { flex: 1, gap: 2 },
  statsCol: { alignItems: 'flex-end', gap: 2 },
  separator: { height: 1, marginHorizontal: Spacing.two, marginVertical: 2 },
});
