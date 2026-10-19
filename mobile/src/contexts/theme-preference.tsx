import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'vyro_theme';

const ThemePreferenceContext = createContext<{
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  resolvedScheme: 'light' | 'dark';
}>({ preference: 'system', setPreference: () => {}, resolvedScheme: 'light' });

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme() ?? 'light';
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === 'light' || val === 'dark' || val === 'system') setPreferenceState(val);
    });
  }, []);

  function setPreference(p: ThemePreference) {
    setPreferenceState(p);
    AsyncStorage.setItem(STORAGE_KEY, p);
  }

  const resolvedScheme: 'light' | 'dark' = preference === 'system' ? system : preference;

  return (
    <ThemePreferenceContext.Provider value={{ preference, setPreference, resolvedScheme }}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  return useContext(ThemePreferenceContext);
}
