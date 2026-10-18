import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Phase =
  | { kind: 'pick' }
  | { kind: 'uploading'; label: string }
  | { kind: 'result'; submission: Schemas['ProofSubmission'] }
  | { kind: 'dispute'; submission: Schemas['ProofSubmission'] }
  | { kind: 'dispute_sent' };

const VERDICT_CONFIG = {
  pass: { icon: '✅', label: 'Approved!', color: '#22c55e' },
  fail: { icon: '❌', label: 'Not approved', color: '#ef4444' },
  unsure: { icon: '🤔', label: 'Uncertain', color: '#f59e0b' },
} as const;

export default function SubmitProofScreen() {
  const colors = useTheme();
  const params = useLocalSearchParams<{
    task_id: string;
    participation_id: string;
    task_title: string;
    proof_hint: string;
    challenge_id: string;
  }>();

  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [disputeReason, setDisputeReason] = useState('');

  async function pickImage(useCamera: boolean) {
    const fn = useCamera
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await fn({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (!result.canceled && result.assets.length > 0) {
      setImage(result.assets[0]);
    }
  }

  async function handleSubmit() {
    if (!image) return;

    const mimeType = (image.mimeType ?? 'image/jpeg') as
      | 'image/jpeg'
      | 'image/png'
      | 'image/webp';

    try {
      setPhase({ kind: 'uploading', label: 'Getting upload URL…' });

      const { data: urlData, error: urlError } = await api.POST('/v1/proofs/upload-url', {
        body: {
          participation_id: params.participation_id,
          task_id: params.task_id,
          content_type: mimeType,
        },
      });

      if (!urlData) throw new Error(String(urlError));

      setPhase({ kind: 'uploading', label: 'Uploading photo…' });

      const imageBlob = await fetch(image.uri).then((r) => r.blob());
      const uploadResp = await fetch(urlData.upload_url, {
        method: 'PUT',
        headers: urlData.headers,
        body: imageBlob,
      });

      if (!uploadResp.ok) throw new Error(`Upload failed: ${uploadResp.status}`);

      setPhase({ kind: 'uploading', label: 'Verifying with AI…' });

      const { data: submission, error: proofError } = await api.POST('/v1/proofs', {
        body: {
          participation_id: params.participation_id,
          task_id: params.task_id,
          object_path: urlData.object_path,
          caption: caption.trim() || undefined,
        },
      });

      if (!submission) throw new Error(String(proofError));

      // Poll if still pending (AI is slow)
      let finalSubmission = submission;
      if (submission.proof.status === 'pending') {
        finalSubmission = await pollUntilDone(submission.proof.id);
      }

      setPhase({ kind: 'result', submission: finalSubmission });
    } catch {
      setPhase({ kind: 'pick' });
      Alert.alert('Upload failed', 'Check your connection and try again.');
    }
  }

  async function pollUntilDone(proofId: string): Promise<Schemas['ProofSubmission']> {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const { data } = await api.GET('/v1/proofs/{proof_id}', {
        params: { path: { proof_id: proofId } },
      });
      if (data && data.status !== 'pending') {
        return { proof: data, rewards: null };
      }
    }
    throw new Error('Verification timed out');
  }

  async function handleDispute() {
    if (phase.kind !== 'dispute') return;
    if (!disputeReason.trim()) return;

    const { error } = await api.POST('/v1/proofs/{proof_id}/dispute', {
      params: { path: { proof_id: phase.submission.proof.id } },
      body: { reason: disputeReason.trim() },
    });

    if (error) {
      Alert.alert('Could not submit dispute', 'Try again later.');
    } else {
      setPhase({ kind: 'dispute_sent' });
    }
  }

  // --- Phases ---

  if (phase.kind === 'uploading') {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
        <ThemedText themeColor="textSecondary" style={styles.uploadLabel}>
          {phase.label}
        </ThemedText>
      </ThemedView>
    );
  }

  if (phase.kind === 'dispute_sent') {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText style={styles.bigIcon}>📋</ThemedText>
        <ThemedText type="subtitle">Dispute submitted</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.resultBody}>
          A human reviewer will look at your proof. You&apos;ll hear back shortly.
        </ThemedText>
        <Pressable
          style={[styles.btn, { backgroundColor: colors.text }]}
          onPress={() => router.back()}>
          <ThemedText style={{ color: colors.background, fontWeight: '600' }}>Done</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (phase.kind === 'result' || phase.kind === 'dispute') {
    const { submission } = phase;
    const verdict = submission.proof.ai_verdict ?? 'unsure';
    const cfg = VERDICT_CONFIG[verdict];
    const confidence = submission.proof.ai_confidence;
    const canDispute = verdict === 'fail' || verdict === 'unsure';

    return (
      <ThemedView style={styles.root}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

            <View style={styles.resultHeader}>
              <ThemedText style={styles.bigIcon}>{cfg.icon}</ThemedText>
              <ThemedText type="subtitle" style={{ color: cfg.color }}>{cfg.label}</ThemedText>
              {confidence !== null && confidence !== undefined && (
                <ThemedText type="small" themeColor="textSecondary">
                  AI confidence: {Math.round(confidence * 100)}%
                </ThemedText>
              )}
            </View>

            {submission.proof.ai_reason && (
              <View style={[styles.reasonCard, { backgroundColor: colors.backgroundElement }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {submission.proof.ai_reason}
                </ThemedText>
              </View>
            )}

            {verdict === 'pass' && submission.rewards && (
              <View style={[styles.rewardsCard, { backgroundColor: colors.backgroundElement }]}>
                <ThemedText type="smallBold">Rewards earned</ThemedText>
                <ThemedText style={{ color: cfg.color }}>+{submission.rewards.xp_awarded} XP</ThemedText>
                {submission.rewards.leveled_up && (
                  <ThemedText style={{ color: '#f59e0b' }}>
                    Level up! Now level {submission.rewards.level} 🎉
                  </ThemedText>
                )}
                {submission.rewards.challenge_completed && (
                  <ThemedText style={{ color: '#a855f7' }}>Challenge completed! 🏆</ThemedText>
                )}
                <ThemedText type="small" themeColor="textSecondary">
                  🔥 {submission.rewards.current_streak} day streak
                </ThemedText>
              </View>
            )}

            {phase.kind === 'dispute' && (
              <View style={styles.disputeForm}>
                <ThemedText type="smallBold" style={styles.disputeLabel}>
                  Why should this be approved?
                </ThemedText>
                <TextInput
                  style={[
                    styles.disputeInput,
                    { backgroundColor: colors.backgroundElement, color: colors.text },
                  ]}
                  placeholder="Explain why the AI verdict is wrong…"
                  placeholderTextColor={colors.textSecondary}
                  value={disputeReason}
                  onChangeText={setDisputeReason}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                />
                <Pressable
                  style={[styles.btn, { backgroundColor: colors.text, opacity: disputeReason.trim() ? 1 : 0.4 }]}
                  onPress={handleDispute}
                  disabled={!disputeReason.trim()}>
                  <ThemedText style={{ color: colors.background, fontWeight: '600' }}>
                    Submit dispute
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.btnOutline, { borderColor: colors.backgroundElement }]}
                  onPress={() => setPhase({ kind: 'result', submission })}>
                  <ThemedText type="small" themeColor="textSecondary">Cancel</ThemedText>
                </Pressable>
              </View>
            )}

            {phase.kind === 'result' && (
              <View style={styles.actions}>
                {canDispute && (
                  <Pressable
                    style={[styles.btnOutline, { borderColor: colors.text }]}
                    onPress={() => setPhase({ kind: 'dispute', submission })}>
                    <ThemedText style={{ color: colors.text, fontWeight: '600' }}>
                      Dispute result
                    </ThemedText>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.btn, { backgroundColor: colors.text }]}
                  onPress={() => router.back()}>
                  <ThemedText style={{ color: colors.background, fontWeight: '600' }}>Done</ThemedText>
                </Pressable>
              </View>
            )}

          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // Phase: pick
  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          <ThemedText type="subtitle">{params.task_title}</ThemedText>
          {params.proof_hint && (
            <View style={[styles.hintCard, { backgroundColor: colors.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary">
                💡 {params.proof_hint}
              </ThemedText>
            </View>
          )}

          {/* Image preview */}
          {image ? (
            <Pressable onPress={() => setImage(null)}>
              <Image source={{ uri: image.uri }} style={styles.preview} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.tapHint}>
                Tap to remove
              </ThemedText>
            </Pressable>
          ) : (
            <View style={[styles.placeholder, { backgroundColor: colors.backgroundElement }]}>
              <ThemedText style={styles.placeholderIcon}>📷</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">No photo selected</ThemedText>
            </View>
          )}

          {/* Picker buttons */}
          <View style={styles.pickerRow}>
            <Pressable
              style={[styles.pickerBtn, { backgroundColor: colors.backgroundElement, flex: 1 }]}
              onPress={() => pickImage(true)}>
              <ThemedText type="smallBold">📸 Camera</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.pickerBtn, { backgroundColor: colors.backgroundElement, flex: 1 }]}
              onPress={() => pickImage(false)}>
              <ThemedText type="smallBold">🖼️ Gallery</ThemedText>
            </Pressable>
          </View>

          {/* Caption */}
          <TextInput
            style={[styles.captionInput, { backgroundColor: colors.backgroundElement, color: colors.text }]}
            placeholder="Add a caption… (optional)"
            placeholderTextColor={colors.textSecondary}
            value={caption}
            onChangeText={setCaption}
            maxLength={280}
          />

          <Pressable
            style={[styles.btn, { backgroundColor: colors.text, opacity: image ? 1 : 0.4 }]}
            onPress={handleSubmit}
            disabled={!image}>
            <ThemedText style={{ color: colors.background, fontWeight: '600' }}>
              Submit proof
            </ThemedText>
          </Pressable>

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1, alignItems: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  scroll: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  uploadLabel: { marginTop: Spacing.two },
  hintCard: { borderRadius: 12, padding: Spacing.three },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16 },
  tapHint: { textAlign: 'center', marginTop: Spacing.one },
  placeholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  placeholderIcon: { fontSize: 40 },
  pickerRow: { flexDirection: 'row', gap: Spacing.two },
  pickerBtn: { borderRadius: 12, padding: Spacing.three, alignItems: 'center' },
  captionInput: { borderRadius: 12, padding: Spacing.three, fontSize: 16 },
  btn: { borderRadius: 12, padding: Spacing.three, alignItems: 'center' },
  btnOutline: { borderRadius: 12, padding: Spacing.three, alignItems: 'center', borderWidth: 1 },
  resultHeader: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three },
  bigIcon: { fontSize: 56 },
  resultBody: { textAlign: 'center', lineHeight: 22 },
  reasonCard: { borderRadius: 12, padding: Spacing.three },
  rewardsCard: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  actions: { gap: Spacing.two },
  disputeForm: { gap: Spacing.two },
  disputeLabel: { marginBottom: -Spacing.one },
  disputeInput: { borderRadius: 12, padding: Spacing.three, fontSize: 16, minHeight: 100, textAlignVertical: 'top' },
});
