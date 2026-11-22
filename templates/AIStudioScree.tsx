import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, SafeAreaView,
  TextInput, Pressable, ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const PROMPT_IDEAS = [
  '7-day morning run habit',
  'Learn 10 Spanish words daily',
  'No phone after 10pm for 2 weeks',
  '5-minute breathing exercise every day',
  'Read 20 pages before bed',
  'Cold shower every morning',
];

const CATEGORIES = ['Fitness', 'Mindfulness', 'Learning', 'Sleep', 'Reading', 'Nutrition'];
const DURATIONS = ['3 days', '7 days', '14 days', '30 days'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;

export function AIStudioScreen() {
  const [prompt, setPrompt] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDuration, setSelectedDuration] = useState('7 days');
  const [selectedDifficulty, setSelectedDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<null | { title: string; description: string; xp: number }>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setGenerated(null);
    // Înlocuiește cu apelul real la API
    await new Promise(r => setTimeout(r, 1500));
    setGenerated({
      title: prompt,
      description: `A ${selectedDuration} ${selectedDifficulty.toLowerCase()} challenge: ${prompt}. Each day builds on the last.`,
      xp: selectedDifficulty === 'Easy' ? 50 : selectedDifficulty === 'Medium' ? 150 : 300,
    });
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>AI Studio</Text>
          <Text style={styles.subtitle}>Describe what you want to build as a habit — AI will make a challenge out of it.</Text>
        </View>

        {/* Main input */}
        <View style={styles.inputCard}>
          <TextInput
            style={styles.mainInput}
            placeholder="e.g. I want to run every morning for a week"
            placeholderTextColor="#4A4065"
            value={prompt}
            onChangeText={setPrompt}
            multiline
            maxLength={200}
          />
          <Text style={styles.charCount}>{prompt.length}/200</Text>
        </View>

        {/* Quick ideas */}
        <Text style={styles.sectionLabel}>Quick ideas</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.ideasRow}
        >
          {PROMPT_IDEAS.map(idea => (
            <Pressable
              key={idea}
              onPress={() => setPrompt(idea)}
              style={[styles.ideaChip, prompt === idea && styles.ideaChipActive]}
            >
              <Text style={[styles.ideaText, prompt === idea && styles.ideaTextActive]}>
                {idea}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Category */}
        <Text style={styles.sectionLabel}>Category</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.optionsRow}
        >
          {CATEGORIES.map(cat => (
            <Pressable
              key={cat}
              onPress={() => setSelectedCategory(cat)}
              style={[styles.optionChip, selectedCategory === cat && styles.optionChipActive]}
            >
              <Text style={[styles.optionText, selectedCategory === cat && styles.optionTextActive]}>
                {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Duration */}
        <Text style={styles.sectionLabel}>Duration</Text>
        <View style={styles.optionsRow}>
          {DURATIONS.map(d => (
            <Pressable
              key={d}
              onPress={() => setSelectedDuration(d)}
              style={[styles.optionChip, selectedDuration === d && styles.optionChipActive]}
            >
              <Text style={[styles.optionText, selectedDuration === d && styles.optionTextActive]}>
                {d}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Difficulty */}
        <Text style={styles.sectionLabel}>Difficulty</Text>
        <View style={styles.diffRow}>
          {(['Easy', 'Medium', 'Hard'] as const).map(d => {
            const colors = { Easy: '#00E5FF', Medium: '#FF6035', Hard: '#FF1864' };
            const active = selectedDifficulty === d;
            return (
              <Pressable
                key={d}
                onPress={() => setSelectedDifficulty(d)}
                style={[
                  styles.diffChip,
                  active && { backgroundColor: colors[d] },
                ]}
              >
                <Text style={[styles.diffText, active && styles.diffTextActive]}>{d}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Generate button */}
        <Pressable
          onPress={handleGenerate}
          disabled={!prompt.trim() || loading}
          style={({ pressed }) => [styles.generateBtn, (!prompt.trim() || loading) && styles.generateBtnDisabled, pressed && { opacity: 0.88 }]}
        >
          <LinearGradient
            colors={['#FF1864', '#FF6035']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.generateGradient}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.generateText}>Generate Challenge</Text>
            )}
          </LinearGradient>
        </Pressable>

        {/* Result */}
        {generated && (
          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>Generated challenge</Text>
            <Text style={styles.resultTitle}>{generated.title}</Text>
            <Text style={styles.resultDesc}>{generated.description}</Text>
            <View style={styles.resultMeta}>
              <View style={styles.xpBadge}>
                <Text style={styles.xpStar}>★</Text>
                <Text style={styles.xpText}>{generated.xp} XP</Text>
              </View>
            </View>
            <Pressable style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save Challenge</Text>
            </Pressable>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0B1A' },
  scroll: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#8A7FAD',
    lineHeight: 20,
  },
  inputCard: {
    backgroundColor: '#1A1628',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  mainInput: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '400',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    textAlign: 'right',
    fontSize: 11,
    color: '#4A4065',
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B5F8A',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  ideasRow: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 24,
  },
  ideaChip: {
    backgroundColor: '#1A1628',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  ideaChipActive: {
    backgroundColor: '#231E35',
  },
  ideaText: {
    fontSize: 13,
    color: '#8A7FAD',
    fontWeight: '500',
  },
  ideaTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 24,
  },
  optionChip: {
    backgroundColor: '#1A1628',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  optionChipActive: {
    backgroundColor: '#231E35',
  },
  optionText: {
    fontSize: 13,
    color: '#8A7FAD',
    fontWeight: '600',
  },
  optionTextActive: {
    color: '#FFFFFF',
  },
  diffRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 32,
  },
  diffChip: {
    flex: 1,
    backgroundColor: '#1A1628',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  diffText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B5F8A',
  },
  diffTextActive: {
    color: '#0D0B1A',
  },
  generateBtn: {
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 24,
  },
  generateBtnDisabled: {
    opacity: 0.4,
  },
  generateGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  generateText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  resultCard: {
    backgroundColor: '#1A1628',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
  },
  resultLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FF1864',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  resultDesc: {
    fontSize: 14,
    color: '#8A7FAD',
    lineHeight: 20,
    marginBottom: 14,
  },
  resultMeta: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#231E35',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 4,
  },
  xpStar: { fontSize: 10, color: '#FFB020' },
  xpText: { fontSize: 12, fontWeight: '700', color: '#FFB020' },
  saveBtn: {
    backgroundColor: '#231E35',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});