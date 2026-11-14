import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Schemas } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

/** A round initial, until profiles have photos. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.backgroundSelected },
      ]}>
      <ThemedText style={{ fontSize: size * 0.42, lineHeight: size * 0.6, fontWeight: '700' }}>
        {name.charAt(0).toUpperCase()}
      </ThemedText>
    </View>
  );
}

/** The current user's id, or null before sign-in. */
export function useMyId(): string | null {
  const { state } = useAuth();
  return state.status === 'ready' ? state.profile.id : null;
}

/** Opens someone's profile; your own is the Profile tab. */
export function openProfile(userId: string, myId: string | null) {
  if (userId === myId) router.navigate('/profile');
  else router.push(`/user/${userId}`);
}

export function UserRow({ user, right }: { user: Schemas['UserSummary']; right?: ReactNode }) {
  const colors = useTheme();
  const myId = useMyId();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={() => openProfile(user.id, myId)}>
      <Avatar name={user.display_name} />
      <View style={styles.text}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {user.display_name}
          {user.id === myId ? ' (you)' : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          @{user.username} · Level {user.level}
        </ThemedText>
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
  },
  text: { flex: 1, gap: 2 },
});
