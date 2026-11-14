import { Ionicons } from '@expo/vector-icons';
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
import { Segmented } from '@/components/segmented';
import { UserRow } from '@/components/user-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColor, BottomTabInset, MaxContentWidth, Spacing, TabBarWebInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CategoryKey = 'fitness' | 'nutrition' | 'mindfulness' | 'sleep' | 'learning' | 'reading' | 'creativity' | 'productivity' | 'social' | 'outdoors' | 'sustainability' | 'finance' | 'digital_detox' | undefined;

const CATEGORIES: { key: CategoryKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: undefined, label: 'All', icon: 'grid-outline' },
  { key: 'fitness', label: 'Fitness', icon: 'barbell-outline' },
  { key: 'nutrition', label: 'Nutrition', icon: 'nutrition-outline' },
  { key: 'mindfulness', label: 'Mindfulness', icon: 'body-outline' },
  { key: 'sleep', label: 'Sleep', icon: 'bed-outline' },
  { key: 'learning', label: 'Learning', icon: 'school-outline' },
  { key: 'reading', label: 'Reading', icon: 'book-outline' },
  { key: 'creativity', label: 'Creativity', icon: 'color-palette-outline' },
  { key: 'productivity', label: 'Productivity', icon: 'checkmark-circle-outline' },
  { key: 'social', label: 'Social', icon: 'people-outline' },
  { key: 'outdoors', label: 'Outdoors', icon: 'leaf-outline' },
  { key: 'sustainability', label: 'Sustainability', icon: 'refresh-circle-outline' },
  { key: 'finance', label: 'Finance', icon: 'wallet-outline' },
  { key: 'digital_detox', label: 'Digital Detox', icon: 'eye-off-outline' },
];

type Mode = 'challenges' | 'people';

const MODES: { value: Mode; label: string }[] = [
  { value: 'challenges', label: 'Challenges' },
  { value: 'people', label: 'People' },
];

export default function ExploreScreen() {
  const colors = useTheme();
  const [mode, setMode] = useState<Mode>('challenges');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryKey>(undefined);
  const [items, setItems] = useState<Schemas['ChallengeSummary'][]>([]);
  const [people, setPeople] = useState<Schemas['UserSummary'][]>([]);
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

  const loadPeople = useCallback(async (q: string, nextCursor?: string) => {
    const isFirst = !nextCursor;
    if (!q.trim()) {
      setPeople([]);
      setCursor(undefined);
      return;
    }
    const setBusy = isFirst ? setLoading : setLoadingMore;
    setBusy(true);
    const { data } = await api.GET('/v1/users', {
      params: { query: { q: q.trim(), limit: 20, cursor: nextCursor } },
    });
    if (data) {
      setPeople((prev) => (isFirst ? data.items : [...prev, ...data.items]));
      setCursor(data.next_cursor);
    } else if (isFirst) {
      setPeople([]);
      setCursor(undefined);
    }
    setBusy(false);
  }, []);

  // Reload when category changes immediately.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (mode === 'challenges') load(query, category); }, [category]);

  // Debounce search query; switching modes searches the other list for the same text.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => (mode === 'people' ? loadPeople(query) : load(query, category)),
      300,
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mode]);

  function handleScroll({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    if (
      cursor &&
      !loadingMore &&
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 300
    ) {
      if (mode === 'people') loadPeople(query, cursor);
      else load(query, category, cursor);
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

          <View style={styles.modes}>
            <Segmented options={MODES} value={mode} onChange={setMode} />
          </View>

          {/* Search bar */}
          <View style={[styles.searchWrap, { backgroundColor: colors.backgroundElement }]}>
            <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={mode === 'people' ? 'Search by name or @username…' : 'Search challenges…'}
              placeholderTextColor={colors.textSecondary}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCapitalize={mode === 'people' ? 'none' : 'sentences'}
              autoCorrect={mode !== 'people'}
              clearButtonMode="while-editing"
            />
          </View>

          {mode === 'people' && (
            <>
              {loading && <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />}
              {!loading && people.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                  {query.trim() ? 'Nobody found.' : 'Find friends by their name or @username.'}
                </ThemedText>
              )}
              <View style={styles.cardList}>
                {people.map((person) => (
                  <UserRow key={person.id} user={person} />
                ))}
              </View>
              {loadingMore && (
                <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />
              )}
            </>
          )}

          {mode === 'challenges' && (
            <>
              {/* Category pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pills}>
                {CATEGORIES.map((cat) => {
                  const active = cat.key === category;
                  return (
                    <Pressable
                      key={cat.label}
                      style={[
                        styles.pill,
                        active
                          ? { backgroundColor: AccentColor }
                          : { backgroundColor: colors.backgroundElement },
                      ]}
                      onPress={() => setCategory(cat.key)}>
                      <Ionicons
                        name={cat.icon}
                        size={13}
                        color={active ? '#fff' : colors.textSecondary}
                      />
                      <ThemedText
                        type="small"
                        style={{ color: active ? '#fff' : colors.text }}>
                        {cat.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>

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
            </>
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
  modes: { marginTop: Spacing.six, marginBottom: Spacing.two },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    marginBottom: Spacing.two,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    outlineStyle: 'none',
  } as object,
  pills: {
    flexDirection: 'row',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingBottom: Spacing.three,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 99,
  },
  cardList: { gap: Spacing.two },
  spinner: { marginVertical: Spacing.four },
  empty: { textAlign: 'center', marginTop: Spacing.five },
});
