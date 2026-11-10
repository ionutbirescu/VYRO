'use no memo';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Chip } from 'react-native-paper';

import type { Schemas } from '@/api/client';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';

const DIFFICULTY: Record<number, { label: string; color: string }> = {
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
  const diff = DIFFICULTY[challenge.difficulty] ?? DIFFICULTY[1];

  if (props.variant === 'compact') {
    const progress = props.progress;
    const pct = progress ? progress.completed / Math.max(progress.total, 1) : 0;

    return (
      <AnimCard onPress={onPress} style={shadowStyle}>
        <View style={[
          styles.compact,
          {
            backgroundColor: colors.backgroundElement,
            borderColor: colors.backgroundSelected,
            borderLeftColor: diff.color,
          },
        ]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.compactCategory}>
            {challenge.category.replace('_', ' ')}
          </ThemedText>
          <ThemedText type="smallBold" numberOfLines={2} style={styles.compactTitle}>
            {challenge.title}
          </ThemedText>
          {progress ? (
            <>
              <View style={[styles.progressTrack, { backgroundColor: colors.backgroundSelected }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${pct * 100}%` as `${number}%`, backgroundColor: diff.color },
                  ]}
                />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Day {progress.completed + 1} of {progress.total}
              </ThemedText>
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {challenge.duration_days === 1 ? '1 day' : `${challenge.duration_days} days`}
            </ThemedText>
          )}
        </View>
      </AnimCard>
    );
  }

  return (
    <AnimCard onPress={onPress} style={shadowStyle}>
      <View style={[
        styles.full,
        {
          backgroundColor: colors.backgroundElement,
          borderColor: colors.backgroundSelected,
        },
      ]}>
        <View style={styles.body}>
          <View style={styles.topRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {challenge.category.replace('_', ' ')}
            </ThemedText>
            <Chip
              compact
              style={[styles.diffChip, { backgroundColor: diff.color + '22' }]}
              textStyle={{ color: diff.color, fontSize: 11, fontWeight: '700' }}
            >
              {diff.label}
            </Chip>
          </View>

          <ThemedText style={styles.fullTitle} numberOfLines={2}>
            {challenge.title}
          </ThemedText>

          {challenge.description ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.description}>
              {challenge.description}
            </ThemedText>
          ) : null}

          <View style={styles.footer}>
            <View style={styles.footerItem}>
              <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                {challenge.duration_days === 1 ? '1 day' : `${challenge.duration_days} days`}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
            <View style={styles.footerItem}>
              <Ionicons name="star-outline" size={12} color={colors.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                {challenge.total_xp.toLocaleString()} XP
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
            <View style={styles.footerItem}>
              <Ionicons name="people-outline" size={12} color={colors.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                {challenge.participant_count.toLocaleString()}
              </ThemedText>
            </View>
          </View>
        </View>
      </View>
    </AnimCard>
  );
}

const shadowStyle = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  default: {},
});

const styles = StyleSheet.create({
  compact: {
    width: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  compactCategory: {
    textTransform: 'capitalize',
    fontSize: 12,
  },
  compactTitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },

  diffChip: {
    height: 26,
    justifyContent: 'center',
  },
  full: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  body: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fullTitle: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  description: {
    lineHeight: 19,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
