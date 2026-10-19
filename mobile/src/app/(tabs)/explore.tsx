import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { ChallengeCard } from '@/components/challenge-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TabBarWebInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const CATEGORIES = [
  { key: undefined, label: 'All' },
  { key: 'fitness', label: '🏋️ Fitness' },
  { key: 'nutrition', label: '🥗 Nutrition' },
  { key: 'mindfulness', label: '🧘 Mindfulness' },
  { key: 'sleep', label: '😴 Sleep' },
  { key: 'learning', label: '📚 Learning' },
  { key: 'reading', label: '📖 Reading' },
  { key: 'creativity', label: '🎨 Creativity' },
  { key: 'productivity', label: '✅ Productivity' },
  { key: 'social', label: '👥 Social' },
  { key: 'outdoors', label: '🌿 Outdoors' },
  { key: 'sustainability', label: '♻️ Sustainability' },
  { key: 'finance', label: '💰 Finance' },
  { key: 'digital_detox', label: '📵 Digital Detox' },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];

export default function ExploreScreen() {
  const colors = useTheme();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryKey>(undefined);
  const [items, setItems] = useState<Schemas['ChallengeSummary'][]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (q: string, cat: CategoryKey, nextCursor?: string) => {
      const isFirst = !nextCursor;
      isFirst ? setLoading(true) : setLoadingMore(true);

      const { data } = await api.GET('/v1/challenges', {
        params: {
          query: {
            q: q.trim() || undefined,
            category: cat ?? undefined,
            limit: 20,
            cursor: nextCursor,
          },
        },
      });

      if (data) {
        setItems((prev) => (isFirst ? data.items : [...prev, ...data.items]));
        setCursor(data.next_cursor);
      } else if (isFirst) {
        setItems([]);
        setCursor(undefined);
      }

      isFirst ? setLoading(false) : setLoadingMore(false);
    },
    [],
  );

  // Reload when category changes immediately.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(query, category); }, [category]);

  // Debounce search query.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(query, category), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleScroll({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    if (
      cursor &&
      !loadingMore &&
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 300
    ) {
      load(query, category, cursor);
    }
  }

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={200}>

          {/* Search bar */}
          <TextInput
            style={[
              styles.searchBar,
              { backgroundColor: colors.backgroundElement, color: colors.text },
            ]}
            placeholder="Search challenges…"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />

          {/* Category pills */}
          <View style={styles.pills}>
            {CATEGORIES.map((cat) => {
              const active = cat.key === category;
              return (
                <Pressable
                  key={cat.label}
                  style={[
                    styles.pill,
                    { backgroundColor: active ? colors.text : colors.backgroundElement },
                  ]}
                  onPress={() => setCategory(cat.key)}>
                  <ThemedText
                    type="small"
                    style={{ color: active ? colors.background : colors.text }}>
                    {cat.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {loading && (
            <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />
          )}

          {!loading && items.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              No challenges found.
            </ThemedText>
          )}

          {/* Challenge list */}
          <View style={styles.cardList}>
            {items.map((item, index) => (
              <ChallengeCard
                key={`${item.id}-${index}`}
                variant="full"
                challenge={item}
                onPress={() => router.push(`/challenge/${item.id}`)}
              />
            ))}
          </View>

          {loadingMore && (
            <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />
          )}

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1, alignItems: 'center' },
  scroll: { flex: 1, width: '100%' },
  list: {
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: TabBarWebInset,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  searchBar: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    marginTop: Spacing.six,
    marginBottom: Spacing.two,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingBottom: Spacing.three,
  },
  pill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 99,
  },
  cardList: { gap: Spacing.two },
  spinner: { marginVertical: Spacing.four },
  empty: { textAlign: 'center', marginTop: Spacing.five },
});
