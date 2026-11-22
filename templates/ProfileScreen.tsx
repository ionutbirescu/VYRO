import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  SafeAreaView, Pressable
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Achievement = {
  id: string;
  emoji: string;
  name: string;
  earned: boolean;
};

const ACHIEVEMENTS: Achievement[] = [
  { id: '1', emoji: '🔥', name: '7-Day Streak',    earned: true },
  { id: '2', emoji: '⚡', name: 'First Challenge', earned: true },
  { id: '3', emoji: '🏆', name: 'Top 10%',         earned: false },
  { id: '4', emoji: '🌅', name: 'Early Bird',      earned: false },
  { id: '5', emoji: '🧠', name: 'Mindful Week',    earned: true },
  { id: '6', emoji: '📚', name: 'Bookworm',        earned: false },
];

const HISTORY = [
  { id: '1', title: "Maria's evening run",  category: 'Fitness',     daysCompleted: 7,  totalDays: 7,  xpEarned: 140 },
  { id: '2', title: 'Mindful mornings',      category: 'Mindfulness', daysCompleted: 14, totalDays: 14, xpEarned: 280 },
  { id: '3', title: '7-day reading sprint',  category: 'Reading',     daysCompleted: 5,  totalDays: 7,  xpEarned: 85 },
];

type Props = {
  name?: string;
  username?: string;
  level?: number;
  xp?: number;
  xpToNext?: number;
  streakDays?: number;
  challengesCompleted?: number;
  totalDaysActive?: number;
};

export function ProfileScreen({
  name = 'Stefan',
  username = 'stefan.b',
  level = 2,
  xp = 272,
  xpToNext = 500,
  streakDays = 4,
  challengesCompleted = 3,
  totalDaysActive = 18,
}: Props) {
  const [activeSection, setActiveSection] = useState<'achievements' | 'history'>('achievements');
  const progress = xp / xpToNext;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile header — avatar inițiale, fără imagine genereică */}
        <LinearGradient
          colors={['#1A1628', '#0D0B1A']}
          style={styles.profileHeader}
        >
          <View style={styles.avatarRing}>
            <LinearGradient
              colors={['#FF1864', '#FF6035']}
              style={styles.avatarGradient}
            >
              <Text style={styles.avatarInitial}>
                {name.charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
          </View>

          <Text style={styles.name}>{name}</Text>
          <Text style={styles.username}>@{username}</Text>

          {/* Level + XP progress */}
          <View style={styles.levelRow}>
            <Text style={styles.levelBadge}>Lv. {level}</Text>
            <View style={styles.xpBarContainer}>
              <View style={styles.xpBar}>
                <View style={[styles.xpFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
              </View>
              <Text style={styles.xpLabel}>{xp} / {xpToNext} XP</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stats — numerele MARI, fără background cards peste tot */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            {/* Numărul e mare — el e designul */}
            <Text style={styles.statBig}>{streakDays}</Text>
            <Text style={styles.statUnit}>day streak</Text>
            <Text style={styles.statEmoji}>🔥</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statBig}>{challengesCompleted}</Text>
            <Text style={styles.statUnit}>completed</Text>
            <Text style={styles.statEmoji}>🏆</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statBig}>{totalDaysActive}</Text>
            <Text style={styles.statUnit}>days active</Text>
            <Text style={styles.statEmoji}>📅</Text>
          </View>
        </View>

        {/* Section toggle */}
        <View style={styles.sectionToggle}>
          {(['achievements', 'history'] as const).map(s => (
            <Pressable
              key={s}
              onPress={() => setActiveSection(s)}
              style={[styles.toggleBtn, activeSection === s && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleText, activeSection === s && styles.toggleTextActive]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Achievements */}
        {activeSection === 'achievements' && (
          <View style={styles.achievementsGrid}>
            {ACHIEVEMENTS.map(a => (
              <View key={a.id} style={[styles.achievementItem, !a.earned && styles.achievementLocked]}>
                <Text style={[styles.achievementEmoji, !a.earned && { opacity: 0.3 }]}>
                  {a.emoji}
                </Text>
                <Text style={[styles.achievementName, !a.earned && styles.achievementNameLocked]}>
                  {a.name}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* History */}
        {activeSection === 'history' && (
          <View style={styles.historyList}>
            {HISTORY.map(h => (
              <View key={h.id} style={styles.historyCard}>
                <View style={styles.historyTop}>
                  <Text style={styles.historyTitle}>{h.title}</Text>
                  <View style={styles.xpEarned}>
                    <Text style={styles.xpEarnedStar}>★</Text>
                    <Text style={styles.xpEarnedText}>+{h.xpEarned}</Text>
                  </View>
                </View>
                <View style={styles.historyMeta}>
                  <Text style={styles.historyCat}>{h.category}</Text>
                  <Text style={styles.historyDays}>
                    {h.daysCompleted}/{h.totalDays} days
                    {h.daysCompleted === h.totalDays ? ' ✓' : ''}
                  </Text>
                </View>
                {/* Mini progress */}
                <View style={styles.historyProgress}>
                  <View style={[
                    styles.historyFill,
                    { width: `${(h.daysCompleted / h.totalDays) * 100}%` },
                    h.daysCompleted === h.totalDays && styles.historyFillComplete,
                  ]} />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Settings link */}
        <Pressable style={styles.settingsRow}>
          <Text style={styles.settingsText}>Settings</Text>
          <Text style={styles.settingsArrow}>→</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0B1A' },
  scroll: { flex: 1 },
  profileHeader: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  avatarRing: {
    width: 80,
    height: 80,
    borderRadius: 999,
    padding: 3,
    backgroundColor: '#0D0B1A',
    marginBottom: 14,
  },
  avatarGradient: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  username: {
    fontSize: 14,
    color: '#6B5F8A',
    fontWeight: '500',
    marginBottom: 20,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 320,
  },
  levelBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FF1864',
    backgroundColor: '#FF186420',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  xpBarContainer: {
    flex: 1,
    gap: 4,
  },
  xpBar: {
    height: 4,
    backgroundColor: '#231E35',
    borderRadius: 999,
    overflow: 'hidden',
  },
  xpFill: {
    height: 4,
    backgroundColor: '#FF1864',
    borderRadius: 999,
  },
  xpLabel: {
    fontSize: 10,
    color: '#6B5F8A',
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#1A1628',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#231E35',
    marginVertical: 8,
  },
  statBig: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 36,
  },
  statUnit: {
    fontSize: 11,
    color: '#6B5F8A',
    fontWeight: '500',
  },
  statEmoji: {
    fontSize: 14,
    marginTop: 2,
  },
  sectionToggle: {
    flexDirection: 'row',
    backgroundColor: '#1A1628',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 9,
  },
  toggleBtnActive: {
    backgroundColor: '#231E35',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B5F8A',
  },
  toggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 10,
  },
  achievementItem: {
    width: '30%',
    backgroundColor: '#1A1628',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  achievementLocked: {
    opacity: 0.5,
  },
  achievementEmoji: {
    fontSize: 24,
  },
  achievementName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  achievementNameLocked: {
    color: '#6B5F8A',
  },
  historyList: {
    paddingHorizontal: 16,
    gap: 10,
  },
  historyCard: {
    backgroundColor: '#1A1628',
    borderRadius: 14,
    padding: 14,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 8,
  },
  xpEarned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFB02015',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  xpEarnedStar: { fontSize: 10, color: '#FFB020' },
  xpEarnedText: { fontSize: 12, fontWeight: '700', color: '#FFB020' },
  historyMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  historyCat: {
    fontSize: 12,
    color: '#8A7FAD',
    fontWeight: '500',
  },
  historyDays: {
    fontSize: 12,
    color: '#6B5F8A',
    fontWeight: '500',
  },
  historyProgress: {
    height: 3,
    backgroundColor: '#231E35',
    borderRadius: 999,
    overflow: 'hidden',
  },
  historyFill: {
    height: 3,
    backgroundColor: '#FF1864',
    borderRadius: 999,
  },
  historyFillComplete: {
    backgroundColor: '#00C853',
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: '#1A1628',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  settingsText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  settingsArrow: {
    fontSize: 16,
    color: '#6B5F8A',
  },
});