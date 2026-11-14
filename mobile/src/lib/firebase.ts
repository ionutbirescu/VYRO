import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  // @ts-expect-error: only the React Native build of firebase/auth exports this (Metro picks
  // that build on iOS/Android); the TypeScript types describe the browser build.
  getReactNativePersistence,
  initializeAuth,
  type Persistence,
  signInAnonymously,
  type User,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

import { DEV_UID, FIREBASE_CONFIG } from '@/config';

const app = initializeApp(FIREBASE_CONFIG);

// Keeps the user signed in across app restarts: AsyncStorage on the phone, localStorage on web.
// Firebase needs a persistence class here; a plain object fails with "Expected a class
// definition".
const persistence: Persistence =
  Platform.OS === 'web' ? browserLocalPersistence : getReactNativePersistence(AsyncStorage);

export const auth = initializeAuth(app, { persistence });
export const db = getFirestore(app);

/**
 * The Firebase account chat runs as; Firestore's rules only let signed-in accounts in.
 * The dev build skips Firebase sign-in (EXPO_PUBLIC_DEV_UID), so it signs in anonymously.
 */
export async function chatAccount(): Promise<User | null> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  if (DEV_UID) return (await signInAnonymously(auth)).user;
  return null;
}
