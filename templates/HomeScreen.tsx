import React from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  SafeAreaView, Pressable
} from 'react-native';
import { ChallengeCard } from '../components/ChallengeCard';
import { ChallengeListCard } from '../components/ChallengeListCard';

// Date de exemplu — înlocuiește cu datele reale din store/API
const ACTIVE_CHALLENGES = [
  { id: '1', title: "Maria's evening run", category: 'Fitness', currentDay: 1, totalDays: 7 },
  { id: '2', title: '14-day mindfulness', category: 'Mindfulness', currentDay: 2, totalDays: 14 },
  { id: '3', title: '7-day reading challenge', category: 'Reading', currentDay: 5, totalDays: 7 },
];

const RECOMMENDED = [
  {
    id: '1', title: 'Fitness day',
    description: 'Move your body every day and build a habit that sticks.',
    category: 'Fitness', difficulty: 'Easy' as const,
    xp: 20, durationDays: 1, joinedCount: 1,
    reason: 'Because you finished 1 fitness challenge',
  },
  {
    id: '2', title: '30-Day Running Journey',
    description: 'Build a running habit from scratch with progressive daily runs. Each week gets a little longer — by day 30 you\'ll be running 5 km without stopping.',
    category: 'Fitness', difficulty: 'Medium' as const,
    xp: 450, durationDays: 30, joinedCount: 24,
  },
  {
    id: '3', title: 'Sleep Reset Week',
    description: 'Fix your sleep schedule in 7 days with proven bedtime rituals.',
    category: 'Sleep', difficulty: 'Easy' as const,
    xp: 140, durationDays: 7, joinedCount: 11,
  },
];

type Props = {
  userName?: string;
  level?: number;
  xp?: number;
  streakDays?: number;
};

export function HomeScreen({ userName = 'Stefan', level = 2, xp = 272, streakDays = 4 }: Props) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header — numărul XP mare, nu mic */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}, {userName} 👋</Text>
            <View style={styles.statsRow}>
              <Text style={styles.statLabel}>Lv.{level}</Text>
              <Text style={styles.statDot}>·</Text>
              {/* XP e număr mare — datele sunt designul */}
              <Text style={styles.xpNumber}>{xp}</Text>
              <Text style={styles.statLabel}> XP</Text>
              <Text style={styles.statDot}>·</Text>
              <Text style={styles.streakBadge}>🔥 {streakDays}d</Text>
            </View>
          </View>
        </View>

        {/* Active Challenges */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Challenges</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardsRow}
          >
            {ACTIVE_CHALLENGES.map(ch => (
              <ChallengeCard key={ch.id} {...ch} onPress={() => {}} />
            ))}
          </ScrollView>
        </View>

        {/* Recommended */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recommended</Text>
            <Text style={styles.sectionSub}>Based on your activity</Text>
          </View>
          {RECOMMENDED.map(ch => (
            <ChallengeListCard key={ch.id} {...ch} onPress={() => {}} />
          ))}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0D0B1A',
  },
  scroll: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B5F8A',
  },
  statDot: {
    color: '#3D3555',
    fontSize: 13,
    marginHorizontal: 2,
  },
  xpNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FF1864',
  },
  streakBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF8C00',
    backgroundColor: '#FF8C0018',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  section: {
    marginTop: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionSub: {
    fontSize: 12,
    color: '#6B5F8A',
    fontWeight: '400',
  },
  cardsRow: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  bottomPadding: {
    height: 32,
  },
});