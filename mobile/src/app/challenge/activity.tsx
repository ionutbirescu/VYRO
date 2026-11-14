import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { ActivityCard } from '@/components/activity-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Everything participants did in a challenge, newest first: /challenge/activity?challenge_id=… */
export default function ChallengeActivityScreen() {
  const colors = useTheme();
  const { challenge_id } = useLocalSearchParams<{ challenge_id: string }>();
  const [items, setItems] = useState<Schemas['ActivityItem'][]>([]);
  const [canView, setCanView] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (nextCursor?: string) => {
      const { data } = await api.GET('/v1/challenges/{challenge_id}/activity', {
        params: { path: { challenge_id }, query: { limit: 20, cursor: nextCursor } },
      });
      return data;
    },
    [challenge_id],
  );

  // Refresh on return from comments, so their counts are current.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchPage().then((data) => {
        if (cancelled) return;
        setItems(data?.items ?? []);
        setCanView(data?.can_view_proofs ?? false);
        setCursor(data?.next_cursor ?? null);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [fetchPage]),
  );

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const data = await fetchPage(cursor);
    setItems((prev) => [...prev, ...(data?.items ?? [])]);
    setCursor(data?.next_cursor ?? null);
    setLoadingMore(false);
  }

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={items}
          keyExtractor={(item) => item.proof_id}
          renderItem={({ item }) => <ActivityCard item={item} canView={canView} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            !loading && !canView && items.length > 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                Join the challenge to see everyone&apos;s photos and comment on them.
              </ThemedText>
            ) : undefined
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                Nobody has completed a day yet.
              </ThemedText>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />
            ) : undefined
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  list: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
  },
  separator: { height: Spacing.three },
  hint: { marginBottom: Spacing.three },
  spinner: { marginVertical: Spacing.four },
  empty: { textAlign: 'center', marginTop: Spacing.five },
});
