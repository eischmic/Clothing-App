// lib/backend.ts — typed client for the FastAPI/FashionCLIP service.
// Hard constraint: zero React / React Native / Expo imports.
//
// Every function follows lib/api.ts's contract: it NEVER throws and NEVER
// rejects. A network failure, a non-2xx status, or a malformed body all become
// `degraded: true` with an empty payload, because the app is required to keep
// working with the seeded catalogue when the backend is unreachable.

const TIMEOUT_MS = 20_000;

export interface BackendProfileItem {
  article_id: string;
  name: string | null;
  product_type: string | null;
  colour: string | null;
  description: string | null;
  image_url: string;
  buy_url: string;
  category: string;
  colour_family: string;
  formality: number;
  seasons: string[];
  vector: number[];
}

export interface BackendReference {
  ref_id: string;
  image_url: string;
}

export interface BackendProfileOut {
  profile_id: string;
  name: string;
  n_refs: number;
  references: BackendReference[];
}

export interface BackendProfileDetail {
  profile_id: string;
  name: string;
  n_refs: number;
  n_swipes: number;
  n_liked: number;
  style_breakdown: Record<string, number>;
  vector: number[];
}

/** Trailing slash stripped so callers can always write `${base}/path`. */
export function backendBaseUrl(): string | null {
  const raw = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

export function backendEnabled(): boolean {
  return backendBaseUrl() !== null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  const base = backendBaseUrl();
  // Unset URL means no fetch is issued at all — not a failed fetch.
  if (base === null) return null;
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Turns a data URI or a local file URI into a Blob for multipart upload. */
async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  // Without this check an expired picker URI that now 403s yields a perfectly
  // valid near-empty Blob, and we upload that as the user's reference photo.
  // The throw is caught by createProfile's try/catch and surfaces as degraded.
  if (!response.ok) throw new Error(`could not read ${uri}: ${response.status}`);
  return response.blob();
}

export async function createProfile(
  name: string,
  uris: string[],
): Promise<{ profile: BackendProfileOut | null; degraded: boolean }> {
  if (!backendEnabled() || uris.length === 0) {
    return { profile: null, degraded: !backendEnabled() };
  }
  try {
    const form = new FormData();
    form.append('name', name);
    for (let i = 0; i < uris.length; i++) {
      const blob = await uriToBlob(uris[i]);
      form.append('files', blob, `photo-${i}.jpg`);
    }
    // No content-type header: the runtime sets the multipart boundary.
    const profile = await request<BackendProfileOut>('/profiles', {
      method: 'POST',
      body: form,
    });
    return profile ? { profile, degraded: false } : { profile: null, degraded: true };
  } catch {
    return { profile: null, degraded: true };
  }
}

export async function getProfile(
  profileId: string,
): Promise<{ detail: BackendProfileDetail | null; degraded: boolean }> {
  const detail = await request<BackendProfileDetail>(`/profiles/${profileId}`);
  return detail ? { detail, degraded: false } : { detail: null, degraded: true };
}

export async function getNext(
  profileId: string,
  n: number,
): Promise<{ items: BackendProfileItem[]; degraded: boolean }> {
  const data = await request<{ items: BackendProfileItem[] }>(
    `/profiles/${profileId}/next?n=${n}`,
  );
  return Array.isArray(data?.items)
    ? { items: data.items, degraded: false }
    : { items: [], degraded: true };
}

export async function swipe(
  profileId: string,
  articleId: string,
  liked: boolean,
): Promise<{ degraded: boolean }> {
  const data = await request<{ n_swipes: number }>(`/profiles/${profileId}/swipe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ article_id: articleId, liked }),
  });
  return { degraded: data === null };
}

export async function getCatalogItem(
  articleId: string,
): Promise<{ item: BackendProfileItem | null; degraded: boolean }> {
  const item = await request<BackendProfileItem>(`/catalog/${articleId}`);
  return item ? { item, degraded: false } : { item: null, degraded: true };
}
