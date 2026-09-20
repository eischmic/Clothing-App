# FashionCLIP backend integration — design

Date: 2026-09-20
Status: approved, ready for planning

Wires the FitLab Expo client to the FastAPI/FashionCLIP backend in `Backend/`, so
that onboarding creates a persisted style profile from real photos, the Explore
deck shows real H&M garments, and swipes write back and re-rank.

---

## 1. Starting position

### Frontend

- Expo 57, expo-router, zustand + AsyncStorage, persist `version: 2`.
- `lib/` is a pure, tested engine: `vector.ts`, `scoring.ts`, `compatibility.ts`,
  `outfits.ts`, `deck.ts`, `gaps.ts`. Zero React imports, zero network.
- Onboarding: inspo photos → `lib/api.ts:analyzeInspiration` → `/api/analyze`
  (Expo API route → Claude vision) → `ImageAttributes[]` → `buildStyleProfile`
  → `StyleProfile` with a **9-dimension** `StyleVector`.
- `ProductProvider` (`lib/catalog/provider.ts`) exists but **nothing consumes it.**
  `ExplorePane`, `ClosetPane`, `ProfilePane` and `app/product/[id].tsx` import the
  synchronous static array `ALL_PRODUCTS` from `lib/catalog/seeded.ts` directly.
- Every network call degrades without throwing (`degraded: true`). That contract holds.

### Backend

- FastAPI + `patrickjohncyh/fashion-clip`, `index/embeddings.npy` (20,000 × 512,
  L2-normalised) + `index/catalog.parquet`, 20,000 thumbnails under `thumbs/`.
- **Two parallel contracts.** `/sessions/*` is in-memory and ephemeral.
  `/profiles/*` is SQLite-backed (`db.py`) and persists profiles, reference-photo
  files + embeddings, and swipes. `/profiles` is strictly better and is the one
  we target; `/sessions` is deleted.
- `StyleEngine.build_profile` is a normalised mean at `k=1`; `feedback_update` is
  Rocchio; `recommend` is cosine + MMR over a 200-item pool.

### Corrections to the originating brief

The brief that prompted this work was read from an older tree and disagrees with
what is on disk in six places. All six are resolved in favour of the disk:

1. Sessions are **not** un-persisted — `db.py` and the whole `/profiles` surface
   already exist, with tests.
2. `StyleVector` is **9** dimensions (`minimalism, streetwear, workwear, outdoor,
   vintage, formal, colorfulness, pattern, relaxedFit`), not 10, and does **not**
   map 1:1 onto the backend's 10 `STYLE_AXES` (`minimalist, streetwear, vintage,
   preppy, bohemian, athleisure, elegant formal, casual everyday, edgy punk,
   romantic feminine`). Only three overlap. We never map between them — see §3.
3. The `ProductProvider` seam is unused; converting the four `ALL_PRODUCTS`
   call-sites is the bulk of the client work, not writing the provider.
4. Missing `Product` fields are not just price/formality/seasons — also
   `category`, `colorFamily`, `description`, `url`, and the 9-dim `vector`.
5. `requirements-api.txt` is committed and `__pycache__` is not in git.
6. `app/onboarding/index.tsx` asks for **3–8** photos; `POST /profiles` requires
   **5–15**. A user following the UI's own instructions gets a 400.

This design also honours the 2026-09-19 decision recorded in
`docs/superpowers/specs/2026-09-19-fitlab-design.md` and project memory:
FashionCLIP is a **retrieval and vector stage feeding** the interpretable 9-dim
ranker. It does not replace the Claude structured-attribute stage.

---

## 2. Decisions

| # | Decision |
|---|---|
| D1 | Target the persistent `/profiles` contract. Delete `/sessions` entirely. |
| D2 | Garment style vectors come from **contrastive text-axis projection** of FashionCLIP embeddings, precomputed offline. |
| D3 | `category`, `colorFamily`, `formality` come from **deterministic metadata lookup**, not CLIP. |
| D4 | **`price` is removed from the product model entirely.** |
| D5 | `seasons` are keyword-derived from `detail_desc` + `product_type_name`. |
| D6 | `MIN_PROFILE_PHOTOS` drops 5 → 3 to match the UI. |
| D7 | The profile vector is a **decaying blend**: CLIP projection displaces the questionnaire as evidence accumulates. |
| D8 | Axis scores are **percentile-normalised against the catalog distribution**. |
| D9 | Resolved products are **persisted client-side**; ids alone are insufficient state against a remote catalog. |

---

## 3. Style vectors (D2, D8)

### Why not map the backend's 10 axes onto the frontend's 9

They are different spaces. `preppy`, `bohemian`, `romantic feminine` have no
frontend home; `colorfulness`, `pattern`, `relaxedFit` have no backend axis.
Instead, both products and profiles are projected directly into the **frontend's
9-dim space** using the same prompt set, so they are mutually comparable by
construction and `scoring.ts` needs no changes.

The backend's existing 10-axis `style_breakdown` is retained **for display copy
only** and never feeds ranking.

### Contrastive prompt pairs

One positive and one negative prompt per frontend dimension:

| Dimension | Positive | Negative |
|---|---|---|
| `minimalism` | a plain minimal understated garment | an ornate decorative embellished garment |
| `streetwear` | a streetwear urban garment | a classic conservative tailored garment |
| `workwear` | a rugged utilitarian workwear garment with pockets | a delicate refined dressy garment |
| `outdoor` | a technical outdoor hiking garment | an indoor city garment |
| `vintage` | a vintage retro garment | a modern contemporary garment |
| `formal` | a formal elegant evening garment | a casual everyday garment |
| `colorfulness` | a brightly coloured vivid saturated garment | a muted neutral monochrome garment |
| `pattern` | a patterned printed graphic garment | a plain solid colour garment |
| `relaxedFit` | a loose oversized relaxed fit garment | a fitted slim tailored garment |

Raw score for embedding `e` on axis `a`:

```
raw[a] = e · pos[a] − e · neg[a]
```

### Percentile normalisation

Raw CLIP margins are compressed and axis-biased: some prompts sit systematically
closer to the image-embedding centroid, so a raw top-3 would return nearly the
same three tags for every user. Because `StyleProfile.tags` is literally the
top-3 dimensions of the vector, that bias would be visible on the "This is your
style" reveal.

The build script therefore computes `raw[a]` for **all 20,000 catalog items**,
derives 101 quantile breakpoints per axis, and stores per-item scores as
percentile ranks in `[0,1]`. A profile vector is ranked at runtime by
interpolating against the same stored breakpoints. Result: each dimension means
"where you sit relative to the catalog", which is exactly what comparing
dimensions to each other assumes.

Stored: `index/axis_quantiles.npy`, shape `[9, 101]`, float32.

---

## 4. Derived categoricals (D3, D5)

Deterministic lookup, computed offline, no model involved.

### `category`

Driven by `product_type_name` first, with `product_group_name` as fallback:

- `Garment Upper body` → `top`, except
  - knit types (`Sweater`, `Cardigan`) → `knitwear`
  - outer types (`Jacket`, `Coat`, `Blazer`, `Outdoor jacket`) → `outerwear`
- `Garment Lower body` → `bottom`
- `Shoes` → `footwear`
- `Accessories`, `Bags` → `accessory`

**Excluded from the recommendable set:** `Garment Full body` (dresses,
jumpsuits), `Underwear`, `Underwear/nightwear`, `Nightwear`, `Swimwear`,
`Socks & Tights`, `Cosmetic`, `Furniture`, `Interior textile`, `Stationery`,
`Items`, `Fun`, `Garment and Shoe care`, `Unknown`.

`Bags` is **kept** and maps to `accessory`.

Rationale for excluding full-body garments: the outfit model in
`compatibility.ts`/`outfits.ts` has six slots and no dress slot. Filing a dress
under `top` would let the engine pair it with trousers. Adding a dress slot is a
larger change to the outfit graph and is out of scope here. This is a known
catalogue reduction, recorded so it is not mistaken for a bug.

### `colorFamily`

Lowercase `colour_group_name`, keyword-scan against the existing
`COLOR_TO_FAMILY` table in `lib/types.ts` (mirrored into Python as the single
source of the mapping's *values*). No match → `neutral`.

### `formality` (1–5)

Keyword table over `product_type_name`:

| Level | Types |
|---|---|
| 1 | sports/athletic types, leggings, sweatpants, track |
| 2 | t-shirt, jeans, sneakers, shorts, hoodie |
| 3 | shirt, chinos, sweater, cardigan, boots *(default)* |
| 4 | blazer, skirt, coat, heels, dress shirt |
| 5 | suit, tuxedo, evening |

### `seasons`

Keyword scan over `detail_desc` + `product_type_name`:

- `wool|padded|fleece|knit|thermal|quilted|down|faux fur|corduroy|flannel|cashmere|boot` → `fall, winter`
- `linen|shorts|swim|sleeveless|sandal|tank|lightweight|mesh|crochet` → `spring, summer`
- both matched, or neither → all four

---

## 5. Price removal (D4)

`price` is deleted from the product model rather than being faked. There is no
price column in `catalog.parquet` and no `transactions.csv` available; inventing
one would put fabricated numbers next to a `buy_url` that resolves to a live H&M
listing.

Removed:

- `Product.price`; `ProductQuery.minPrice` / `maxPrice` (unused today)
- `scoring.ts`: `priceScore()`, the `price` score component, `budgetCenter` args,
  and the `'Fits your budget well'` reason
- `SCORE_WEIGHTS` renormalised to **`{ style: 0.60, wardrobe: 0.25, occasion: 0.15 }`**
- `deck.ts`: `budgetCenter` from `DeckContext`, the `0.2 * priceScore(...)` term,
  and `outfitTotal()`
- `gaps.ts`: `budgetCenter` threading, plus the **dead `ALL_PRODUCTS` import**
- Price rendering in `ProductCard`, `GarmentSwipeCard`, `ClosetPane`,
  `app/product/[id].tsx`, and the `GarmentSwipeCard` accessibility label
- Price bands in `lib/catalog/archetypes.ts` and `lib/catalog/seeded.ts`
- `BUDGET_CENTER` constants in `ExplorePane` and `ClosetPane`

Two deliberate feature losses, accepted: the **saved-outfit total** under each fit
in `ClosetPane`, and one entry from the `reasons` array (cards show up to 3
reasons instead of 4).

This lands as **commit 0**, standalone, with the existing suite green before any
backend work begins.

---

## 6. Profile vector (D7)

The questionnaire is a **prior**, displaced by evidence — not a competitor and
not discarded.

```
vector = w · clipProjection + (1 − w) · questionnaireVector

w = n / (n + K),   K = 4,   n = n_refs + n_swipes

  3 photos,  0 swipes → w = 0.43
  8 photos,  0 swipes → w = 0.67
  8 photos, 20 swipes → w = 0.88
  backend down        → n = 0 → w = 0 → pure questionnaire
```

`n_refs` and `n_swipes` are already returned by `GET /profiles/{id}`; no backend
change is required to supply them.

Properties this buys:

- **Honest at the 3-photo floor.** A mean of 3 CLIP embeddings is noisy; the
  questionnaire genuinely is the better estimate there, and the formula says so.
- **Swipes move the radar chart.** Every Explore swipe increments `n`, migrating
  the profile from "what you said" toward "what you picked".
- **The degraded path is the formula's natural endpoint**, not a special case.

`K` is a single named, documented constant, tunable after seeing real projections.

Claude's `ImageAttributes` keep their existing responsibilities, which have no
CLIP equivalent: `dominantColors`, `silhouettes`, `materials`, `influences`, and
`deriveVibe()` — which drives app-wide theming.

**The questionnaire's only job is this prior.** `targetFormality` stays hardcoded
at `3`; wiring the `formalCasual` slider into it was considered and explicitly
not adopted. `app/onboarding/personality.tsx` is unchanged.

---

## 7. Backend changes

### New: `Backend/axes.py`

Pure data and math, no model import: the 9 prompt pairs, `project(embeddings,
text_vectors) -> [n, 9]`, `quantile_breakpoints(raw) -> [9, 101]`, and
`percentile_rank(raw, breakpoints)`. Unit-testable with hand-built arrays.

### New: `Backend/build_style_index.py`

Offline, idempotent, run once and committed. Embeds the 18 prompts, projects all
20,000 catalog vectors, computes and applies percentile ranks, derives the
categoricals of §4, filters excluded product groups, and writes:

- `index/style.parquet` — `article_id`, 9 axis columns, `category`,
  `colour_family`, `formality`, `seasons`
- `index/axis_quantiles.npy` — `[9, 101]` float32

A **sidecar**, so `catalog.parquet` remains the untouched raw import and a bad
run can never corrupt the source.

### `Backend/engine.py`

Left-joins `style.parquet` onto `self.catalog` at load, **preserving row order
and row count**. `embeddings.npy` is positionally aligned with `catalog.parquet`
and `recommend()` indexes `self.emb` by catalog row position, so excluded rows
must **never** be dropped — doing so would desynchronise the two and silently
return the wrong garments.

Exclusion is therefore a **boolean mask**: the join produces a
`recommendable: bool` column (false for excluded product groups and for any row
missing from the sidecar), and `recommend()` folds it into the mask it already
builds for `groups` and `exclude_ids`. The existing
`assert len(self.emb) == len(self.catalog)` stays valid and becomes a real guard
against a mis-built sidecar.

Adds `project_profile(vec) -> [9]` using the same prompts and breakpoints.

### `Backend/api.py`

| Change | Reason |
|---|---|
| `ProfileItem` gains `category`, `colour_family`, `formality`, `seasons`, `vector` | one response maps directly to a `Product` |
| `ProfileDetail` gains `vector` (9 floats) | the CLIP half of §6's blend |
| `POST /profiles` response gains `references: [{ref_id, image_url}]` | client replaces data URIs immediately |
| New `GET /catalog/{article_id} -> ProfileItem` | `app/product/[id].tsx` and `resolveProducts` need single-item lookup; 404 on unknown id |
| `MIN_PROFILE_PHOTOS` 5 → 3 | matches `app/onboarding/index.tsx` |
| **Delete** `SESSIONS`, `Session`, `_get_session`, `_new_session`, `_to_item`, `Item`, `SessionOut`, `RecsOut`, `ArticlesIn`, `FeedbackIn`, `FeedbackOut`, and all five `/sessions/*` endpoints | superseded by `/profiles`; nothing references them |

`GET /health`'s `sessions` field is replaced by `profiles`.

---

## 8. Client changes

### New: `lib/backend.ts`

`createProfile(name, uris)`, `getProfile(id)`, `getNext(id, n)`,
`swipe(id, articleId, liked)`, `getCatalogItem(id)`.

Base URL from `EXPO_PUBLIC_BACKEND_URL`. **Unset → every function returns
`{ degraded: true }` without issuing a fetch.** Never throws, 20s timeout via
`AbortSignal.timeout`, mirroring `lib/api.ts`.

### New: `lib/catalog/backendProvider.ts`

Implements `ProductProvider` over `/profiles/{id}/next`. Exports
`mapProfileItemToProduct` **separately** so the mapping is unit-testable against
a fixture with no network:

```
article_id      → id                 name           → name
(constant)      → brand: 'H&M'       image_url      → imageUri
buy_url         → url                description    → description
category        → category           colour_family  → colorFamily
formality       → formality          seasons        → seasons
vector (9)      → vector             colour         → color
```

`ProductProvider.all()` maps to `/profiles/{id}/next?n=100`. **`search(query)`
filters that pool client-side** — by `category` and `text` over
`name + brand + description`, matching `seededProvider.search`'s semantics minus
the removed price fields. No text-search endpoint is added: FashionCLIP could
serve one well via `embed_texts`, but **nothing in the app calls `search()`
today**, and building a retrieval path with no consumer is speculative. When a
search UI exists, `POST /profiles/{id}/search` is the natural home for it.

### New: `lib/catalog/index.ts`

The single module that selects the active provider. Nothing above
`lib/catalog/` imports `seeded.ts` or `backendProvider.ts` directly — the
enforcement the original design intended but never had.

### `lib/profile.ts`

`buildStyleProfile` accepts an optional `{ clipVector, nRefs, nSwipes }`. When
present it blends per §6 via the existing `blendVectors`. Absent → today's
behaviour. New pure helper `blendWithPrior(clip, questionnaire, nRefs, nSwipes)`.

### Store: catalog slice

`all()` and `/next` are not the same thing. `all()` returns a fixed set; `/next`
returns a ranked, profile-specific, exclusion-aware slice. Three call-sites need
products by arbitrary id that will never be in the current feed.

```ts
catalog: {
  feed:   Product[]                 // current ranked pool — NOT persisted
  byId:   Record<string, Product>   // every product ever resolved — PERSISTED
  status: 'idle' | 'loading' | 'ready' | 'degraded'
}

loadFeed(): Promise<void>            // /next?n=100 → feed, merged into byId
resolveProducts(ids: string[]): Promise<void>  // cache miss → GET /catalog/{id}
```

**Why `byId` must persist (D9):** the store today persists `wishlistIds` and
`savedOutfits.productIds` — ids only — because they resolve against an array
that ships in the bundle. Against a remote catalog, restarting while the backend
is down would empty the user's closet. Ids are no longer sufficient state.

`ProfileRecord` gains `backendProfileId: string | null`. Persist version
**2 → 3** with `migrateV2ToV3`: defaults `backendProfileId` to `null` and seeds
an empty catalog slice. Existing profiles continue on the seeded provider, which
is correct — they were never created on the backend.

### Call-site conversion

| Call-site | From | To |
|---|---|---|
| `ExplorePane:50` | `products: ALL_PRODUCTS` | `products: catalog.feed` |
| `ClosetPane:36` | module-level `PRODUCT_BY_ID` map | `useAppStore(s => s.catalog.byId)` |
| `ClosetPane:58` | `products: ALL_PRODUCTS` | `products: catalog.feed` |
| `ProfilePane:287` | `ALL_PRODUCTS.filter(...)` | `byId` lookup |
| `app/product/[id].tsx` | `ALL_PRODUCTS.find(...)` | `byId` lookup, `resolveProducts` on miss |
| `lib/gaps.ts:7` | dead import | deleted |

**No component becomes async.** Each reads store state that arrives when it
arrives — the pattern the app already uses for `hydrated`. `ExplorePane` and
`ClosetPane` already compute inside `useMemo` over reactive inputs, so they
re-derive correctly when the slice fills.

### Swipe write-back

`toggleWishlist` and `rejectProduct` each gain a fire-and-forget
`backend.swipe(profileId, articleId, liked)`; failures are swallowed so a lost
swipe never blocks the UI. The backend excludes swiped articles from subsequent
`/next` calls. When `feed.length < 8`, `loadFeed()` re-fetches.

### `app/onboarding/analyzing.tsx`

Calls `backend.createProfile` **in parallel** with `analyzeInspiration`. On
success: stores `backendProfileId`, blends the returned vector per §6, and
rewrites each `InspoImage.uri` from a data URI to
`{BACKEND}/references/{profile}/{ref}.jpg` — which is the AsyncStorage bloat fix,
falling out of work already being done rather than needing a separate `/uploads`
service. On failure: today's behaviour plus the existing "Analysed offline"
banner.

**Wardrobe photos keep their local URIs.** Embedding them is out of scope (§11).

---

## 9. Failure behaviour

Losing the backend degrades **quality, never function.**

| Failure | Behaviour | User sees |
|---|---|---|
| `EXPO_PUBLIC_BACKEND_URL` unset | seeded provider, no fetch issued | normal app, seeded catalogue |
| `POST /profiles` fails | `backendProfileId = null`, `w = 0` | existing "Analysed offline" banner |
| `/next` fails | `status: 'degraded'`, feed falls back to `ALL_PRODUCTS` | deck keeps working |
| `/catalog/{id}` miss | resolve from persisted `byId` | closet intact |
| `swipe` fails | swallowed; local `rejectedIds` still applies | nothing |
| Cold start, backend down | persisted `byId` serves closet, feed seeded | no empty states |

---

## 10. Testing

| Unit | Test |
|---|---|
| `axes.py` | hand-built arrays, no model. Projection monotone in cosine similarity; percentile ranks uniform across the catalog |
| `build_style_index.py` | categorical derivation tables against known `product_type_name` fixtures; excluded groups absent from output |
| `engine.py` / `api.py` | extend `test_api.py` / `test_db.py` using the existing `StyleEngine(load_model=False)` flag, so CI needs no torch |
| `mapProfileItemToProduct` | committed fixture JSON → expected `Product`. No network |
| `blendWithPrior` | `n=0` → questionnaire exactly; monotone in `n`; `n→∞` → clip |
| `migrateV2ToV3` | a v2 persisted blob round-trips with `backendProfileId: null` |
| Existing suite | stays green through commit 0 — the signal the price excision broke nothing |

---

## 11. Out of scope

Deferred to a follow-up spec, deliberately:

- **Wardrobe embedding + near-duplicate exclusion** (`POST /wardrobe/embed`,
  cosine > 0.9 against owned items). The "don't duplicate what you own" promise
  in onboarding remains served by the existing 9-dim `wardrobe` score component.
- **Ops**: CORS lock-down to the Expo dev origin, shared `X-Api-Key`, Dockerfile
  with build-time model download, git-lfs or release-asset hosting for the 40 MB
  `embeddings.npy`.
- **A dress/full-body slot** in the outfit graph (see §4).
- Auth, payments, checkout, feed, followers, scraping, try-on — the binding
  2026-09-19 cut list.

---

## 12. Risks

**Torch may not install (blocking, front-loaded).** This machine runs Python
3.14; PyTorch wheels currently top out at 3.13, so `pip install -r
requirements-api.txt` is expected to fail outright. Nothing in §7 can be verified
until resolved. **Mitigation: establish a pinned Python 3.12 venv for `Backend/`
as step 1a**, before any Python work.

**Prompt quality is unvalidated.** The 9 pairs in §3 are a first draft. Percentile
normalisation protects against axis bias but not against a prompt that measures
the wrong thing. First verification after commit 1: spot-check the top-10 and
bottom-10 catalog items per axis and confirm they look right.

**Catalogue reduction.** Excluding full-body garments and non-wearables removes a
material fraction of the 20,000 items. If the remaining pool is too thin for
`refillSlot` in some category, the fix is a dress slot (out of scope) or relaxing
the exclusions.

---

## 13. Build order

Each step is one commit and leaves the app working. Steps 0–5 are invisible to
the user; the app changes at step 6.

```
0   excise price                                   standalone, green tests, no backend
1a  pinned 3.12 venv for Backend/
1   axes.py + build_style_index.py + sidecar + engine join
2   api.py: new fields, /catalog/{id}, MIN_PHOTOS=3, delete /sessions
3   lib/backend.ts + mapper + backendProvider + catalog/index.ts
4   store: catalog slice + persist v3 migration
5   panes: 4 call-sites → store slice; drop gaps.ts dead import
6   analyzing.tsx: createProfile ∥ Claude, blend, rewrite URIs
7   swipe write-back + feed refill
```
