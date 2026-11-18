'use no memo';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { Schemas } from '@/api/client';
import { DifficultyColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';

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

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animStyle, style]}>
      <Pressable
        onPress={onPress}
        // eslint-disable-next-line react-hooks/immutability
        onPressIn={() => { scale.value = withSpring(0.97, { mass: 0.3, damping: 12 }); }}
        // eslint-disable-next-line react-hooks/immutability
        onPressOut={() => { scale.value = withSpring(1, { mass: 0.3, damping: 12 }); }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function ChallengeCard(props: ChallengeCardProps) {
  const { challenge, onPress } = props;
  const colors = useTheme();
  const diff = DifficultyColors[challenge.difficulty] ?? DifficultyColors[1];

  if (props.variant === 'compact') {
    const progress = props.progress;
    const pct = progress ? progress.completed / Math.max(progress.total, 1) : 0;

    return (
      <AnimCard onPress={onPress} style={shadowStyle}>
        <View style={[styles.compact, { backgroundColor: diff.color }]}>
          {/* Decorative circle */}
          <View style={styles.compactDec} />
          <ThemedText style={styles.compactCategory}>
            {challenge.category.replace('_', ' ')}
          </ThemedText>
          <ThemedText numberOfLines={2} style={styles.compactTitle}>
            {challenge.title}
          </ThemedText>

          {progress ? (
            <>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${pct * 100}%` as `${number}%` },
                  ]}
                />
              </View>
              <ThemedText style={styles.compactSub}>
                Day {progress.completed + 1} of {progress.total}
              </ThemedText>
            </>
          ) : (
            <ThemedText style={styles.compactSub}>
              {challenge.duration_days === 1 ? '1 day' : `${challenge.duration_days} days`}
            </ThemedText>
          )}
        </View>
      </AnimCard>
    );
  }

  return (
    <AnimCard onPress={onPress} style={shadowStyle}>
      <View style={[styles.full, { backgroundColor: colors.backgroundElement, borderColor: colors.backgroundSelected }]}>
        <View style={styles.body}>
          <View style={styles.topRow}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.categoryLabel}>
              {challenge.category.replace(/_/g, ' ')}
            </ThemedText>
            <View style={[styles.diffBadge, { backgroundColor: diff.color + '20' }]}>
              <ThemedText style={[styles.diffText, { color: diff.color }]}>
                {diff.label}
              </ThemedText>
            </View>
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
              <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                {challenge.duration_days === 1 ? '1 day' : `${challenge.duration_days} days`}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
            <View style={styles.footerItem}>
              <Ionicons name="star" size={12} color="#f59e0b" />
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  default: {},
});

const styles = StyleSheet.create({
  /* Compact */
  compact: {
    width: 160,
    height: 172,
    borderRadius: 20,
    padding: Spacing.three,
    gap: Spacing.two,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  compactDec: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.12)',
    bottom: -24,
    right: -24,
  },
  compactCategory: {
    textTransform: 'capitalize',
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
    color: '#fff',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
  compactSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
  },

  /* Full */
  full: {
    borderRadius: 14,
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
  categoryLabel: {
    textTransform: 'capitalize',
    fontSize: 12,
  },
  diffBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  diffText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  fullTitle: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  description: {
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    marginTop: 2,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
