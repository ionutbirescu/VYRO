import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

const CATEGORIES = [
  { key: undefined, label: 'Any' },
  { key: 'fitness', label: '🏋️' },
  { key: 'nutrition', label: '🥗' },
  { key: 'mindfulness', label: '🧘' },
  { key: 'sleep', label: '😴' },
  { key: 'learning', label: '📚' },
  { key: 'reading', label: '📖' },
  { key: 'creativity', label: '🎨' },
  { key: 'productivity', label: '✅' },
  { key: 'social', label: '👥' },
  { key: 'outdoors', label: '🌿' },
  { key: 'sustainability', label: '♻️' },
  { key: 'finance', label: '💰' },
  { key: 'digital_detox', label: '📵' },
] as const;

const DURATIONS = [1, 7, 14, 30] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];

export default function StudioScreen() {
  const { state } = useAuth();
  const colors = useTheme();
  const profile = state.status === 'ready' ? state.profile : null;

  const [quota, setQuota] = useState<Schemas['AiQuota'] | null>(null);
  const [goal, setGoal] = useState('');
  const [category, setCategory] = useState<CategoryKey>(undefined);
  const [duration, setDuration] = useState<1 | 7 | 14 | 30>(7);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Schemas['GeneratedChallenge'] | null>(null);
  const [rating, setRating] = useState(0);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    api.GET('/v1/ai/quota').then(({ data }) => { if (data) setQuota(data); });
  }, []);

  const quotaExhausted =
    quota && quota.daily_limit !== null && quota.used_today >= quota.daily_limit;

  async function handleGenerate() {
    setGenerating(true);
    setResult(null);
    setRating(0);

    const { data, error } = await api.POST('/v1/ai/challenges/generate', {
      body: {
        goal: goal.trim() || undefined,
        category: category ?? undefined,
        duration_days: duration,
      },
    });

    if (data) {
      setResult(data);
      setQuota(data.quota);
    } else {
      const status = error && typeof error === 'object' && 'detail' in error
        ? String(error.detail) : '';
      Alert.alert(
        'Generation failed',
        status.includes('quota') ? 'Daily limit reached. Try again tomorrow.' : 'Try again later.',
      );
    }
    setGenerating(false);
  }

  async function submitRating(stars: number) {
    if (!result) return;
    setRating(stars);
    await api.PUT('/v1/ai/generations/{generation_id}/rating', {
      params: { path: { generation_id: result.generation_id } },
      body: { rating: stars },
    });
  }

  async function handlePublish() {
    if (!result) return;
    setPublishing(true);
    const { data, error } = await api.POST('/v1/challenges', {
      body: { ...result.draft, generation_id: result.generation_id, visibility: 'public' },
    });
    if (data) {
      setResult(null);
      Alert.alert('Published!', 'Your challenge is live.', [
        { text: 'View it', onPress: () => router.push(`/challenge/${data.id}`) },
        { text: 'OK' },
      ]);
    } else {
      Alert.alert('Could not publish', 'Try again.');
    }
    setPublishing(false);
  }

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          <ThemedText type="subtitle" style={styles.heading}>AI Studio</ThemedText>
          <ThemedText themeColor="textSecondary">
            Describe your goal and let AI build a challenge for you.
          </ThemedText>

          {/* Quota */}
          {quota && (
            <View style={[styles.quotaBar, { backgroundColor: colors.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {quota.daily_limit === null
                  ? '⚡ Unlimited generations (VYRO+)'
                  : `Generations today: ${quota.used_today} / ${quota.daily_limit}`}
              </ThemedText>
            </View>
          )}

          {/* Form */}
          {!result && (
            <View style={styles.form}>
              <Label>{"What's your goal? (optional)"}</Label>
              <TextInput
                style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text }]}
                placeholder="e.g. Run my first 5k, learn to meditate…"
                placeholderTextColor={colors.textSecondary}
                value={goal}
                onChangeText={setGoal}
                maxLength={500}
                multiline
                numberOfLines={3}
              />

              <Label>Category</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
                {CATEGORIES.map((cat) => {
                  const active = cat.key === category;
                  return (
                    <Pressable
                      key={String(cat.key)}
                      style={[styles.pill, { backgroundColor: active ? colors.text : colors.backgroundElement }]}
                      onPress={() => setCategory(cat.key)}>
                      <ThemedText type="small" style={{ color: active ? colors.background : colors.text }}>
                        {cat.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Label>Duration</Label>
              <View style={styles.durationRow}>
                {DURATIONS.map((d) => {
                  const active = d === duration;
                  return (
                    <Pressable
                      key={d}
                      style={[styles.durationBtn, { backgroundColor: active ? colors.text : colors.backgroundElement }]}
                      onPress={() => setDuration(d)}>
                      <ThemedText type="smallBold" style={{ color: active ? colors.background : colors.text }}>
                        {d === 1 ? '1 day' : `${d}d`}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              {profile && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.diffNote}>
                  Difficulty will match your current level (difficulty {profile.suggested_difficulty}/5)
                </ThemedText>
              )}

              <Pressable
                style={[styles.generateBtn, { backgroundColor: colors.text, opacity: (generating || !!quotaExhausted) ? 0.5 : 1 }]}
                onPress={handleGenerate}
                disabled={generating || !!quotaExhausted}>
                {generating
                  ? <ActivityIndicator color={colors.background} />
                  : <ThemedText style={{ color: colors.background, fontWeight: '600' }}>
                      ✨ Generate challenge
                    </ThemedText>
                }
              </Pressable>
            </View>
          )}

          {/* Preview */}
          {result && (
            <View style={styles.preview}>
              <View style={[styles.draftCard, { backgroundColor: colors.backgroundElement }]}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.draftLabel}>
                  AI GENERATED DRAFT
                </ThemedText>
                <ThemedText type="subtitle">{result.draft.title}</ThemedText>
                <ThemedText themeColor="textSecondary">{result.draft.description}</ThemedText>

                <View style={styles.draftMeta}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {result.draft.category.replace('_', ' ')}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Difficulty {result.draft.difficulty}/5
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {result.draft.duration_days} day{result.draft.duration_days !== 1 ? 's' : ''}
                  </ThemedText>
                </View>
              </View>

              {/* Tasks preview */}
              <ThemedText type="smallBold" style={styles.tasksLabel}>DAILY TASKS</ThemedText>
              {result.draft.tasks.map((task) => (
                <View key={task.day_number} style={[styles.taskRow, { backgroundColor: colors.backgroundElement }]}>
                  <View style={[styles.dayDot, { backgroundColor: colors.backgroundSelected }]}>
                    <ThemedText type="small" themeColor="textSecondary">D{task.day_number}</ThemedText>
                  </View>
                  <View style={styles.taskText}>
                    <ThemedText type="smallBold">{task.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      {task.instructions}
                    </ThemedText>
                  </View>
                </View>
              ))}

              {/* Star rating */}
              <View style={styles.ratingRow}>
                <ThemedText type="small" themeColor="textSecondary">Rate this draft:</ThemedText>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Pressable key={s} onPress={() => submitRating(s)}>
                      <ThemedText style={[styles.star, { opacity: s <= rating ? 1 : 0.3 }]}>⭐</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Actions */}
              <Pressable
                style={[styles.generateBtn, { backgroundColor: colors.text, opacity: publishing ? 0.5 : 1 }]}
                onPress={handlePublish}
                disabled={publishing}>
                {publishing
                  ? <ActivityIndicator color={colors.background} />
                  : <ThemedText style={{ color: colors.background, fontWeight: '600' }}>Publish challenge</ThemedText>
                }
              </Pressable>

              <Pressable
                style={[styles.retryBtn, { borderColor: colors.backgroundElement }]}
                onPress={() => setResult(null)}>
                <ThemedText type="small" themeColor="textSecondary">Try again</ThemedText>
              </Pressable>
            </View>
          )}

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Label({ children }: { children: string }) {
  return <ThemedText type="smallBold" style={styles.label}>{children}</ThemedText>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1, alignItems: 'center' },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
    paddingTop: Spacing.four,
  },
  heading: { marginBottom: -Spacing.two },
  quotaBar: { borderRadius: 12, padding: Spacing.two + 2, alignItems: 'center' },
  form: { gap: Spacing.three },
  label: { marginBottom: -Spacing.two },
  input: { borderRadius: 12, padding: Spacing.three, fontSize: 16, minHeight: 80, textAlignVertical: 'top' },
  pills: { gap: Spacing.one, paddingVertical: Spacing.one },
  pill: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: 99 },
  durationRow: { flexDirection: 'row', gap: Spacing.two },
  durationBtn: { flex: 1, padding: Spacing.two, borderRadius: 12, alignItems: 'center' },
  diffNote: { marginTop: -Spacing.two },
  generateBtn: { borderRadius: 12, padding: Spacing.three, alignItems: 'center' },
  preview: { gap: Spacing.three },
  draftCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  draftLabel: { letterSpacing: 0.8 },
  draftMeta: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  tasksLabel: { letterSpacing: 0.8 },
  taskRow: { borderRadius: 12, padding: Spacing.three, flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  dayDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  taskText: { flex: 1, gap: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  stars: { flexDirection: 'row', gap: Spacing.one },
  star: { fontSize: 24 },
  retryBtn: { borderRadius: 12, padding: Spacing.three, alignItems: 'center', borderWidth: 1 },
});
