import { useEffect, useState } from 'react';

import { api } from '@/api/client';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';
import { API_URL } from '@/config';

type ApiStatus =
  | { state: 'checking' }
  | { state: 'ok'; version: string }
  | { state: 'error'; message: string };

export default function HomeScreen() {
  const [status, setStatus] = useState<ApiStatus>({ state: 'checking' });

  // Confirms the app can reach the API configured in .env.
  useEffect(() => {
    api.GET('/health').then(
      ({ data }) =>
        setStatus(
          data
            ? { state: 'ok', version: data.version }
            : { state: 'error', message: 'Unexpected response' },
        ),
      (error: unknown) => setStatus({ state: 'error', message: String(error) }),
    );
  }, []);

  return (
    <PlaceholderScreen title="VYRO">
      <ThemedText>Don&apos;t just scroll. Challenge yourself.</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {status.state === 'checking' && `Connecting to ${API_URL}…`}
        {status.state === 'ok' && `API ${status.version} at ${API_URL}`}
        {status.state === 'error' && `Can't reach ${API_URL}: ${status.message}`}
      </ThemedText>
    </PlaceholderScreen>
  );
}
