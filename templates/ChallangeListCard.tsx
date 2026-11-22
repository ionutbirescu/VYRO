import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

type Props = {
  title: string;
  description: string;
  category: string;
  difficulty: Difficulty;
  xp: number;
  durationDays: number;
  joinedCount: number;
  reason?: string;
  onPress?: () => void;
};

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  Easy:   '#00E5FF',
  Medium: '#FF6035',
  Hard:   '#FF1864',
};

// Fiecare categorie are culoarea ei — badge-ul e colorat pe bg semitransparent
const CATEGORY_COLORS: Record<string, string> = {
  Fitness:     '#FF1864',
  Mindfulness: '#9B1DFF',
  Reading:     '#FF8C00',
  Sleep:       '#1D6FFF',
  Nutrition:   '#00C853',
  Learning:    '#FFB020',
  Outdoors:    '#00A86B',
};

export function ChallengeListCard({
  title, description, category, difficulty,
  xp, durationDays, joinedCount, reason, onPress,
}: Props) {
  const catColor = CATEGORY_COLORS[category] ?? '#9B8FC0';
  const diffColor = DIFFICULTY_COLORS[difficulty];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrapper, pressed && { opacity: 0.88 }]}
    >
      <View style={styles.card}>
        {/* Header: category badge stânga, difficulty badge dreapta */}
        <View style={styles.headerRow}>
          <View style={[styles.categoryBadge, { backgroundColor: catColor + '22' }]}>
            <Text style={[styles.categoryText, { color: catColor }]}>{category}</Text>
          </View>
          <View style={[styles.difficultyBadge, { backgroundColor: diffColor }]}>
            <Text style={styles.difficultyText}>{difficulty}</Text>
          </View>
        </View>

        {/* Title — weight 800 */}
        <Text style={styles.title}>{title}</Text>

        {/* Description — weight 400, culoare secundară */}
        <Text style={styles.description} numberOfLines={2}>{description}</Text>

        {/* Meta row */}
        <View style={styles.metaRow}>
          <View style={styles.xpBadge}>
            <Text style={styles.xpStar}>★</Text>
            <Text style={styles.xpText}>{xp} XP</Text>
          </View>
          <Text style={styles.separator}>·</Text>
          <Text style={styles.meta}>{durationDays}d</Text>
          <Text style={styles.separator}>·</Text>
          <Text style={styles.meta}>{joinedCount} joined</Text>
        </View>

        {/* Reason — contextual, italic mic */}
        {reason ? (
          <Text style={styles.reason}>{reason}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 7,
  },
  card: {
    backgroundColor: '#1A1628',
    borderRadius: 16,
    padding: 16,
    // Fără borderWidth — shadow face toată treaba
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  difficultyText: {
    fontSize: 11,
    fontWeight: '800',
    // Text închis pe badge colorat — contrast mai bun
    color: '#0D0B1A',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
    lineHeight: 23,
  },
  description: {
    fontSize: 13,
    fontWeight: '400',
    color: '#8A7FAD',
    lineHeight: 19,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#231E35',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  xpStar: {
    fontSize: 10,
    color: '#FFB020',
  },
  xpText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFB020',
  },
  separator: {
    color: '#3D3555',
    fontSize: 12,
  },
  meta: {
    fontSize: 12,
    color: '#6B5F8A',
    fontWeight: '500',
  },
  reason: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#231E35',
    fontSize: 11,
    color: '#6B5F8A',
    fontStyle: 'italic',
  },
});
