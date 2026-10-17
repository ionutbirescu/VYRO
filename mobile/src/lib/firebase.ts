import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, type Persistence } from 'firebase/auth';

import { FIREBASE_CONFIG } from '@/config';

// Firebase 13 removed getReactNativePersistence from the public API.
// This adapter keeps the user signed in across app restarts via AsyncStorage.
const asyncStoragePersistence: Persistence = {
  type: 'LOCAL',
  async _isAvailable() {
    return true;
  },
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

const app = initializeApp(FIREBASE_CONFIG);

export const auth = initializeAuth(app, {
  persistence: asyncStoragePersistence,
});
