import { AppState } from 'react-native';

import { api, type Schemas } from './client';

type ClientEvent = Schemas['ClientEvent'];

// The API accepts at most 100 events per request.
const MAX_BATCH = 20;
const FLUSH_DELAY_MS = 5_000;

let queue: ClientEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Records an analytics event for the study metrics, e.g. `logEvent('challenge_viewed', { id })`.
 * Names are snake_case. Events are batched and sent in the background, and a batch that can't
 * be delivered is dropped: analytics must never break or slow down the app.
 */
export function logEvent(name: string, properties: ClientEvent['properties'] = {}) {
  queue.push({ name, properties, client_ts: new Date().toISOString() });
  if (queue.length >= MAX_BATCH) {
    void flushEvents();
  } else {
    flushTimer ??= setTimeout(() => void flushEvents(), FLUSH_DELAY_MS);
  }
}

export async function flushEvents() {
  clearTimeout(flushTimer);
  flushTimer = undefined;
  const events = queue;
  queue = [];
  if (events.length === 0) {
    return;
  }
  try {
    await api.POST('/v1/events', { body: { events } });
  } catch {
    // Offline or unreachable: drop the batch rather than retry forever.
  }
}

// Foreground events feed the retention metric; flush before the OS suspends the app.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    logEvent('app_foregrounded');
  } else {
    void flushEvents();
  }
});
