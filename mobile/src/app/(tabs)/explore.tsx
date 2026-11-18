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
import { AccentColor, BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const HEADER_GREEN = '#1a3d2b';

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
  { key: 'digital_detox', label: 'Detox', icon: 'eye-off-outline' },
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
          query: { q: q.trim() || undefined, category: cat ?? undefined, limit: 20, cursor: nextCursor },
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
    if (!q.trim()) { setPeople([]); setCursor(undefined); return; }
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

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (mode === 'challenges') load(query, category); }, [category]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => (mode === 'people' ? loadPeople(query) : load(query, category)),
      300,
    );
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, mode]);

  function handleScroll({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    if (cursor && !loadingMore && layoutMeasurement.height + contentOffset.y >= contentSize.height - 300) {
      if (mode === 'people') loadPeople(query, cursor);
      else load(query, category, cursor);
    }
  }

  return (
    <View style={styles.root}>
      {/* Decorative circles */}
      <View style={[styles.dec, { width: 200, height: 200, top: -60, right: -50 }]} pointerEvents="none" />

      <SafeAreaView edges={['top', 'left', 'right']} style={styles.headerArea}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Explore</ThemedText>
          <View style={[styles.searchWrap, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.6)" />
            <TextInput
              style={styles.searchInput}
              placeholder={mode === 'people' ? 'Search by name or @username…' : 'Search challenges…'}
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCapitalize={mode === 'people' ? 'none' : 'sentences'}
              autoCorrect={mode !== 'people'}
              clearButtonMode="while-editing"
            />
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.sheet}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={200}>

          <View style={styles.modesWrap}>
            <Segmented options={MODES} value={mode} onChange={setMode} />
          </View>

          {mode === 'challenges' && (
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
                      active ? { backgroundColor: AccentColor } : { backgroundColor: colors.backgroundElement },
                    ]}
                    onPress={() => setCategory(cat.key)}>
                    <Ionicons name={cat.icon} size={13} color={active ? '#fff' : colors.textSecondary} />
                    <ThemedText type="small" style={{ color: active ? '#fff' : colors.text }}>
                      {cat.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

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
              {loadingMore && <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />}
            </>
          )}

          {mode === 'challenges' && (
            <>
              {loading && <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />}
              {!loading && items.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                  No challenges found.
                </ThemedText>
              )}
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
              {loadingMore && <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />}
            </>
          )}

        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HEADER_GREEN },
  dec: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)' },
  headerArea: { backgroundColor: HEADER_GREEN },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    outlineStyle: 'none',
  } as object,
  sheet: {
    flex: 1,
    backgroundColor: '#F4F4F8',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  modesWrap: { marginBottom: Spacing.two },
  pills: { flexDirection: 'row', gap: Spacing.one, paddingVertical: Spacing.two, paddingBottom: Spacing.three },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 99,
  },
  cardList: { gap: Spacing.two },
  spinner: { marginVertical: Spacing.four },
  empty: { textAlign: 'center', marginTop: Spacing.five },
});
