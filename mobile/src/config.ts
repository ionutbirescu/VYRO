// Set these in mobile/.env (copy .env.example). Expo inlines EXPO_PUBLIC_* values when bundling,
// so restart `npx expo start` after changing them.

import Constants from 'expo-constants';

// The computer running `npx expo start`, as the phone reaches it. In Expo Go that is the
// computer's LAN IP, so the local API (docker compose up -d) is found without configuring it.
const devServerHost = Constants.expoConfig?.hostUri?.split(':')[0];

// Unset: the local API on port 8000 of the computer running Expo. Set it for the mock server
// (port 4010) or the deployed API.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (devServerHost ? `http://${devServerHost}:8000` : 'http://localhost:8000');

// Local API and mock server only (VYRO_AUTH_MODE=dev): until Firebase sign-in is wired up,
// requests are sent as the user "dev:<DEV_UID>".
export const DEV_UID = process.env.EXPO_PUBLIC_DEV_UID;

export const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};
