import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';
import type { Schemas } from '@/api/client';

const CATEGORY_EMOJI: Record<string, string> = {
  fitness: '🏋️',
  nutrition: '🥗',
  mindfulness: '🧘',
  sleep: '😴',
  learning: '📚',
  reading: '📖',
  creativity: '🎨',
  productivity: '✅',
  social: '👥',
  outdoors: '🌿',
  sustainability: '♻️',
  finance: '💰',
  digital_detox: '📵',
};

const DIFFICULTY_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: 'Easy', color: '#22c55e' },
  2: { label: 'Medium', color: '#3b82f6' },
  3: { label: 'Hard', color: '#f59e0b' },
  4: { label: 'Very Hard', color: '#ef4444' },
  5: { label: 'Extreme', color: '#a855f7' },
};

type CompactProps = {
  variant: 'compact';
  challenge: Schemas['ChallengeSummary'];
  progress?: { completed: number; total: number };
  onPress?: () => void;
};

type FullProps = {
  variant: 'full';
  challenge: Schemas['ChallengeSummary'];
  onPress?: () => void;
};

type ChallengeCardProps = CompactProps | FullProps;

export function ChallengeCard(props: ChallengeCardProps) {
  const { challenge, onPress } = props;
  const colors = useTheme();
  const diff = DIFFICULTY_LABEL[challenge.difficulty] ?? DIFFICULTY_LABEL[1];
  const emoji = CATEGORY_EMOJI[challenge.category] ?? '🎯';

  if (props.variant === 'compact') {
    const progress = props.progress;
    const pct = progress ? progress.completed / Math.max(progress.total, 1) : 0;

    return (
      <Pressable
        style={[styles.compact, { backgroundColor: colors.backgroundElement }]}
        onPress={onPress}>
        <ThemedText style={styles.compactEmoji}>{emoji}</ThemedText>
        <ThemedText type="smallBold" numberOfLines={2} style={styles.compactTitle}>
          {challenge.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {challenge.duration_days}d
        </ThemedText>
        {progress && (
          <View style={[styles.progressTrack, { backgroundColor: colors.backgroundSelected }]}>
            <View style={[styles.progressFill, { width: `${pct * 100}%` as `${number}%`, backgroundColor: diff.color }]} />
          </View>
        )}
        <ThemedText type="small" style={{ color: diff.color }}>
          {progress ? `Day ${progress.completed + 1}/${progress.total}` : diff.label}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[styles.full, { backgroundColor: colors.backgroundElement }]}
      onPress={onPress}>
      <View style={styles.fullHeader}>
        <View style={styles.badgeRow}>
          <ThemedText type="small" themeColor="textSecondary">
            {emoji} {challenge.category.replace('_', ' ')}
          </ThemedText>
          <View style={[styles.diffBadge, { backgroundColor: diff.color + '22' }]}>
            <ThemedText type="small" style={{ color: diff.color }}>
              {diff.label}
            </ThemedText>
          </View>
        </View>
        <ThemedText type="smallBold" style={styles.fullTitle} numberOfLines={2}>
          {challenge.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {challenge.description}
        </ThemedText>
      </View>
      <View style={styles.fullFooter}>
        <ThemedText type="small" themeColor="textSecondary">
          {challenge.duration_days === 1 ? '1 day' : `${challenge.duration_days} days`}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {challenge.total_xp} XP
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {challenge.participant_count} joined
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compact: {
    width: 160,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  compactEmoji: {
    fontSize: 28,
  },
  compactTitle: {
    marginTop: Spacing.one,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: Spacing.one,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  full: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  fullHeader: {
    gap: Spacing.one,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  diffBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 99,
  },
  fullTitle: {
    fontSize: 16,
  },
  fullFooter: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
});
