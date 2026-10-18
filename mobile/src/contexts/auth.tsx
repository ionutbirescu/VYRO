import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, setTokenProvider } from '@/api/client';
import { DEV_UID } from '@/config';
import { auth } from '@/lib/firebase';
import type { Schemas } from '@/api/client';

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'needs_profile'; user: FirebaseUser }
  | { status: 'ready'; user: FirebaseUser; profile: Schemas['Me'] };

type AuthContextType = {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

async function fetchProfileStatus(
  user: FirebaseUser,
): Promise<AuthState> {
  const { data, error } = await api.GET('/v1/me');
  if (data) return { status: 'ready', user, profile: data };
  const detail = error && typeof error === 'object' && 'detail' in error ? error.detail : null;
  if (detail === 'registration_required') return { status: 'needs_profile', user };
  // Network or unexpected error — stay as needs_profile so user can retry.
  return { status: 'needs_profile', user };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    // Dev mode: skip Firebase and go straight into the app with mock data.
    if (DEV_UID) {
      setTokenProvider(async () => `dev:${DEV_UID}`);
      api.GET('/v1/me').then(({ data }) => {
        if (data) setState({ status: 'ready', user: null as unknown as FirebaseUser, profile: data });
        else setState({ status: 'unauthenticated' });
      });
      return;
    }

    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setTokenProvider(async () => null);
        setState({ status: 'unauthenticated' });
        return;
      }
      setTokenProvider(() => user.getIdToken());
      setState(await fetchProfileStatus(user));
    });
  }, []);

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged fires automatically after this.
  }

  async function signUp(email: string, password: string) {
    await createUserWithEmailAndPassword(auth, email, password);
  }

  async function signOut() {
    await firebaseSignOut(auth);
  }

  async function refreshProfile() {
    const user = auth.currentUser;
    if (!user) return;
    setState(await fetchProfileStatus(user));
  }

  return (
    <AuthContext.Provider value={{ state, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
