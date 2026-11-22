import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, Alert } from 'react-native';

import { api } from '@/api/client';
import type { Schemas } from '@/api/client';
import { InterFonts, UI } from '@/constants/theme';

type Props = {
  offer: Schemas['RescueOffer'];
  // Called after the user answers, so Home can hide the card and refresh what changed.
  onAnswered: () => void;
};

function showError(message: string) {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert('Something went wrong', message);
}

/** The streak rescue coach's suggestion for today, shown on Home until answered. */
export function RescueCard({ offer, onAnswered }: Props) {
  const [busy, setBusy] = useState<'accept' | 'dismiss' | null>(null);

  async function answer(kind: 'accept' | 'dismiss') {
    setBusy(kind);
    const path =
      kind === 'accept'
        ? '/v1/coach/rescue/{intervention_id}/accept'
        : '/v1/coach/rescue/{intervention_id}/dismiss';
    const { error } = await api.POST(path, {
      params: { path: { intervention_id: offer.id } },
    });
    setBusy(null);
    if (error) {
      showError('detail' in error && typeof error.detail === 'string' ? error.detail : 'Try again in a moment.');
      return;
    }
    onAnswered();
    if (kind === 'accept' && offer.challenge_id) router.push(`/challenge/${offer.challenge_id}`);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>From your coach</Text>
      <Text style={styles.message}>{offer.message}</Text>

      {offer.lighter_task && (
        <View style={styles.swap}>
          <Text style={styles.swapLabel}>Today instead</Text>
          <Text style={styles.swapTitle}>{offer.lighter_task.title}</Text>
          <Text style={styles.swapBody}>{offer.lighter_task.instructions}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          onPress={() => answer('accept')}
          disabled={busy !== null}
          style={({ pressed }) => [styles.accept, pressed && styles.pressed]}>
          {busy === 'accept' ? (
            <ActivityIndicator color={UI.text} size="small" />
          ) : (
            <Text style={styles.acceptText}>{offer.accept_label}</Text>
          )}
        </Pressable>
        <Pressable onPress={() => answer('dismiss')} disabled={busy !== null} hitSlop={8} style={styles.dismiss}>
          <Text style={styles.dismissText}>{busy === 'dismiss' ? '…' : 'Not today'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: UI.surface,
    borderLeftWidth: 3,
    borderLeftColor: UI.accent,
    gap: 10,
  },
  label: { fontFamily: InterFonts.medium, fontSize: 13, color: UI.muted },
  message: { fontFamily: InterFonts.regular, fontSize: 16, lineHeight: 23, color: UI.text },
  swap: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: UI.line,
    gap: 2,
  },
  swapLabel: { fontFamily: InterFonts.regular, fontSize: 13, color: UI.faint },
  swapTitle: { fontFamily: InterFonts.semiBold, fontSize: 15, color: UI.text },
  swapBody: { fontFamily: InterFonts.regular, fontSize: 14, lineHeight: 20, color: UI.muted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  accept: {
    minWidth: 120,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: UI.accent,
  },
  pressed: { opacity: 0.85 },
  acceptText: { fontFamily: InterFonts.semiBold, fontSize: 14, color: UI.text },
  dismiss: { paddingVertical: 10 },
  dismissText: { fontFamily: InterFonts.medium, fontSize: 14, color: UI.muted },
});
