import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { ChallengeCard } from '@/components/challenge-card';
import { FilterChip } from '@/components/filter-chip';
import { Screen, ScreenHeader } from '@/components/screen';
import { InterFonts, UI } from '@/constants/theme';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'mindfulness', label: 'Mindfulness' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'learning', label: 'Learning' },
  { id: 'reading', label: 'Reading' },
  { id: 'outdoors', label: 'Outdoors' },
  { id: 'productivity', label: 'Productivity' },
];

export default function ExploreScreen() {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  // Each result remembers which filter + search it was fetched for. While it doesn't match the
  // current one the list shows the loader, so the effect never has to reset state itself.
  const [result, setResult] = useState<{ key: string; items: Schemas['ChallengeSummary'][] } | null>(null);
  const requestKey = `${filter}|${debounced}`;
  const challenges = result?.key === requestKey ? result.items : null;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let stale = false;
    api.GET('/v1/challenges', {
      params: {
        query: {
          category: (filter === 'all' ? undefined : filter) as never,
          q: debounced || undefined,
          limit: 30,
        },
      },
    }).then(
      ({ data }) => { if (!stale) setResult({ key: requestKey, items: data?.items ?? [] }); },
      () => { if (!stale) setResult({ key: requestKey, items: [] }); },
    );
    return () => { stale = true; };
  }, [filter, debounced, requestKey]);

  return (
    <Screen>
      <ScreenHeader title="Explore" />

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={UI.faint} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search challenges"
          placeholderTextColor={UI.faint}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={UI.faint} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((f) => (
          <FilterChip key={f.id} label={f.label} active={filter === f.id} onPress={() => setFilter(f.id)} />
        ))}
      </ScrollView>

      {challenges === null ? (
        <ActivityIndicator color={UI.muted} style={styles.loader} />
      ) : challenges.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No matches</Text>
          <Text style={styles.emptyText}>Try another category or a shorter search.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {challenges.map((ch) => (
            <ChallengeCard
              key={ch.id}
              variant="full"
              challenge={ch}
              onPress={() => router.push(`/challenge/${ch.id}`)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: UI.surface,
  },
  searchInput: {
    flex: 1,
    fontFamily: InterFonts.regular,
    fontSize: 16,
    color: UI.text,
    outlineStyle: 'none',
  } as object,
  filters: { paddingHorizontal: 20, paddingVertical: 16 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: UI.line },
  loader: { marginTop: 32 },
  empty: { paddingHorizontal: 20, paddingTop: 32 },
  emptyTitle: { fontFamily: InterFonts.semiBold, fontSize: 17, color: UI.text },
  emptyText: { fontFamily: InterFonts.regular, fontSize: 15, color: UI.muted, marginTop: 4 },
});
