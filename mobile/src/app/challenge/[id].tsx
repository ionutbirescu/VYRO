import { useLocalSearchParams } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PlaceholderScreen title="Challenge">
      <ThemedText type="code">{id}</ThemedText>
    </PlaceholderScreen>
  );
}
