import { Link } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';

export default function ExploreScreen() {
  return (
    <PlaceholderScreen title="Explore">
      <Link href="/challenge/demo">
        <ThemedText type="linkPrimary">Open a sample challenge</ThemedText>
      </Link>
    </PlaceholderScreen>
  );
}
