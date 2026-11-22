import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.44;

type Props = {
  title: string;
  category: string;
  currentDay: number;
  totalDays: number;
  onPress?: () => void;
};

// Fiecare categorie are un gradient unic — nu același portocaliu peste tot
const CATEGORY_GRADIENTS: Record<string, readonly [string, string]> = {
  Fitness:     ['#FF1864', '#FF6035'],
  Mindfulness: ['#9B1DFF', '#FF1864'],
  Reading:     ['#FF8C00', '#FFB020'],
  Sleep:       ['#1D6FFF', '#00C8FF'],
  Nutrition:   ['#00C853', '#00E5FF'],
  Learning:    ['#FFB020', '#FF6035'],
  Outdoors:    ['#00A86B', '#1D9FFF'],
};

export function ChallengeCard({ title, category, currentDay, totalDays, onPress }: Props) {
  const gradient = CATEGORY_GRADIENTS[category] ?? ['#FF1864', '#FF6035'];
  const progress = currentDay / totalDays;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrapper, pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] }]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Category label — fără badge, direct pe gradient */}
        <Text style={styles.category}>{category.toUpperCase()}</Text>

        {/* Title — greutate 800, domină cardul */}
        <Text style={styles.title} numberOfLines={3}>{title}</Text>

        {/* Progress bar simplă, fără ornamente */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
        </View>

        <Text style={styles.dayLabel}>
          Day {currentDay} of {totalDays}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: CARD_WIDTH,
    marginRight: 12,
    borderRadius: 20,
    // Shadow în loc de border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
  },
  card: {
    borderRadius: 20,
    padding: 18,
    minHeight: 185,
    justifyContent: 'space-between',
    // Fără cercuri decorative, fără shapes — gradient curat
  },
  category: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 25,
    flex: 1,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    marginVertical: 14,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
  },
});
