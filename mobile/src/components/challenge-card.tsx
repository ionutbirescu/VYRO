'use no memo';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { Schemas } from '@/api/client';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';

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

// Shared press-scale + fade-in wrapper
function AnimCard({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: object;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
    opacity: opacity.value,
  }));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    opacity.value = withTiming(1, { duration: 280 });
    // eslint-disable-next-line react-hooks/immutability
    translateY.value = withSpring(0, { mass: 0.6, damping: 18 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[animStyle, style]}>
      <Pressable
        onPress={onPress}
        // eslint-disable-next-line react-hooks/immutability
        onPressIn={() => { scale.value = withSpring(0.97, { mass: 0.4, damping: 14 }); }}
        // eslint-disable-next-line react-hooks/immutability
        onPressOut={() => { scale.value = withSpring(1, { mass: 0.4, damping: 14 }); }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function ChallengeCard(props: ChallengeCardProps) {
  const { challenge, onPress } = props;
  const colors = useTheme();
  const diff = DIFFICULTY_LABEL[challenge.difficulty] ?? DIFFICULTY_LABEL[1];
  const emoji = CATEGORY_EMOJI[challenge.category] ?? '🎯';

  if (props.variant === 'compact') {
    const progress = props.progress;
    const pct = progress ? progress.completed / Math.max(progress.total, 1) : 0;

    return (
      <AnimCard onPress={onPress} style={shadowStyle}>
        <View style={[styles.compact, { backgroundColor: colors.backgroundElement }]}>
          <View style={[styles.accentBarCompact, { backgroundColor: diff.color }]} />
          <ThemedText style={styles.compactEmoji}>{emoji}</ThemedText>
          <ThemedText type="smallBold" numberOfLines={2} style={styles.compactTitle}>
            {challenge.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {challenge.duration_days}d
          </ThemedText>
          {progress && (
            <View style={[styles.progressTrack, { backgroundColor: colors.backgroundSelected }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${pct * 100}%` as `${number}%`, backgroundColor: diff.color },
                ]}
              />
            </View>
          )}
          <ThemedText type="small" style={{ color: diff.color }}>
            {progress ? `Day ${progress.completed + 1}/${progress.total}` : diff.label}
          </ThemedText>
        </View>
      </AnimCard>
    );
  }

  return (
    <AnimCard onPress={onPress} style={shadowStyle}>
      <View style={[styles.full, { backgroundColor: colors.backgroundElement }]}>
        {/* Difficulty accent bar */}
        <View style={[styles.accentBar, { backgroundColor: diff.color }]} />

        <View style={styles.body}>
          {/* Category + difficulty */}
          <View style={styles.badgeRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {emoji} {challenge.category.replace('_', ' ')}
            </ThemedText>
            <View style={[styles.diffBadge, { backgroundColor: diff.color + '25' }]}>
              <ThemedText type="small" style={{ color: diff.color, fontWeight: '600' }}>
                {diff.label}
              </ThemedText>
            </View>
          </View>

          {/* Title */}
          <ThemedText style={styles.fullTitle} numberOfLines={2}>
            {challenge.title}
          </ThemedText>

          {/* Description */}
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.description}>
            {challenge.description}
          </ThemedText>

          {/* Footer */}
          <View style={styles.fullFooter}>
            <ThemedText type="small" themeColor="textSecondary">
              📅 {challenge.duration_days === 1 ? '1 day' : `${challenge.duration_days} days`}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              ⭐ {challenge.total_xp} XP
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              👥 {challenge.participant_count}
            </ThemedText>
          </View>
        </View>
      </View>
    </AnimCard>
  );
}

const shadowStyle = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  default: {},
});

const styles = StyleSheet.create({
  compact: {
    width: 164,
    borderRadius: 18,
    overflow: 'hidden',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.one,
  },
  accentBarCompact: {
    height: 3,
    marginHorizontal: -Spacing.three,
    marginBottom: Spacing.two,
  },
  compactEmoji: { fontSize: 28 },
  compactTitle: { marginTop: Spacing.one },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: Spacing.one,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },

  full: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  accentBar: {
    height: 4,
  },
  body: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  diffBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 99,
  },
  fullTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  description: {
    lineHeight: 19,
  },
  fullFooter: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    paddingTop: Spacing.one,
  },
});
