import * as InAppPurchases from 'expo-in-app-purchases';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';

import { api } from '@/api/client';

export const IAP_PRODUCT_IDS = {
  PLUS_MONTHLY: 'com.ionutbirescu.vyro.plus_monthly',
  GOLD_FRAME: 'com.ionutbirescu.vyro.gold_frame',
  NIGHT_THEME: 'com.ionutbirescu.vyro.night_theme',
  CHALLENGE_PACK_30: 'com.ionutbirescu.vyro.challenge_pack_30',
} as const;

const ALL_PRODUCT_IDS = Object.values(IAP_PRODUCT_IDS);

const APPLE_TO_INTERNAL: Record<string, string> = {
  'com.ionutbirescu.vyro.plus_monthly': 'plus_monthly',
  'com.ionutbirescu.vyro.gold_frame': 'cosmetic_frame_gold',
  'com.ionutbirescu.vyro.night_theme': 'cosmetic_theme_night',
  'com.ionutbirescu.vyro.challenge_pack_30': 'challenge_pack_30',
};

export type IAPProduct = {
  productId: string;
  title: string;
  description: string;
  price: string;
  priceAmountMicros?: number;
  priceCurrencyCode?: string;
};

type IAPState = {
  products: IAPProduct[];
  loading: boolean;
  purchasing: string | null;
};

const isIOS = Platform.OS === 'ios';

export function useIAP(onPurchaseSuccess: (productId: string) => void) {
  const [state, setState] = useState<IAPState>({
    products: [],
    loading: isIOS,
    purchasing: null,
  });
  const connected = useRef(false);
  const onPurchaseSuccessRef = useRef(onPurchaseSuccess);
  onPurchaseSuccessRef.current = onPurchaseSuccess;

  useEffect(() => {
    if (!isIOS) return;

    async function init() {
      try {
        await InAppPurchases.connectAsync();
        connected.current = true;

        const { responseCode, results } = await InAppPurchases.getProductsAsync(ALL_PRODUCT_IDS);
        if (responseCode === InAppPurchases.IAPResponseCode.OK && results) {
          setState((s) => ({ ...s, products: results as IAPProduct[], loading: false }));
        } else {
          setState((s) => ({ ...s, loading: false }));
        }
      } catch {
        setState((s) => ({ ...s, loading: false }));
      }
    }

    InAppPurchases.setPurchaseListener(async ({ responseCode, results, errorCode }) => {
      if (responseCode === InAppPurchases.IAPResponseCode.OK && results) {
        for (const purchase of results) {
          if (!purchase.acknowledged) {
            try {
              const internalCode = APPLE_TO_INTERNAL[purchase.productId];
              if (!internalCode) throw new Error(`Unknown product: ${purchase.productId}`);
              await api.POST('/v1/shop/iap/validate', {
                body: {
                  product_code: internalCode,
                  receipt: purchase.transactionReceipt ?? '',
                  platform: 'ios',
                },
              });
              await InAppPurchases.finishTransactionAsync(purchase, true);
              onPurchaseSuccessRef.current(purchase.productId);
            } catch {
              Alert.alert('Purchase error', 'Could not validate purchase. Contact support.');
            }
          }
        }
      } else if (responseCode === InAppPurchases.IAPResponseCode.DEFERRED) {
        Alert.alert('Purchase pending', 'Your purchase is awaiting approval (Ask to Buy).');
      } else if (responseCode !== InAppPurchases.IAPResponseCode.USER_CANCELED) {
        if (errorCode !== undefined) {
          Alert.alert('Purchase failed', 'Something went wrong. Please try again.');
        }
      }
      setState((s) => ({ ...s, purchasing: null }));
    });

    init();

    return () => {
      if (connected.current) {
        InAppPurchases.disconnectAsync().catch(() => {});
        connected.current = false;
      }
    };
  }, []);

  const purchase = useCallback(async (productId: string) => {
    if (!isIOS) {
      Alert.alert('Not supported', 'In-app purchases are only available on iOS.');
      return;
    }
    setState((s) => ({ ...s, purchasing: productId }));
    try {
      await InAppPurchases.purchaseItemAsync(productId);
    } catch {
      setState((s) => ({ ...s, purchasing: null }));
      Alert.alert('Purchase failed', 'Could not start purchase. Please try again.');
    }
  }, []);

  const restorePurchases = useCallback(async () => {
    if (!isIOS) return;
    setState((s) => ({ ...s, purchasing: 'restore' }));
    try {
      await InAppPurchases.getPurchaseHistoryAsync();
    } catch {
      Alert.alert('Restore failed', 'Could not restore purchases. Please try again.');
    } finally {
      setState((s) => ({ ...s, purchasing: null }));
    }
  }, []);

  return { ...state, purchase, restorePurchases };
}
