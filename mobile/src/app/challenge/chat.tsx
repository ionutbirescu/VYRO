import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { db } from '@/lib/firebase';

type ChatMessage = {
  id: string;
  uid: string;
  display_name: string;
  text: string;
  created_at: Timestamp | null;
};

export default function ChatScreen() {
  const { challenge_id } = useLocalSearchParams<{ challenge_id: string }>();
  const { state } = useAuth();
  const colors = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const profile = state.status === 'ready' ? state.profile : null;

  useEffect(() => {
    if (!challenge_id) return;
    const q = query(
      collection(db, 'chats', challenge_id, 'messages'),
      orderBy('created_at', 'asc'),
    );
    return onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<ChatMessage, 'id'>) })),
      );
    });
  }, [challenge_id]);

  async function handleSend() {
    const msg = text.trim();
    if (!msg || !profile || sending) return;
    setText('');
    setSending(true);
    try {
      await addDoc(collection(db, 'chats', challenge_id, 'messages'), {
        uid: profile.id,
        display_name: profile.display_name,
        text: msg,
        created_at: serverTimestamp(),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <ThemedView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.flex}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isMe = item.uid === profile?.id;
            return (
              <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                {!isMe && (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.senderName}>
                    {item.display_name}
                  </ThemedText>
                )}
                <View
                  style={[
                    styles.bubbleInner,
                    { backgroundColor: isMe ? colors.text : colors.backgroundElement },
                  ]}>
                  <ThemedText
                    style={[
                      styles.msgText,
                      { color: isMe ? colors.background : colors.text },
                    ]}>
                    {item.text}
                  </ThemedText>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No messages yet. Say hi!
            </ThemedText>
          }
        />
        <SafeAreaView edges={['bottom']}>
          <View
            style={[
              styles.inputRow,
              { backgroundColor: colors.background, borderTopColor: colors.backgroundElement },
            ]}>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.backgroundElement, color: colors.text },
              ]}
              placeholder="Message…"
              placeholderTextColor={colors.textSecondary}
              value={text}
              onChangeText={setText}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              blurOnSubmit={false}
              maxLength={500}
            />
            <Pressable
              style={[
                styles.sendBtn,
                { backgroundColor: colors.text, opacity: text.trim() ? 1 : 0.35 },
              ]}
              onPress={handleSend}
              disabled={!text.trim() || sending}>
              <ThemedText style={{ color: colors.background, fontWeight: '700', fontSize: 18 }}>
                ↑
              </ThemedText>
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
  listContent: {
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  empty: { textAlign: 'center', marginTop: Spacing.six },
  bubble: { maxWidth: '80%' },
  bubbleMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  senderName: { marginBottom: 2, paddingLeft: Spacing.two },
  bubbleInner: {
    borderRadius: 18,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  msgText: { fontSize: 15, lineHeight: 20 },
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
