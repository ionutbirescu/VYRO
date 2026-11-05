import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  // @ts-expect-error: only the React Native build of firebase/auth exports this (Metro picks
  // that build on iOS/Android); the TypeScript types describe the browser build.
  getReactNativePersistence,
  initializeAuth,
  type Persistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

import { FIREBASE_CONFIG } from '@/config';

const app = initializeApp(FIREBASE_CONFIG);

// Keeps the user signed in across app restarts: AsyncStorage on the phone, localStorage on web.
// Firebase needs a persistence class here; a plain object fails with "Expected a class
// definition".
const persistence: Persistence =
  Platform.OS === 'web' ? browserLocalPersistence : getReactNativePersistence(AsyncStorage);

export const auth = initializeAuth(app, { persistence });
export const db = getFirestore(app);
