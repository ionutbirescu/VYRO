import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Schemas } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { Avatar, openProfile, useMyId } from '@/components/user-row';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { timeAgo } from '@/utils/time';

/**
 * One completed day in a challenge. Photo, caption and comments come only for users who
 * joined it; the API leaves them out for everyone else.
 */
export function ActivityCard({
  item,
  canView,
}: {
  item: Schemas['ActivityItem'];
  canView: boolean;
}) {
  const colors = useTheme();
  const myId = useMyId();
  const name = item.user.id === myId ? 'You' : item.user.display_name;

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <Pressable style={styles.header} onPress={() => openProfile(item.user.id, myId)}>
        <Avatar name={item.user.display_name} size={36} />
        <View style={styles.headerText}>
          <ThemedText type="small" numberOfLines={2}>
            <ThemedText type="smallBold">{name}</ThemedText>
            {` completed Day ${item.day_number}: ${item.task_title}`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
            {timeAgo(item.completed_at)}
          </ThemedText>
        </View>
      </Pressable>

      {item.image_url && (
        <Image
          source={{ uri: item.image_url }}
          style={[styles.photo, { backgroundColor: colors.backgroundSelected }]}
          contentFit="cover"
          transition={150}
          accessibilityLabel={`${item.user.display_name}'s proof for day ${item.day_number}`}
        />
      )}
      {item.caption ? <ThemedText type="small">{item.caption}</ThemedText> : null}

      {canView && (
        <Pressable
          style={({ pressed }) => [styles.comments, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() =>
            router.push({
              pathname: '/proof/comments',
              params: { proof_id: item.proof_id, title: `${item.user.display_name} · Day ${item.day_number}` },
            })
          }>
          <Ionicons name="chatbubble-outline" size={15} color={colors.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            {item.comment_count === 0
              ? 'Comment'
              : `${item.comment_count} comment${item.comment_count === 1 ? '' : 's'}`}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  headerText: { flex: 1 },
  time: { fontSize: 12 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12 },
  comments: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
});
