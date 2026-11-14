import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar, openProfile, useMyId } from '@/components/user-row';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { timeAgo } from '@/utils/time';

type Comment = Schemas['Comment'];

/** Comments under one proof, newest first: /proof/comments?proof_id=…&title=… */
export default function CommentsScreen() {
  const colors = useTheme();
  const myId = useMyId();
  const { proof_id, title } = useLocalSearchParams<{ proof_id: string; title?: string }>();
  const [comments, setComments] = useState<Comment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchPage = useCallback(
    async (nextCursor?: string) => {
      const { data } = await api.GET('/v1/proofs/{proof_id}/comments', {
        params: { path: { proof_id }, query: { limit: 30, cursor: nextCursor } },
      });
      return data;
    },
    [proof_id],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage().then((data) => {
      if (cancelled) return;
      setComments(data?.items ?? []);
      setCursor(data?.next_cursor ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const data = await fetchPage(cursor);
    setComments((prev) => [...prev, ...(data?.items ?? [])]);
    setCursor(data?.next_cursor ?? null);
    setLoadingMore(false);
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const { data } = await api.POST('/v1/proofs/{proof_id}/comments', {
      params: { path: { proof_id } },
      body: { body },
    });
    if (data) {
      setComments((prev) => [data, ...prev]);
      setText('');
    } else {
      Alert.alert('Could not post your comment', 'Try again.');
    }
    setSending(false);
  }

  function showActions(comment: Comment) {
    if (comment.can_delete) {
      Alert.alert('Delete this comment?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { response } = await api.DELETE('/v1/comments/{comment_id}', {
              params: { path: { comment_id: comment.id } },
            });
            if (response.ok) setComments((prev) => prev.filter((c) => c.id !== comment.id));
            else Alert.alert('Could not delete it', 'Try again.');
          },
        },
      ]);
    } else {
      Alert.alert('Report this comment?', 'We review every report.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            const { error } = await api.POST('/v1/reports', {
              body: { target_type: 'comment', target_id: comment.id, reason: 'Reported from the app' },
            });
            Alert.alert(error ? 'Could not send the report' : 'Thanks, we will take a look.');
          },
        },
      ]);
    }
  }

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title: title ?? 'Comments' }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}>
        <FlatList
          data={comments}
          keyExtractor={(comment) => comment.id}
          style={styles.flex}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <Pressable style={styles.comment} onLongPress={() => showActions(item)}>
              <Pressable onPress={() => openProfile(item.user.id, myId)}>
                <Avatar name={item.user.display_name} size={32} />
              </Pressable>
              <View style={styles.commentText}>
                <View style={styles.commentHeader}>
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.commentName}>
                    {item.user.display_name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
                    {timeAgo(item.created_at)}
                  </ThemedText>
                  <Pressable
                    hitSlop={8}
                    onPress={() => showActions(item)}
                    accessibilityLabel={item.can_delete ? 'Delete comment' : 'Report comment'}>
                    <ThemedText type="small" themeColor="textSecondary">
                      ···
                    </ThemedText>
                  </Pressable>
                </View>
                <ThemedText type="small">{item.body}</ThemedText>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                No comments yet. Say something nice!
              </ThemedText>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />
            ) : undefined
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
        />
        <SafeAreaView edges={['bottom']}>
          <View
            style={[
              styles.inputRow,
              { backgroundColor: colors.background, borderTopColor: colors.backgroundElement },
            ]}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text }]}
              placeholder="Add a comment…"
              placeholderTextColor={colors.textSecondary}
              value={text}
              onChangeText={setText}
              onSubmitEditing={send}
              returnKeyType="send"
              submitBehavior="submit"
              maxLength={500}
            />
            <Pressable
              style={[styles.sendBtn, { backgroundColor: colors.text, opacity: text.trim() ? 1 : 0.35 }]}
              onPress={send}
              disabled={!text.trim() || sending}
              accessibilityLabel="Post comment">
              {sending ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <ThemedText style={{ color: colors.background, fontWeight: '700', fontSize: 18 }}>↑</ThemedText>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  list: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
  },
  separator: { height: Spacing.three },
  comment: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  commentText: { flex: 1, gap: 2 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  commentName: { flexShrink: 1 },
  time: { fontSize: 12, flex: 1 },
  spinner: { marginVertical: Spacing.four },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
