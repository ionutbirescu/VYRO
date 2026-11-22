import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { InterFonts, UI } from '@/constants/theme';

type Conversation = Schemas['CoachConversation'];

const STARTERS = [
  'How am I doing this week?',
  "I'm behind on a challenge. How do I catch up?",
  'Suggest something new for me',
];

export default function CoachScreen() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    api.GET('/v1/coach/conversations/latest').then(({ data }) => {
      setConversation(data ?? null);
      setLoading(false);
    });
  }, []);

  async function call(request: () => Promise<{ data?: Conversation; response: Response }>) {
    setSending(true);
    setFailure(null);
    const { data, response } = await request();
    setSending(false);
    setOptimistic(null);
    if (data) setConversation(data);
    else if (response.status === 429) setFailure("You've sent a lot today. Try again tomorrow.");
    else if (response.status === 503) setFailure("The coach isn't available on this server.");
    else setFailure('Something went wrong. Try again.');
  }

  function send(text: string) {
    const body = { text: text.trim() };
    if (!body.text || sending) return;
    setDraft('');
    setOptimistic(body.text);
    call(() =>
      conversation
        ? api.POST('/v1/coach/conversations/{conversation_id}/messages', {
            params: { path: { conversation_id: conversation.id } },
            body,
          })
        : api.POST('/v1/coach/conversations', { body }),
    );
  }

  function decide(approve: boolean) {
    if (!conversation) return;
    call(() =>
      api.POST('/v1/coach/conversations/{conversation_id}/decision', {
        params: { path: { conversation_id: conversation.id } },
        body: { approve },
      }),
    );
  }

  function retry() {
    if (!conversation) return;
    call(() =>
      api.POST('/v1/coach/conversations/{conversation_id}/retry', {
        params: { path: { conversation_id: conversation.id } },
      }),
    );
  }

  const messages = conversation?.messages ?? [];
  const error = failure ?? conversation?.error ?? null;
  const pending = conversation?.pending_action;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}>
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled">
          {loading ? (
            <ActivityIndicator color={UI.muted} style={{ marginTop: 40 }} />
          ) : messages.length === 0 && !optimistic ? (
            <View style={styles.intro}>
              <Text style={styles.introTitle}>Ask your coach</Text>
              <Text style={styles.introText}>
                It can see your challenges and progress, suggest what to do next, and join or
                create challenges for you after you say yes.
              </Text>
              <View style={styles.starters}>
                {STARTERS.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => send(s)}
                    style={({ pressed }) => [styles.starter, pressed && { backgroundColor: UI.surfaceHi }]}>
                    <Text style={styles.starterText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <>
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <View key={i} style={styles.userBubble}>
                    <Text style={styles.userText}>{m.text}</Text>
                  </View>
                ) : (
                  <View key={i} style={styles.coachBlock}>
                    {m.tools_used.length > 0 && (
                      <Text style={styles.tools}>{m.tools_used.join(' · ')}</Text>
                    )}
                    <Text style={styles.coachText}>{m.text}</Text>
                  </View>
                ),
              )}
              {optimistic && (
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{optimistic}</Text>
                </View>
              )}
            </>
          )}

          {sending && (
            <View style={styles.thinking}>
              <ActivityIndicator size="small" color={UI.muted} />
              <Text style={styles.thinkingText}>Thinking</Text>
            </View>
          )}

          {pending && !sending && (
            <View style={styles.approval}>
              <Text style={styles.approvalText}>{pending.question}</Text>
              <View style={styles.approvalRow}>
                <Pressable onPress={() => decide(false)} style={[styles.btn, styles.btnQuiet]}>
                  <Text style={styles.btnQuietText}>No</Text>
                </Pressable>
                <Pressable onPress={() => decide(true)} style={[styles.btn, styles.btnPrimary]}>
                  <Text style={styles.btnPrimaryText}>Yes</Text>
                </Pressable>
              </View>
            </View>
          )}

          {error && !sending && (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>{error}</Text>
              {conversation?.error && (
                <Pressable onPress={retry} hitSlop={8}>
                  <Text style={styles.retry}>Retry</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Message"
            placeholderTextColor={UI.faint}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
            onSubmitEditing={() => send(draft)}
            blurOnSubmit={false}
          />
          <Pressable
            onPress={() => send(draft)}
            disabled={!draft.trim() || sending}
            style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.35 }]}>
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
        {conversation && messages.length > 0 && (
          <Pressable
            onPress={() => setConversation(null)}
            style={styles.newChat}
            hitSlop={6}>
            <Text style={styles.newChatText}>New conversation</Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI.bg },
  list: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: 20, paddingBottom: 12, gap: 14 },
  intro: { paddingTop: 24 },
  introTitle: { fontFamily: InterFonts.bold, fontSize: 26, color: UI.text },
  introText: { fontFamily: InterFonts.regular, fontSize: 15, lineHeight: 22, color: UI.muted, marginTop: 8 },
  starters: { marginTop: 24, gap: 8 },
  starter: { paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: UI.surface },
  starterText: { fontFamily: InterFonts.regular, fontSize: 15, color: UI.text },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    backgroundColor: UI.surfaceHi,
  },
  userText: { fontFamily: InterFonts.regular, fontSize: 15, lineHeight: 21, color: UI.text },
  coachBlock: { maxWidth: '92%' },
  tools: { fontFamily: InterFonts.regular, fontSize: 12, color: UI.faint, marginBottom: 4 },
  coachText: { fontFamily: InterFonts.regular, fontSize: 15, lineHeight: 22, color: UI.text },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thinkingText: { fontFamily: InterFonts.regular, fontSize: 14, color: UI.muted },
  approval: { padding: 16, borderRadius: 14, backgroundColor: UI.surface },
  approvalText: { fontFamily: InterFonts.medium, fontSize: 15, lineHeight: 21, color: UI.text },
  approvalRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnQuiet: { backgroundColor: UI.surfaceHi },
  btnQuietText: { fontFamily: InterFonts.semiBold, fontSize: 15, color: UI.text },
  btnPrimary: { backgroundColor: UI.accent },
  btnPrimaryText: { fontFamily: InterFonts.semiBold, fontSize: 15, color: '#fff' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  errorText: { flex: 1, fontFamily: InterFonts.regular, fontSize: 14, color: '#FF8A8A' },
  retry: { fontFamily: InterFonts.semiBold, fontSize: 14, color: UI.text },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 22,
    backgroundColor: UI.surface,
    fontFamily: InterFonts.regular,
    fontSize: 16,
    color: UI.text,
    outlineStyle: 'none',
  } as object,
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI.accent,
  },
  newChat: { alignSelf: 'center', paddingBottom: 8 },
  newChatText: { fontFamily: InterFonts.regular, fontSize: 13, color: UI.faint },
});
