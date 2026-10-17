// Set these in mobile/.env (copy .env.example). Expo inlines EXPO_PUBLIC_* values when bundling,
// so restart `npx expo start` after changing them.

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// Local API and mock server only (VYRO_AUTH_MODE=dev): until Firebase sign-in is wired up,
// requests are sent as the user "dev:<DEV_UID>".
export const DEV_UID = process.env.EXPO_PUBLIC_DEV_UID;
