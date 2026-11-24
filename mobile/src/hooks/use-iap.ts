import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import {
  ErrorCode,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  getReceiptDataIOS,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  requestReceiptRefreshIOS,
  restorePurchases as restoreStorePurchases,
} from 'react-native-iap';

import { api } from '@/api/client';

export const IAP_PRODUCT_IDS = {
  PLUS_MONTHLY: 'com.ionutbirescu.vyro.plus_monthly',
  GOLD_FRAME: 'com.ionutbirescu.vyro.gold_frame',
  NIGHT_THEME: 'com.ionutbirescu.vyro.night_theme',
  CHALLENGE_PACK_30: 'com.ionutbirescu.vyro.challenge_pack_30',
} as const;

const ALL_PRODUCT_IDS: string[] = Object.values(IAP_PRODUCT_IDS);

const APPLE_TO_INTERNAL: Record<string, string> = {
  'com.ionutbirescu.vyro.plus_monthly': 'plus_monthly',
  'com.ionutbirescu.vyro.gold_frame': 'cosmetic_frame_gold',
  'com.ionutbirescu.vyro.night_theme': 'cosmetic_theme_night',
  'com.ionutbirescu.vyro.challenge_pack_30': 'challenge_pack_30',
};

/** A product as the App Store returned it, with the price in the buyer's currency. */
export type StoreProduct = {
  id: string;
  displayPrice: string;
  type: 'in-app' | 'subs';
};

type IAPState = {
  products: StoreProduct[];
  loading: boolean;
  purchasing: string | null;
};

const isIOS = Platform.OS === 'ios';

/** Sends the app receipt to our API, which checks it with Apple and grants the product. */
async function grantOnServer(productId: string): Promise<boolean> {
  const productCode = APPLE_TO_INTERNAL[productId];
  if (!productCode) return false;
  try {
    const receipt = (await getReceiptDataIOS()) || (await requestReceiptRefreshIOS());
    if (!receipt) return false;
    const { error } = await api.POST('/v1/shop/iap/validate', {
      body: { product_code: productCode, receipt, platform: 'ios' },
    });
    return !error;
  } catch {
    return false;
  }
}

function describe(error: { code?: string; message?: string }) {
  switch (error.code) {
    case ErrorCode.NetworkError:
      return 'Check your connection and try again.';
    case ErrorCode.ItemUnavailable:
    case ErrorCode.SkuNotFound:
      return 'This item is not available from the App Store right now.';
    case ErrorCode.AlreadyOwned:
      return 'You already own this. Tap Restore purchases to get it back.';
    default:
      return `Something went wrong. Please try again.${error.code ? ` (${error.code})` : ''}`;
  }
}

export function useIAP(onPurchaseSuccess: (productId: string) => void) {
  const [state, setState] = useState<IAPState>({
    products: [],
    loading: isIOS,
    purchasing: null,
  });
  // Resolves with the App Store's products once the store connection is up.
  const ready = useRef<Promise<StoreProduct[]>>(Promise.resolve([]));
  const onPurchaseSuccessRef = useRef(onPurchaseSuccess);

  useEffect(() => {
    onPurchaseSuccessRef.current = onPurchaseSuccess;
  }, [onPurchaseSuccess]);

  useEffect(() => {
    if (!isIOS) return;

    // Also receives purchases left unfinished by an earlier session, so a failed grant is retried.
    const updates = purchaseUpdatedListener(async (purchase) => {
      if (purchase.purchaseState === 'pending') {
        Alert.alert('Purchase pending', 'Your purchase is waiting for approval.');
      } else if (purchase.purchaseState === 'purchased') {
        if (await grantOnServer(purchase.productId)) {
          // Finish only after our server granted it; StoreKit redelivers unfinished purchases.
          await finishTransaction({ purchase, isConsumable: false }).catch(() => {});
          onPurchaseSuccessRef.current(purchase.productId);
        } else {
          Alert.alert(
            'Purchase not confirmed yet',
            'Your payment went through, but we could not confirm it with our server. Open the shop again later or tap Restore purchases.',
          );
        }
      }
      setState((s) => ({ ...s, purchasing: null }));
    });

    const errors = purchaseErrorListener((error) => {
      setState((s) => ({ ...s, purchasing: null }));
      if (error.code !== ErrorCode.UserCancelled) Alert.alert('Purchase failed', describe(error));
    });

    ready.current = (async () => {
      try {
        await initConnection();
        const items = (await fetchProducts({ skus: ALL_PRODUCT_IDS, type: 'all' })) ?? [];
        const products = items.map((p) => ({ id: p.id, displayPrice: p.displayPrice, type: p.type }));
        setState((s) => ({ ...s, products, loading: false }));
        return products;
      } catch {
        setState((s) => ({ ...s, loading: false }));
        return [];
      }
    })();

    return () => {
      updates.remove();
      errors.remove();
    };
  }, []);

  const purchase = useCallback(async (productId: string) => {
    if (!isIOS) {
      Alert.alert('Not supported', 'In-app purchases are only available on iOS.');
      return;
    }
    const product = (await ready.current).find((p) => p.id === productId);
    if (!product) {
      // The App Store returns only products that are set up and approved for sale in App Store Connect.
      Alert.alert('Not available yet', 'This item is not available from the App Store yet.');
      return;
    }
    setState((s) => ({ ...s, purchasing: productId }));
    try {
      // On iOS, store failures (including cancel) arrive through purchaseErrorListener, not here.
      await requestPurchase(
        product.type === 'subs'
          ? { request: { apple: { sku: productId } }, type: 'subs' }
          : { request: { apple: { sku: productId } }, type: 'in-app' },
      );
    } catch (error) {
      setState((s) => ({ ...s, purchasing: null }));
      Alert.alert('Purchase failed', describe(error as { code?: string }));
    }
  }, []);

  /** Grants one-time items bought earlier with this Apple ID. Returns how many, or null on failure. */
  const restorePurchases = useCallback(async (): Promise<number | null> => {
    if (!isIOS) return 0;
    setState((s) => ({ ...s, purchasing: 'restore' }));
    try {
      await ready.current;
      await restoreStorePurchases();
      const owned = await getAvailablePurchases();
      // The subscription lives on our server already; only one-time items need granting again.
      const oneTime = [...new Set(owned.map((p) => p.productId))].filter(
        (id) => id !== IAP_PRODUCT_IDS.PLUS_MONTHLY,
      );
      const results = await Promise.all(oneTime.map(grantOnServer));
      return results.filter(Boolean).length;
    } catch {
      return null;
    } finally {
      setState((s) => ({ ...s, purchasing: null }));
    }
  }, []);

  return { ...state, purchase, restorePurchases };
}
