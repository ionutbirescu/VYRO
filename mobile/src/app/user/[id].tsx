import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColor, BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const colors = useTheme();

  const [profile, setProfile] = useState<Schemas['UserProfile'] | null>(null);
  const [followStatus, setFollowStatus] = useState<Schemas['FollowStatus'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);

  const myId = state.status === 'ready' ? state.profile.id : null;
  const isOwnProfile = myId === id;

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.GET('/v1/users/{user_id}', { params: { path: { user_id: id } } }),
      api.GET('/v1/users/{user_id}/followers', {
        params: { path: { user_id: id }, query: { limit: 50 } },
      }),
    ]).then(([{ data: prof }, { data: followers }]) => {
      setProfile(prof ?? null);
      if (prof && myId && !isOwnProfile) {
        const following = followers?.items.some((u) => u.id === myId) ?? false;
        setFollowStatus({
          user_id: id,
          following,
          followed_by: false,
          is_friend: false,
        });
      }
      setLoading(false);
    });
  }, [id, myId, isOwnProfile]);

  async function handleFollow() {
    if (!id || followLoading) return;
    setFollowLoading(true);
    const isFollowing = followStatus?.following ?? false;
    const { data, error } = isFollowing
      ? await api.DELETE('/v1/users/{user_id}/follow', { params: { path: { user_id: id } } })
      : await api.PUT('/v1/users/{user_id}/follow', { params: { path: { user_id: id } } });
    if (error) {
      Alert.alert('Error', 'Could not update follow status. Try again.');
    } else if (data) {
      setFollowStatus(data);
      setProfile((p) =>
        p
          ? {
              ...p,
              followers_count: p.followers_count + (data.following ? 1 : -1),
            }
          : p
      );
    }
    setFollowLoading(false);
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={AccentColor} />
      </ThemedView>
    );
  }

  if (!profile) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary">User not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe}>
        {/* Back button */}
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}>

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatar, { backgroundColor: colors.backgroundElement }]}>
              <ThemedText style={styles.avatarLetter}>
                {profile.display_name[0].toUpperCase()}
              </ThemedText>
            </View>
            <ThemedText type="subtitle" style={styles.displayName}>
              {profile.display_name}
            </ThemedText>
            <ThemedText themeColor="textSecondary">@{profile.username}</ThemedText>
            {profile.bio ? (
              <ThemedText themeColor="textSecondary" style={styles.bio}>
                {profile.bio}
              </ThemedText>
            ) : null}
          </View>

          {/* Follow button */}
          {!isOwnProfile && followStatus !== null && (
            <Pressable
              style={[
                styles.followBtn,
                followStatus.following
                  ? { borderColor: colors.backgroundSelected, borderWidth: 1 }
                  : { backgroundColor: AccentColor },
              ]}
              onPress={handleFollow}
              disabled={followLoading}>
              {followLoading ? (
                <ActivityIndicator size="small" color={followStatus.following ? colors.text : '#fff'} />
              ) : (
                <ThemedText
                  style={[
                    styles.followBtnText,
                    { color: followStatus.following ? colors.text : '#fff' },
                  ]}>
                  {followStatus.is_friend
                    ? 'Friends'
                    : followStatus.following
                    ? 'Following'
                    : 'Follow'}
                </ThemedText>
              )}
            </Pressable>
          )}

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatItem value={profile.followers_count} label="followers" />
            <View style={[styles.divider, { backgroundColor: colors.backgroundSelected }]} />
            <StatItem value={profile.following_count} label="following" />
            <View style={[styles.divider, { backgroundColor: colors.backgroundSelected }]} />
            <StatItem value={profile.completed_challenges} label="completed" />
          </View>

          {/* Level + XP */}
          <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            <View style={styles.row}>
              <ThemedText type="smallBold">Level {profile.level}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {profile.xp.toLocaleString()} XP
              </ThemedText>
            </View>
            <View style={styles.streakRow}>
              <Ionicons name="flame" size={15} color="#f97316" />
              <ThemedText type="small">
                {profile.current_streak} day streak
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ marginLeft: Spacing.two }}>
                · longest {profile.longest_streak}
              </ThemedText>
            </View>
          </View>

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statItem}>
      <ThemedText type="subtitle">{value.toLocaleString()}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignSelf: 'flex-start',
  },
  scroll: {
    alignItems: 'center',
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  avatarSection: {
    alignItems: 'center',
    paddingTop: Spacing.three,
    gap: Spacing.one,
    width: '100%',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  avatarLetter: { fontSize: 32, fontWeight: '700' },
  displayName: { textAlign: 'center' },
  bio: { textAlign: 'center', paddingHorizontal: Spacing.four },
  followBtn: {
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 120,
  },
  followBtnText: { fontWeight: '600', fontSize: 15 },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    width: '100%',
  },
  statItem: { alignItems: 'center', gap: 2 },
  divider: { width: 1, height: 32 },
  card: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
    width: '100%',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
