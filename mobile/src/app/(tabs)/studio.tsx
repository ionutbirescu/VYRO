import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '@/api/client';
import { logEvent } from '@/api/events';
import type { Schemas } from '@/api/client';
import { FilterChip } from '@/components/filter-chip';
import { Screen, ScreenHeader } from '@/components/screen';
import { DifficultyColors, InterFonts, UI } from '@/constants/theme';

type Category = Schemas['ChallengeDraft']['category'];

const CATEGORIES: { key: Category | undefined; label: string }[] = [
  { key: undefined, label: 'Any' },
  { key: 'fitness', label: 'Fitness' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'mindfulness', label: 'Mindfulness' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'learning', label: 'Learning' },
  { key: 'reading', label: 'Reading' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'outdoors', label: 'Outdoors' },
  { key: 'digital_detox', label: 'Digital detox' },
];

const DURATIONS = [1, 7, 14, 30] as const;

const EXAMPLES = ['Run every morning', 'Read before bed instead of scrolling', 'Drink more water'];

function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

export default function StudioScreen() {
  const [quota, setQuota] = useState<Schemas['AiQuota'] | null>(null);
  const [goal, setGoal] = useState('');
  const [category, setCategory] = useState<Category | undefined>(undefined);
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(7);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Schemas['GeneratedChallenge'] | null>(null);
  const [publishing, setPublishing] = useState(false);

  function loadQuota() {
    api.GET('/v1/ai/quota').then(({ data }) => data && setQuota(data));
  }
  useEffect(loadQuota, []);

  const outOfQuota = !!quota?.next_free_at;
  useEffect(() => {
    if (outOfQuota) logEvent('vyro_plus_prompt_viewed', { source: 'ai_studio' });
  }, [outOfQuota]);

  async function generate() {
    setLoading(true);
    setResult(null);
    const { data, response } = await api.POST('/v1/ai/challenges/generate', {
      body: { goal: goal.trim() || undefined, category, duration_days: duration },
    });
    setLoading(false);
    if (data) {
      setResult(data);
      setQuota(data.quota);
    } else if (response.status === 429) {
      loadQuota();
    } else {
      notify("Couldn't generate that", 'Try again in a moment.');
    }
  }

  async function publish() {
    if (!result) return;
    setPublishing(true);
    const { data } = await api.POST('/v1/challenges', {
      body: { ...result.draft, generation_id: result.generation_id, visibility: 'public' },
    });
    setPublishing(false);
    if (!data) return notify("Couldn't publish", 'Try again.');
    setResult(null);
    setGoal('');
    router.push(`/challenge/${data.id}`);
  }

  const quotaLine = !quota
    ? null
    : quota.limit === null
      ? 'Unlimited with VYRO+'
      : outOfQuota
        ? `You've used all ${quota.limit} drafts. More at ${new Date(quota.next_free_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
        : `${quota.limit - quota.used} of ${quota.limit} drafts left today`;

  return (
    <Screen>
      <ScreenHeader title="AI Studio"subtitle="Describe a habit and get a day-by-day challenge for it." />

      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          placeholder="What do you want to get better at?"
          placeholderTextColor={UI.faint}
          value={goal}
          onChangeText={setGoal}
          multiline
          maxLength={200}
        />
      </View>
      {!goal && (
        <View style={styles.examples}>
          {EXAMPLES.map((e) => (
            <Pressable key={e} onPress={() => setGoal(e)} hitSlop={4}>
              <Text style={styles.example}>{`"${e}"`}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.label}>Category</Text>
      <View style={styles.wrap}>
        {CATEGORIES.map((c) => (
          <View key={c.label} style={{ marginBottom: 8 }}>
            <FilterChip label={c.label} active={category === c.key} onPress={() => setCategory(c.key)} />
          </View>
        ))}
      </View>

      <Text style={styles.label}>Length</Text>
      <View style={styles.segment}>
        {DURATIONS.map((d) => (
          <Pressable
            key={d}
            onPress={() => setDuration(d)}
            style={[styles.segItem, duration === d && styles.segItemActive]}>
            <Text style={[styles.segText, duration === d && styles.segTextActive]}>
              {d === 1 ? '1 day' : `${d} days`}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={generate}
        disabled={loading || outOfQuota}
        style={({ pressed }) => [
          styles.primary,
          (loading || outOfQuota) && { opacity: 0.4 },
          pressed && { opacity: 0.85 },
        ]}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Generate</Text>}
      </Pressable>
      {quotaLine && <Text style={styles.quota}>{quotaLine}</Text>}

      {result && (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>{result.draft.title}</Text>
          <Text style={styles.resultMeta}>
            {result.draft.duration_days === 1 ? '1 day' : `${result.draft.duration_days} days`} ·{' '}
            {DifficultyColors[result.draft.difficulty]?.label ?? 'Easy'}
          </Text>
          <Text style={styles.resultDesc}>{result.draft.description}</Text>

          <View style={styles.tasks}>
            {result.draft.tasks.slice(0, 5).map((t) => (
              <View key={t.day_number} style={styles.task}>
                <Text style={styles.taskDay}>Day {t.day_number}</Text>
                <Text style={styles.taskTitle}>{t.title}</Text>
              </View>
            ))}
            {result.draft.tasks.length > 5 && (
              <Text style={styles.more}>and {result.draft.tasks.length - 5} more days</Text>
            )}
          </View>

          <View style={styles.resultActions}>
            <Pressable onPress={generate} disabled={loading || outOfQuota} style={styles.secondary}>
              <Text style={styles.secondaryText}>Try again</Text>
            </Pressable>
            <Pressable
              onPress={publish}
              disabled={publishing}
              style={({ pressed }) => [styles.primary, styles.flex1, pressed && { opacity: 0.85 }]}>
              {publishing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Publish</Text>}
            </Pressable>
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  inputWrap: { marginHorizontal: 20, padding: 14, borderRadius: 14, backgroundColor: UI.surface },
  input: {
    fontFamily: InterFonts.regular,
    fontSize: 17,
    lineHeight: 23,
    color: UI.text,
    minHeight: 72,
    textAlignVertical: 'top',
    outlineStyle: 'none',
  } as object,
  examples: { paddingHorizontal: 20, paddingTop: 12, gap: 6 },
  example: { fontFamily: InterFonts.regular, fontSize: 14, color: UI.muted },
  label: {
    fontFamily: InterFonts.medium,
    fontSize: 14,
    color: UI.muted,
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 10,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20 },
  segment: { flexDirection: 'row', marginHorizontal: 20, padding: 3, borderRadius: 12, backgroundColor: UI.surface },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  segItemActive: { backgroundColor: UI.surfaceHi },
  segText: { fontFamily: InterFonts.medium, fontSize: 14, color: UI.muted },
  segTextActive: { color: UI.text },
  primary: {
    height: 50,
    marginHorizontal: 20,
    marginTop: 28,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.accent,
  },
  primaryText: { fontFamily: InterFonts.semiBold, fontSize: 16, color: '#fff' },
  quota: { fontFamily: InterFonts.regular, fontSize: 13, color: UI.faint, textAlign: 'center', marginTop: 10 },
  result: { marginHorizontal: 20, marginTop: 28, padding: 20, borderRadius: 16, backgroundColor: UI.surface },
  resultTitle: { fontFamily: InterFonts.bold, fontSize: 20, lineHeight: 26, color: UI.text },
  resultMeta: { fontFamily: InterFonts.regular, fontSize: 14, color: UI.muted, marginTop: 4 },
  resultDesc: { fontFamily: InterFonts.regular, fontSize: 15, lineHeight: 22, color: UI.text, marginTop: 12 },
  tasks: { marginTop: 16, gap: 10 },
  task: { flexDirection: 'row', gap: 12 },
  taskDay: { fontFamily: InterFonts.medium, fontSize: 14, color: UI.faint, width: 48 },
  taskTitle: { fontFamily: InterFonts.regular, fontSize: 14, color: UI.text, flex: 1, lineHeight: 20 },
  more: { fontFamily: InterFonts.regular, fontSize: 14, color: UI.faint, marginLeft: 60 },
  resultActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  secondary: {
    height: 50,
    marginTop: 28,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.surfaceHi,
  },
  secondaryText: { fontFamily: InterFonts.semiBold, fontSize: 16, color: UI.text },
  flex1: { flex: 1, marginHorizontal: 0 },
});
