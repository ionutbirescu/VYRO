import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { UserRow } from '@/components/user-row';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Tab = 'followers' | 'following';

const TABS: { value: Tab; label: string }[] = [
  { value: 'followers', label: 'Followers' },
  { value: 'following', label: 'Following' },
];

/** Someone's followers and the people they follow: /user/connections?id=…&name=…&tab=following */
export default function ConnectionsScreen() {
  const colors = useTheme();
  const { id, name, tab: initialTab } = useLocalSearchParams<{
    id: string;
    name?: string;
    tab?: Tab;
  }>();
  const [tab, setTab] = useState<Tab>(initialTab === 'following' ? 'following' : 'followers');
  const [users, setUsers] = useState<Schemas['UserSummary'][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (which: Tab, nextCursor?: string) => {
      const options = {
        params: { path: { user_id: id }, query: { limit: 30, cursor: nextCursor } },
      };
      const { data } =
        which === 'followers'
          ? await api.GET('/v1/users/{user_id}/followers', options)
          : await api.GET('/v1/users/{user_id}/following', options);
      return data;
    },
    [id],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage(tab).then((data) => {
      if (cancelled) return;
      setUsers(data?.items ?? []);
      setCursor(data?.next_cursor ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, fetchPage]);

  function switchTab(next: Tab) {
    if (next === tab) return;
    setLoading(true);
    setTab(next);
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const data = await fetchPage(tab, cursor);
    setUsers((prev) => [...prev, ...(data?.items ?? [])]);
    setCursor(data?.next_cursor ?? null);
    setLoadingMore(false);
  }

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title: name ?? 'Connections' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={loading ? [] : users}
          keyExtractor={(user) => user.id}
          renderItem={({ item }) => <UserRow user={item} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <Segmented options={TABS} value={tab} onChange={switchTab} />
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {tab === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
              </ThemedText>
            )
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.spinner} color={colors.textSecondary} /> : undefined
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
  header: { marginBottom: Spacing.three },
  separator: { height: Spacing.two },
  spinner: { marginVertical: Spacing.four },
  empty: { textAlign: 'center', marginTop: Spacing.five },
});
