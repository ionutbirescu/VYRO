import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { Screen, ScreenHeader } from '@/components/screen';
import { InterFonts, UI } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { IAP_PRODUCT_IDS, useIAP } from '@/hooks/use-iap';

const PLUS_FEATURES = [
  'Unlimited AI challenge generation',
  'Advanced stats on your progress',
  'Faster proof verification',
  'Access to every cosmetic',
];

const PRODUCT_ID_MAP: Record<string, string> = {
  'plus_monthly': IAP_PRODUCT_IDS.PLUS_MONTHLY,
  'challenge_pack_30': IAP_PRODUCT_IDS.CHALLENGE_PACK_30,
  'cosmetic_frame_gold': IAP_PRODUCT_IDS.GOLD_FRAME,
  'cosmetic_theme_night': IAP_PRODUCT_IDS.NIGHT_THEME,
};

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

export default function ShopScreen() {
  const { refreshProfile } = useAuth();
  const [products, setProducts] = useState<Schemas['Product'][] | null>(null);
  const [ent, setEnt] = useState<Schemas['Entitlements'] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function handlePurchaseSuccess(iapProductId: string) {
    const { data } = await api.GET('/v1/me/entitlements', {});
    if (data) setEnt(data);
    setProducts((prev) =>
      prev?.map((p) => {
        const mappedId = PRODUCT_ID_MAP[p.code];
        return mappedId === iapProductId ? { ...p, owned: true } : p;
      }) ?? null,
    );
    await refreshProfile();
    notify('Purchase successful!', 'Your purchase is now active.');
  }

  const { products: iapProducts, purchasing, purchase, restorePurchases } = useIAP(handlePurchaseSuccess);

  useEffect(() => {
    Promise.all([api.GET('/v1/shop/products', {}), api.GET('/v1/me/entitlements', {})]).then(
      ([{ data: pl }, { data: e }]) => {
        setProducts(pl?.items ?? []);
        setEnt(e ?? null);
      },
      () => setProducts([]),
    );
  }, []);

  function getIAPPrice(productCode: string): string | null {
    const iapId = PRODUCT_ID_MAP[productCode];
    if (!iapId) return null;
    return iapProducts.find((p) => p.productId === iapId)?.price ?? null;
  }

  async function buy(product: Schemas['Product']) {
    const iapId = PRODUCT_ID_MAP[product.code];
    if (iapId) {
      await purchase(iapId);
      return;
    }
    // Fallback sandbox path for unmapped products
    if (Platform.OS === 'web') {
      if (!window.confirm(`Buy ${product.name}?\n\n${formatPrice(product.price_cents, product.currency)} — sandbox mode.`)) return;
    } else {
      await new Promise<void>((resolve, reject) =>
        Alert.alert(
          `Buy ${product.name}?`,
          `${formatPrice(product.price_cents, product.currency)} — sandbox mode.`,
          [{ text: 'Cancel', style: 'cancel', onPress: reject }, { text: 'Buy', onPress: resolve }],
        ),
      ).catch(() => null);
      return;
    }
    setBusy(product.code);
    const { data, error } = await api.POST('/v1/shop/checkout', { body: { product_code: product.code } });
    setBusy(null);
    if (error || !data) return notify('Purchase failed', 'Try again in a bit.');
    setEnt(data.entitlements);
    setProducts((prev) => prev?.map((p) => (p.code === product.code ? { ...p, owned: true } : p)) ?? null);
    await refreshProfile();
  }

  async function equip(code: string) {
    setBusy(code);
    const { data } = await api.PUT('/v1/me/cosmetics/{cosmetic_code}/equipped', {
      params: { path: { cosmetic_code: code } },
    });
    if (data) setEnt(data);
    setBusy(null);
  }

  if (products === null) {
    return (
      <Screen>
        <ScreenHeader title="Shop" />
        <ActivityIndicator color={UI.muted} />
      </Screen>
    );
  }

  const plans = products.filter((p) => p.kind === 'subscription' || p.kind === 'one_time');
  const cosmetics = products.filter((p) => p.kind === 'cosmetic');
  const isPlus = ent?.is_plus ?? false;

  return (
    <Screen>
      <ScreenHeader title="Shop" />

      {plans.length > 0 && (
        <View style={styles.plus}>
          <View style={styles.plusHead}>
            <Text style={styles.plusTitle}>VYRO+</Text>
            {isPlus && <Text style={styles.activeTag}>Active</Text>}
          </View>
          <Text style={styles.plusSub}>
            {isPlus && ent?.plus_until
              ? `Renews ${new Date(ent.plus_until).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`
              : 'Everything in VYRO, without limits.'}
          </Text>

          <View style={styles.features}>
            {PLUS_FEATURES.map((f) => (
              <View key={f} style={styles.feature}>
                <Ionicons name="checkmark" size={16} color={UI.muted} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>

          {!isPlus &&
            plans.map((p) => {
              const iapPrice = getIAPPrice(p.code);
              const isBuying = purchasing === PRODUCT_ID_MAP[p.code];
              return (
                <Pressable
                  key={p.code}
                  disabled={p.owned || isBuying}
                  onPress={() => buy(p)}
                  style={({ pressed }) => [styles.planBtn, pressed && { opacity: 0.85 }]}>
                  {isBuying ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.planName}>{p.name}</Text>
                      <Text style={styles.planPrice}>
                        {iapPrice ?? formatPrice(p.price_cents, p.currency)}
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            })}
        </View>
      )}

      {cosmetics.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Cosmetics</Text>
          <View style={styles.list}>
            {cosmetics.map((p) => {
              const owned = ent?.cosmetics.find((c) => c.code === p.code);
              const equipped = owned?.equipped ?? false;
              const iapPrice = getIAPPrice(p.code);
              const isBuying = purchasing === PRODUCT_ID_MAP[p.code];
              const isLoading = busy === p.code || isBuying;
              return (
                <View key={p.code} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{p.name}</Text>
                    <Text style={styles.rowDesc} numberOfLines={2}>{p.description}</Text>
                  </View>
                  {owned ? (
                    <Pressable
                      disabled={equipped || isLoading}
                      onPress={() => equip(p.code)}
                      style={[styles.smallBtn, equipped && styles.smallBtnQuiet]}>
                      <Text style={[styles.smallBtnText, equipped && { color: UI.muted }]}>
                        {isLoading ? '…' : equipped ? 'In use' : 'Use'}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable disabled={isLoading} onPress={() => buy(p)} style={styles.smallBtn}>
                      <Text style={styles.smallBtnText}>
                        {isLoading ? '…' : iapPrice ?? formatPrice(p.price_cents, p.currency)}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}

      {products.length === 0 && <Text style={styles.empty}>The shop is empty right now.</Text>}

      <Pressable onPress={restorePurchases} disabled={purchasing === 'restore'} style={styles.restoreBtn}>
        <Text style={styles.restoreText}>
          {purchasing === 'restore' ? 'Restoring…' : 'Restore purchases'}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  plus: { marginHorizontal: 20, padding: 20, borderRadius: 18, backgroundColor: UI.surface },
  plusHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  plusTitle: { fontFamily: InterFonts.bold, fontSize: 22, color: UI.text },
  activeTag: {
    fontFamily: InterFonts.medium,
    fontSize: 12,
    color: UI.success,
    backgroundColor: 'rgba(61,214,140,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  plusSub: { fontFamily: InterFonts.regular, fontSize: 15, color: UI.muted, marginTop: 4 },
  features: { marginTop: 16, marginBottom: 8, gap: 10 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontFamily: InterFonts.regular, fontSize: 15, color: UI.text },
  planBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: UI.accent,
  },
  planName: { fontFamily: InterFonts.semiBold, fontSize: 15, color: '#fff' },
  planPrice: { fontFamily: InterFonts.semiBold, fontSize: 15, color: '#fff' },
  sectionTitle: {
    fontFamily: InterFonts.semiBold,
    fontSize: 17,
    color: UI.text,
    paddingHorizontal: 20,
    marginTop: 32,
    marginBottom: 12,
  },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: UI.line },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: UI.line,
  },
  rowTitle: { fontFamily: InterFonts.medium, fontSize: 16, color: UI.text },
  rowDesc: { fontFamily: InterFonts.regular, fontSize: 14, lineHeight: 19, color: UI.muted, marginTop: 2 },
  smallBtn: {
    minWidth: 72,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: UI.surfaceHi,
  },
  smallBtnQuiet: { backgroundColor: 'transparent' },
  smallBtnText: { fontFamily: InterFonts.semiBold, fontSize: 14, color: UI.text },
  empty: { fontFamily: InterFonts.regular, fontSize: 15, color: UI.muted, paddingHorizontal: 20 },
  restoreBtn: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  restoreText: { fontFamily: InterFonts.regular, fontSize: 14, color: UI.muted, textDecorationLine: 'underline' },
});
