import { Platform } from 'react-native';
import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, initializeAuth, type Persistence } from 'firebase/auth';

import { FIREBASE_CONFIG } from '@/config';

const app = initializeApp(FIREBASE_CONFIG);

// Firebase 13 removed getReactNativePersistence. On web use the built-in
// browserLocalPersistence; on native use a custom AsyncStorage adapter.
let persistence: Persistence;

if (Platform.OS === 'web') {
  persistence = browserLocalPersistence;
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  persistence = {
    type: 'LOCAL',
    async _isAvailable() { return true; },
    async _set(key: string, value: unknown) {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    },
    async _get(key: string) {
      const raw = await AsyncStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : null;
    },
    async _remove(key: string) {
      await AsyncStorage.removeItem(key);
    },
    _addListener(_key: string, _listener: () => void) {},
    _removeListener(_key: string, _listener: () => void) {},
  } as unknown as Persistence;
}

export const auth = initializeAuth(app, { persistence });
