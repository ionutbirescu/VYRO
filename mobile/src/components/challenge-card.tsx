import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Schemas } from '@/api/client';
import { CategoryDot, DifficultyColors, InterFonts, UI } from '@/constants/theme';

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

function categoryLabel(c: string) {
  const s = c.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ChallengeCard(props: CompactProps | FullProps) {
  const { challenge, onPress } = props;
  const dot = CategoryDot[challenge.category] ?? UI.faint;

  if (props.variant === 'compact') {
    const total = Math.max(props.progress?.total ?? challenge.duration_days, 1);
    const done = props.progress?.completed ?? 0;
    const pct = Math.min(done / total, 1);

    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={styles.catRow}>
          <View style={[styles.dot, { backgroundColor: dot }]} />
          <Text style={styles.cat}>{categoryLabel(challenge.category)}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{challenge.title}</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.progressRow}>
          <Text style={styles.progressNum}>{done}</Text>
          <Text style={styles.progressOf}> / {total} done</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct * 100}%` }]} />
        </View>
      </Pressable>
    );
  }

  const diff = DifficultyColors[challenge.difficulty]?.label ?? 'Easy';
  const days = challenge.duration_days === 1 ? '1 day' : `${challenge.duration_days} days`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.catRow}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text style={styles.cat}>{categoryLabel(challenge.category)}</Text>
      </View>
      <Text style={styles.rowTitle}>{challenge.title}</Text>
      {challenge.description ? (
        <Text style={styles.rowDesc} numberOfLines={2}>{challenge.description}</Text>
      ) : null}
      <Text style={styles.meta}>
        {days} · {diff} · {challenge.total_xp} XP
        {challenge.participant_count > 0 ? ` · ${challenge.participant_count} joined` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    height: 164,
    marginRight: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: UI.surface,
  },
  cardPressed: { backgroundColor: UI.surfaceHi },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  cat: { fontFamily: InterFonts.medium, fontSize: 13, color: UI.muted },
  cardTitle: { fontFamily: InterFonts.semiBold, fontSize: 17, lineHeight: 22, color: UI.text },
  progressRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  progressNum: { fontFamily: InterFonts.bold, fontSize: 22, color: UI.text },
  progressOf: { fontFamily: InterFonts.regular, fontSize: 13, color: UI.muted },
  track: { height: 4, borderRadius: 2, backgroundColor: UI.surfaceHi, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: UI.accent },

  row: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: UI.line,
  },
  rowPressed: { backgroundColor: UI.surface },
  rowTitle: { fontFamily: InterFonts.semiBold, fontSize: 16, lineHeight: 21, color: UI.text },
  rowDesc: { fontFamily: InterFonts.regular, fontSize: 14, lineHeight: 20, color: UI.muted, marginTop: 4 },
  meta: { fontFamily: InterFonts.regular, fontSize: 13, color: UI.faint, marginTop: 8 },
});
