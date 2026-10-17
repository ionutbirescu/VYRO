import createClient, { type Middleware } from 'openapi-fetch';

import { API_URL, DEV_UID } from '@/config';

import type { components, paths } from './schema';

/** Request and response bodies from the API contract, e.g. `Schemas['ChallengeSummary']`. */
export type Schemas = components['schemas'];

type TokenProvider = () => Promise<string | null | undefined>;

let getToken: TokenProvider = async () => (DEV_UID ? `dev:${DEV_UID}` : null);

/**
 * Supplies the bearer token for every request. Call it once Firebase sign-in is set up:
 * `setTokenProvider(() => auth.currentUser?.getIdToken() ?? Promise.resolve(null))`
 */
export function setTokenProvider(provider: TokenProvider) {
  getToken = provider;
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = await getToken();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    return request;
  },
};

/**
 * Typed API client generated from contract/openapi.json. Paths, parameters and bodies are
 * checked at compile time:
 *
 *   const { data, error } = await api.GET('/v1/challenges/{challenge_id}', {
 *     params: { path: { challenge_id: id } },
 *   });
 */
export const api = createClient<paths>({ baseUrl: API_URL });
api.use(authMiddleware);
