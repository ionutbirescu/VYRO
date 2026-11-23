import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import {
  clearTransactionIOS,
  finishTransaction,
  getProducts,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
} from 'react-native-iap';

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
  localizedPrice?: string;
  currency?: string;
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
  const onPurchaseSuccessRef = useRef(onPurchaseSuccess);

  useEffect(() => {
    onPurchaseSuccessRef.current = onPurchaseSuccess;
  }, [onPurchaseSuccess]);

  useEffect(() => {
    if (!isIOS) return;

    let purchaseUpdateSub: ReturnType<typeof purchaseUpdatedListener> | null = null;
    let purchaseErrorSub: ReturnType<typeof purchaseErrorListener> | null = null;

    async function init() {
      try {
        await initConnection();
        await clearTransactionIOS();

        const items = await getProducts({ skus: ALL_PRODUCT_IDS });
        setState((s) => ({ ...s, products: items as IAPProduct[], loading: false }));
      } catch {
        setState((s) => ({ ...s, loading: false }));
      }

      purchaseUpdateSub = purchaseUpdatedListener(async (purchase) => {
        const receipt = purchase.transactionReceipt;
        if (!receipt) return;

        const internalCode = APPLE_TO_INTERNAL[purchase.productId];
        if (!internalCode) {
          await finishTransaction({ purchase, isConsumable: false });
          return;
        }

        try {
          await api.POST('/v1/shop/iap/validate', {
            body: {
              product_code: internalCode,
              receipt,
              platform: 'ios',
            },
          });
          await finishTransaction({ purchase, isConsumable: false });
          onPurchaseSuccessRef.current(purchase.productId);
        } catch {
          Alert.alert('Purchase error', 'Could not validate purchase. Contact support.');
        }

        setState((s) => ({ ...s, purchasing: null }));
      });

      purchaseErrorSub = purchaseErrorListener((error) => {
        if (error.code !== 'E_USER_CANCELLED') {
          Alert.alert('Purchase failed', 'Something went wrong. Please try again.');
        }
        setState((s) => ({ ...s, purchasing: null }));
      });
    }

    init();

    return () => {
      purchaseUpdateSub?.remove();
      purchaseErrorSub?.remove();
    };
  }, []);

  const purchase = useCallback(async (productId: string) => {
    if (!isIOS) {
      Alert.alert('Not supported', 'In-app purchases are only available on iOS.');
      return;
    }
    setState((s) => ({ ...s, purchasing: productId }));
    try {
      await requestPurchase({ sku: productId, andDangerouslyFinishTransactionAutomaticallyIOS: false });
    } catch {
      setState((s) => ({ ...s, purchasing: null }));
      Alert.alert('Purchase failed', 'Could not start purchase. Please try again.');
    }
  }, []);

  const restore = useCallback(async () => {
    if (!isIOS) return;
    setState((s) => ({ ...s, purchasing: 'restore' }));
    try {
      await restorePurchases();
    } catch {
      Alert.alert('Restore failed', 'Could not restore purchases. Please try again.');
    } finally {
      setState((s) => ({ ...s, purchasing: null }));
    }
  }, []);

  return { ...state, purchase, restorePurchases: restore };
}
