import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  SafeAreaView, Pressable
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type ShopItem = {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: 'boost' | 'theme' | 'badge' | 'streak';
  emoji: string;
  popular?: boolean;
};

const ITEMS: ShopItem[] = [
  { id: '1', name: 'XP Boost', description: 'Double XP on your next completed challenge.', cost: 50, type: 'boost', emoji: '⚡', popular: true },
  { id: '2', name: 'Streak Shield', description: "Protect your streak for one missed day.", cost: 100, type: 'streak', emoji: '🛡️' },
  { id: '3', name: 'Dark Gold Theme', description: 'Unlock a dark gold color scheme for your profile.', cost: 200, type: 'theme', emoji: '✦', popular: true },
  { id: '4', name: 'Neon Cyan Theme', description: 'Cyan accent for profile and challenge cards.', cost: 200, type: 'theme', emoji: '◈' },
  { id: '5', name: 'Early Bird Badge', description: 'Show off that you are consistent in the mornings.', cost: 75, type: 'badge', emoji: '🌅' },
  { id: '6', name: 'XP Mega Boost', description: 'Triple XP for 24 hours.', cost: 150, type: 'boost', emoji: '🔥' },
];

const TABS = ['All', 'Boosts', 'Themes', 'Badges'];

type Props = {
  balance?: number;
};

export function ShopScreen({ balance = 272 }: Props) {
  const [activeTab, setActiveTab] = useState('All');

  const filtered = ITEMS.filter(item => {
    if (activeTab === 'All') return true;
    if (activeTab === 'Boosts') return item.type === 'boost';
    if (activeTab === 'Themes') return item.type === 'theme';
    if (activeTab === 'Badges') return item.type === 'badge';
    return true;
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header cu balance — numărul mare e designul */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Shop</Text>
            <Text style={styles.subtitle}>Spend your XP on boosts and cosmetics</Text>
          </View>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Balance</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceStar}>★</Text>
              <Text style={styles.balanceAmount}>{balance}</Text>
            </View>
            <Text style={styles.balanceXp}>XP</Text>
          </View>
        </View>

        {/* Featured item */}
        <LinearGradient
          colors={['#FF1864', '#9B1DFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.featuredCard}
        >
          <View style={styles.featuredContent}>
            <View>
              <Text style={styles.featuredBadge}>FEATURED</Text>
              <Text style={styles.featuredTitle}>XP Boost Weekend</Text>
              <Text style={styles.featuredDesc}>50% off all boosts until Sunday</Text>
            </View>
            <Text style={styles.featuredEmoji}>⚡</Text>
          </View>
        </LinearGradient>

        {/* Category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {TABS.map(tab => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Items grid */}
        <View style={styles.grid}>
          {filtered.map(item => (
            <View key={item.id} style={styles.itemCard}>
              {item.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>Popular</Text>
                </View>
              )}
              <Text style={styles.itemEmoji}>{item.emoji}</Text>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemDesc}>{item.description}</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.buyBtn,
                  balance < item.cost && styles.buyBtnDisabled,
                  pressed && { opacity: 0.8 },
                ]}
                disabled={balance < item.cost}
              >
                <Text style={styles.buyStar}>★</Text>
                <Text style={styles.buyText}>{item.cost} XP</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0B1A' },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#8A7FAD',
  },
  balanceCard: {
    backgroundColor: '#1A1628',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B5F8A',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  balanceStar: {
    fontSize: 14,
    color: '#FFB020',
  },
  balanceAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFB020',
  },
  balanceXp: {
    fontSize: 10,
    color: '#6B5F8A',
    fontWeight: '600',
  },
  featuredCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
  },
  featuredContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  featuredBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  featuredTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  featuredDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  featuredEmoji: {
    fontSize: 44,
  },
  tabsRow: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1A1628',
  },
  tabActive: {
    backgroundColor: '#231E35',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B5F8A',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 10,
  },
  itemCard: {
    width: '47%',
    backgroundColor: '#1A1628',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  popularBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FF186422',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 10,
  },
  popularText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FF1864',
  },
  itemEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  itemDesc: {
    fontSize: 12,
    color: '#8A7FAD',
    lineHeight: 17,
    marginBottom: 14,
  },
  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#231E35',
    paddingVertical: 9,
    borderRadius: 10,
    gap: 4,
  },
  buyBtnDisabled: {
    opacity: 0.4,
  },
  buyStar: {
    fontSize: 11,
    color: '#FFB020',
  },
  buyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFB020',
  },
});