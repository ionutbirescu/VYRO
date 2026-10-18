import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

const PLUS_FEATURES = [
  '🤖 Unlimited AI challenge generation',
  '📊 Advanced analytics & insights',
  '⚡ Priority proof verification',
  '🏷️ Exclusive cosmetics access',
];

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export default function ShopScreen() {
  const { refreshProfile } = useAuth();
  const colors = useTheme();

  const [products, setProducts] = useState<Schemas['Product'][]>([]);
  const [entitlements, setEntitlements] = useState<Schemas['Entitlements'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [equipping, setEquipping] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.GET('/v1/shop/products'),
      api.GET('/v1/me/entitlements'),
    ]).then(([{ data: pl }, { data: ent }]) => {
      setProducts(pl?.items ?? []);
      setEntitlements(ent ?? null);
      setLoading(false);
    });
  }, []);

  async function handlePurchase(product: Schemas['Product']) {
    Alert.alert(
      `Buy ${product.name}`,
      `${formatPrice(product.price_cents, product.currency)} — sandbox mode, no real charge.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setPurchasing(product.code);
            const { data, error } = await api.POST('/v1/shop/checkout', {
              body: { product_code: product.code },
            });
            setPurchasing(null);
            if (error || !data) {
              Alert.alert('Purchase failed', 'Try again later.');
              return;
            }
            setEntitlements(data.entitlements);
            setProducts((prev) =>
              prev.map((p) => (p.code === product.code ? { ...p, owned: true } : p)),
            );
            await refreshProfile();
            Alert.alert('Purchased!', `${product.name} is now yours. (sandbox)`);
          },
        },
      ],
    );
  }

  async function handleEquip(code: string) {
    setEquipping(code);
    const { data } = await api.PUT('/v1/me/cosmetics/{cosmetic_code}/equipped', {
      params: { path: { cosmetic_code: code } },
    });
    if (data) setEntitlements(data);
    setEquipping(null);
  }

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const subProducts = products.filter((p) => p.kind === 'subscription' || p.kind === 'one_time');
  const cosmeticProducts = products.filter((p) => p.kind === 'cosmetic');
  const isPlus = entitlements?.is_plus ?? false;

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* VYRO+ section */}
          {subProducts.length > 0 && (
            <View style={[styles.plusCard, { backgroundColor: isPlus ? '#1a1a2e' : '#0f172a' }]}>
              <ThemedText type="subtitle" style={styles.plusTitle}>⚡ VYRO+</ThemedText>
              {isPlus && entitlements?.plus_until ? (
                <ThemedText type="small" style={{ color: '#f59e0b' }}>
                  Active until {new Date(entitlements.plus_until).toLocaleDateString()}
                </ThemedText>
              ) : (
                <ThemedText type="small" style={{ color: '#94a3b8' }}>
                  Unlock the full VYRO experience
                </ThemedText>
              )}

              <View style={styles.featureList}>
                {PLUS_FEATURES.map((f) => (
                  <ThemedText key={f} type="small" style={{ color: '#e2e8f0' }}>
                    {f}
                  </ThemedText>
                ))}
              </View>

              {subProducts.map((p) => (
                <Pressable
                  key={p.code}
                  style={[
                    styles.plusBtn,
                    { opacity: p.owned || purchasing === p.code ? 0.6 : 1 },
                  ]}
                  onPress={() => !p.owned && handlePurchase(p)}
                  disabled={p.owned || purchasing === p.code}>
                  <ThemedText style={{ color: '#000', fontWeight: '700', fontSize: 16 }}>
                    {p.owned
                      ? '✓ Subscribed'
                      : purchasing === p.code
                        ? 'Processing…'
                        : `${formatPrice(p.price_cents, p.currency)} / month`}
                  </ThemedText>
                  {!p.owned && (
                    <ThemedText type="small" style={{ color: '#00000080' }}>
                      Sandbox — no real charge
                    </ThemedText>
                  )}
                </Pressable>
              ))}
            </View>
          )}

          {/* Cosmetics */}
          {cosmeticProducts.length > 0 && (
            <View style={styles.section}>
              <ThemedText type="smallBold" style={styles.sectionTitle}>
                COSMETICS
              </ThemedText>
              <View style={styles.grid}>
                {cosmeticProducts.map((p) => {
                  const owned = entitlements?.cosmetics.find((c) => c.code === p.code);
                  const isEquipped = owned?.equipped ?? false;
                  const isBusy = purchasing === p.code || equipping === p.code;

                  return (
                    <View
                      key={p.code}
                      style={[
                        styles.cosmeticCard,
                        {
                          backgroundColor: isEquipped
                            ? colors.backgroundSelected
                            : colors.backgroundElement,
                          borderColor: isEquipped ? colors.text : 'transparent',
                          borderWidth: isEquipped ? 1.5 : 0,
                        },
                      ]}>
                      <ThemedText style={styles.cosmeticIcon}>🎨</ThemedText>
                      <ThemedText type="smallBold" style={styles.cosmeticName} numberOfLines={2}>
                        {p.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                        {p.description}
                      </ThemedText>

                      {owned ? (
                        <Pressable
                          style={[
                            styles.cosmeticBtn,
                            {
                              backgroundColor: isEquipped ? 'transparent' : colors.text,
                              borderColor: colors.text,
                              borderWidth: isEquipped ? 1 : 0,
                              opacity: isBusy ? 0.5 : 1,
                            },
                          ]}
                          onPress={() => handleEquip(p.code)}
                          disabled={isBusy}>
                          <ThemedText
                            type="small"
                            style={{
                              color: isEquipped ? colors.text : colors.background,
                              fontWeight: '600',
                            }}>
                            {isBusy ? '…' : isEquipped ? 'Equipped ✓' : 'Equip'}
                          </ThemedText>
                        </Pressable>
                      ) : (
                        <Pressable
                          style={[
                            styles.cosmeticBtn,
                            { backgroundColor: colors.text, opacity: isBusy ? 0.5 : 1 },
                          ]}
                          onPress={() => handlePurchase(p)}
                          disabled={isBusy}>
                          <ThemedText
                            type="small"
                            style={{ color: colors.background, fontWeight: '600' }}>
                            {isBusy ? '…' : formatPrice(p.price_cents, p.currency)}
                          </ThemedText>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {products.length === 0 && (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No products available right now.
            </ThemedText>
          )}

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1, alignItems: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.four,
  },
  plusCard: {
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  plusTitle: { color: '#f8fafc' },
  featureList: { gap: Spacing.two },
  plusBtn: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: Spacing.three,
    alignItems: 'center',
    gap: 4,
  },
  section: { gap: Spacing.two },
  sectionTitle: { letterSpacing: 0.8 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  cosmeticCard: {
    width: '47%',
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cosmeticIcon: { fontSize: 28 },
  cosmeticName: { lineHeight: 18 },
  cosmeticBtn: {
    borderRadius: 10,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  empty: { textAlign: 'center', paddingVertical: Spacing.six },
});
