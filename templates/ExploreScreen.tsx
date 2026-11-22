import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  SafeAreaView, TextInput, Pressable
} from 'react-native';
import { ChallengeListCard } from '../components/ChallengeListCard';
import { FilterChip } from '../components/FilterChip';

const FILTERS = [
  { id: 'all',          label: 'All',        emoji: '◈' },
  { id: 'fitness',      label: 'Fitness',    emoji: '⚡' },
  { id: 'nutrition',    label: 'Nutrition',  emoji: '🥗' },
  { id: 'mindfulness',  label: 'Mindful',    emoji: '☯' },
  { id: 'sleep',        label: 'Sleep',      emoji: '🌙' },
  { id: 'learning',     label: 'Learning',   emoji: '📖' },
  { id: 'reading',      label: 'Reading',    emoji: '📚' },
];

const ALL_CHALLENGES = [
  {
    id: '1', title: '14-day outdoors challenge',
    description: 'Get outside every day.',
    category: 'Outdoors', difficulty: 'Hard' as const,
    xp: 525, durationDays: 14, joinedCount: 0,
  },
  {
    id: '2', title: 'Better sleep day',
    description: 'Build an evening routine that gets you better rest.',
    category: 'Sleep', difficulty: 'Easy' as const,
    xp: 20, durationDays: 1, joinedCount: 0,
  },
  {
    id: '3', title: '7-Day Language Starter',
    description: 'Spend 20 focused minutes every day learning a new language. By the end of the week you will know 100 words and basic phrases.',
    category: 'Learning', difficulty: 'Medium' as const,
    xp: 157, durationDays: 7, joinedCount: 0,
  },
  {
    id: '4', title: 'Morning Run Streak',
    description: 'Start every morning with a 20-minute run before breakfast.',
    category: 'Fitness', difficulty: 'Medium' as const,
    xp: 240, durationDays: 10, joinedCount: 7,
  },
  {
    id: '5', title: 'Mindful Mornings',
    description: '10 minutes of guided meditation every morning to start the day calm.',
    category: 'Mindfulness', difficulty: 'Easy' as const,
    xp: 70, durationDays: 7, joinedCount: 18,
  },
];

export function ExploreScreen() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'challenges' | 'people'>('challenges');

  const filtered = ALL_CHALLENGES.filter(ch => {
    const matchesFilter =
      activeFilter === 'all' ||
      ch.category.toLowerCase() === activeFilter;
    const matchesQuery =
      !query ||
      ch.title.toLowerCase().includes(query.toLowerCase()) ||
      ch.description.toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesQuery;
  });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search challenges..."
          placeholderTextColor="#4A4065"
          value={query}
          onChangeText={setQuery}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} style={styles.clearBtn}>
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Tab switcher */}
        <View style={styles.tabRow}>
          {(['challenges', 'people'] as const).map(tab => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Category filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {FILTERS.map(f => (
            <FilterChip
              key={f.id}
              label={f.label}
              emoji={f.emoji}
              active={activeFilter === f.id}
              onPress={() => setActiveFilter(f.id)}
            />
          ))}
        </ScrollView>

        {/* Results count */}
        {query ? (
          <Text style={styles.resultsLabel}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{query}"
          </Text>
        ) : null}

        {/* Challenge list */}
        <View style={styles.list}>
          {filtered.map(ch => (
            <ChallengeListCard key={ch.id} {...ch} onPress={() => {}} />
          ))}
          {filtered.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No challenges found</Text>
              <Text style={styles.emptyText}>Try a different filter or search term.</Text>
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0D0B1A',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1628',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  clearBtn: {
    padding: 4,
  },
  clearText: {
    color: '#6B5F8A',
    fontSize: 13,
  },
  scroll: {
    flex: 1,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#1A1628',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#231E35',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B5F8A',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filtersRow: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 8,
  },
  resultsLabel: {
    fontSize: 12,
    color: '#6B5F8A',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  list: {
    gap: 0,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B5F8A',
    textAlign: 'center',
  },
});