import { Ionicons } from '@expo/vector-icons';
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
import { logEvent } from '@/api/events';
import type { Schemas } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

const HEADER_GREEN = '#1a3d2b';

type StudioCategoryKey = 'fitness' | 'nutrition' | 'mindfulness' | 'sleep' | 'learning' | 'reading' | 'creativity' | 'productivity' | 'social' | 'outdoors' | 'sustainability' | 'finance' | 'digital_detox' | undefined;

const CATEGORIES: { key: StudioCategoryKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: undefined, label: 'Any', icon: 'grid-outline' },
  { key: 'fitness', label: 'Fitness', icon: 'barbell-outline' },
  { key: 'nutrition', label: 'Nutrition', icon: 'nutrition-outline' },
  { key: 'mindfulness', label: 'Mindfulness', icon: 'body-outline' },
  { key: 'sleep', label: 'Sleep', icon: 'bed-outline' },
  { key: 'learning', label: 'Learning', icon: 'school-outline' },
  { key: 'reading', label: 'Reading', icon: 'book-outline' },
  { key: 'creativity', label: 'Creativity', icon: 'color-palette-outline' },
  { key: 'productivity', label: 'Productivity', icon: 'checkmark-circle-outline' },
  { key: 'social', label: 'Social', icon: 'people-outline' },
  { key: 'outdoors', label: 'Outdoors', icon: 'leaf-outline' },
  { key: 'sustainability', label: 'Sustainability', icon: 'refresh-circle-outline' },
  { key: 'finance', label: 'Finance', icon: 'wallet-outline' },
  { key: 'digital_detox', label: 'Detox', icon: 'eye-off-outline' },
];

const DURATIONS = [1, 7, 14, 30] as const;

export default function StudioScreen() {
  const { state } = useAuth();
  const colors = useTheme();
  const profile = state.status === 'ready' ? state.profile : null;

  const [quota, setQuota] = useState<Schemas['AiQuota'] | null>(null);
  const [goal, setGoal] = useState('');
  const [category, setCategory] = useState<StudioCategoryKey>(undefined);
  const [duration, setDuration] = useState<1 | 7 | 14 | 30>(7);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Schemas['GeneratedChallenge'] | null>(null);
  const [rating, setRating] = useState(0);
  const [publishing, setPublishing] = useState(false);

  function loadQuota() {
    api.GET('/v1/ai/quota').then(({ data }) => { if (data) setQuota(data); });
  }

  useEffect(loadQuota, []);

  const quotaExhausted = !!quota?.next_free_at;

  useEffect(() => {
    if (quotaExhausted) logEvent('vyro_plus_prompt_viewed', { source: 'ai_studio' });
  }, [quotaExhausted]);

  async function handleGenerate() {
    setGenerating(true);
    setResult(null);
    setRating(0);
    const { data, response } = await api.POST('/v1/ai/challenges/generate', {
      body: { goal: goal.trim() || undefined, category: category ?? undefined, duration_days: duration },
    });
    if (data) {
      setResult(data);
      setQuota(data.quota);
    } else if (response.status === 429) {
      loadQuota();
    } else {
      Alert.alert('Generation failed', 'Try again later.');
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
    const { data } = await api.POST('/v1/challenges', {
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

  const quotaUsed = quota ? Math.min((quota.used / Math.max(quota.limit ?? 1, 1)) * 100, 100) : 0;

  return (
    <View style={styles.root}>
      {/* Decorative circles */}
      <View style={[styles.dec, { width: 200, height: 200, top: -60, right: -50 }]} pointerEvents="none" />
      <View style={[styles.dec, { width: 80, height: 80, top: 10, right: 60 }]} pointerEvents="none" />

      <SafeAreaView edges={['top', 'left', 'right']} style={styles.headerArea}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <ThemedText style={styles.title}>AI Studio</ThemedText>
            <Ionicons name="sparkles" size={22} color="rgba(255,255,255,0.8)" />
          </View>
          <ThemedText style={styles.subtitle}>
            Describe your goal and AI builds a challenge for you
          </ThemedText>
          {quota && quota.limit !== null && (
            <View style={styles.quotaRow}>
              <View style={styles.quotaTrack}>
                <View style={[styles.quotaFill, { width: `${quotaUsed}%` as `${number}%` }]} />
              </View>
              <ThemedText style={styles.quotaLabel}>
                {Math.max(quota.limit - quota.used, 0)}/{quota.limit} drafts left
              </ThemedText>
            </View>
          )}
          {quota?.limit === null && (
            <View style={styles.unlimitedRow}>
              <Ionicons name="flash" size={12} color="#f59e0b" />
              <ThemedText style={styles.unlimitedLabel}>Unlimited drafts (VYRO+)</ThemedText>
            </View>
          )}
        </View>
      </SafeAreaView>

      <View style={styles.sheet}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}>

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
                      style={[
                        styles.pill,
                        active ? { backgroundColor: AccentColor } : { backgroundColor: colors.backgroundElement },
                      ]}
                      onPress={() => setCategory(cat.key)}>
                      <Ionicons name={cat.icon} size={12} color={active ? '#fff' : colors.textSecondary} />
                      <ThemedText type="small" style={{ color: active ? '#fff' : colors.text }}>
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
                      style={[styles.durationBtn, { backgroundColor: active ? HEADER_GREEN : colors.backgroundElement }]}
                      onPress={() => setDuration(d)}>
                      <ThemedText type="smallBold" style={{ color: active ? '#fff' : colors.text }}>
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

              {quota?.next_free_at ? (
                <View style={[styles.plusCard, { backgroundColor: colors.backgroundElement }]}>
                  <View style={styles.plusCardRow}>
                    <Ionicons name="flash" size={16} color="#f59e0b" />
                    <ThemedText type="smallBold">{`You've used your ${quota.limit} free drafts`}</ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {`Your next free draft unlocks ${fromNow(quota.next_free_at)}. VYRO+ gives you unlimited AI drafts.`}
                  </ThemedText>
                  <Pressable
                    style={styles.generateBtn}
                    onPress={() => { logEvent('vyro_plus_prompt_tapped', { source: 'ai_studio' }); router.push('/shop'); }}>
                    <Ionicons name="flash" size={16} color="#fff" />
                    <ThemedText style={{ color: '#fff', fontWeight: '600' }}>Get VYRO+</ThemedText>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[styles.generateBtn, { opacity: generating ? 0.5 : 1 }]}
                  onPress={handleGenerate}
                  disabled={generating}>
                  {generating
                    ? <ActivityIndicator color="#fff" />
                    : (
                      <>
                        <Ionicons name="sparkles" size={16} color="#fff" />
                        <ThemedText style={{ color: '#fff', fontWeight: '600' }}>Generate challenge</ThemedText>
                      </>
                    )
                  }
                </Pressable>
              )}
            </View>
          )}

          {result && (
            <View style={styles.preview}>
              <View style={[styles.draftCard, { backgroundColor: colors.backgroundElement }]}>
                <ThemedText type="smallBold" themeColor="textSecondary">AI generated draft</ThemedText>
                <ThemedText type="subtitle">{result.draft.title}</ThemedText>
                <ThemedText themeColor="textSecondary">{result.draft.description}</ThemedText>
                <View style={styles.draftMeta}>
                  <ThemedText type="small" themeColor="textSecondary">{result.draft.category.replace('_', ' ')}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">Difficulty {result.draft.difficulty}/5</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">·</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {result.draft.duration_days} day{result.draft.duration_days !== 1 ? 's' : ''}
                  </ThemedText>
                </View>
              </View>

              <ThemedText type="smallBold" themeColor="textSecondary">Daily tasks</ThemedText>
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

              <View style={styles.ratingRow}>
                <ThemedText type="small" themeColor="textSecondary">Rate this draft:</ThemedText>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Pressable key={s} onPress={() => submitRating(s)}>
                      <Ionicons name={s <= rating ? 'star' : 'star-outline'} size={22} color={s <= rating ? '#f59e0b' : '#94a3b8'} />
                    </Pressable>
                  ))}
                </View>
              </View>

              <Pressable
                style={[styles.generateBtn, { backgroundColor: HEADER_GREEN, opacity: publishing ? 0.5 : 1 }]}
                onPress={handlePublish}
                disabled={publishing}>
                {publishing
                  ? <ActivityIndicator color="#fff" />
                  : <ThemedText style={{ color: '#fff', fontWeight: '600' }}>Publish challenge</ThemedText>
                }
              </Pressable>

              <Pressable
                style={[styles.retryBtn, { borderColor: colors.backgroundSelected }]}
                onPress={() => setResult(null)}>
                <ThemedText type="small" themeColor="textSecondary">Try again</ThemedText>
              </Pressable>
            </View>
          )}

        </ScrollView>
      </View>
    </View>
  );
}

function fromNow(iso: string): string {
  const hours = Math.ceil((new Date(iso).getTime() - Date.now()) / 3_600_000);
  if (hours <= 1) return 'in under an hour';
  if (hours < 24) return `in ${hours} h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `in ${days} day${days > 1 ? 's' : ''}${rest ? ` ${rest} h` : ''}`;
}

function Label({ children }: { children: string }) {
  return <ThemedText type="smallBold" style={styles.label}>{children}</ThemedText>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HEADER_GREEN },
  dec: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)' },
  headerArea: { backgroundColor: HEADER_GREEN },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.one,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.65)' },
  quotaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  quotaTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  quotaFill: { height: '100%', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 2 },
  quotaLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  unlimitedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.one },
  unlimitedLabel: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  sheet: {
    flex: 1,
    backgroundColor: '#F4F4F8',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  form: { gap: Spacing.three },
  label: { marginBottom: -Spacing.two },
  input: { borderRadius: 12, padding: Spacing.three, fontSize: 16, minHeight: 80, textAlignVertical: 'top' },
  pills: { gap: Spacing.one, paddingVertical: Spacing.one },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 99,
  },
  durationRow: { flexDirection: 'row', gap: Spacing.two },
  durationBtn: { flex: 1, padding: Spacing.two, borderRadius: 12, alignItems: 'center' },
  diffNote: { marginTop: -Spacing.two },
  generateBtn: {
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
    backgroundColor: AccentColor,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  plusCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  plusCardRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  preview: { gap: Spacing.three },
  draftCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  draftMeta: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  taskRow: { borderRadius: 12, padding: Spacing.three, flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  dayDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  taskText: { flex: 1, gap: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  stars: { flexDirection: 'row', gap: Spacing.one },
  retryBtn: { borderRadius: 12, padding: Spacing.three, alignItems: 'center', borderWidth: 1 },
});
