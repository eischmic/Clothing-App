# FashionCLIP Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the FitLab Expo client to the FastAPI/FashionCLIP backend in `Backend/` so onboarding creates a persisted style profile from real photos, the Explore deck shows real H&M garments, and swipes write back and re-rank.

**Architecture:** FashionCLIP is a *retrieval and vector stage feeding* the existing interpretable 9-dimension ranker — it does not replace it. Garment style vectors are produced offline by contrastive text-axis projection (one positive + one negative prompt per frontend dimension), percentile-normalised against the 20,000-item catalog distribution, and written to a **sidecar** `index/style.parquet` that is left-joined onto the untouched raw `catalog.parquet` at load time. On the client, a new `catalog` store slice holds a ranked `feed` (not persisted) and a `byId` cache of every product ever resolved (persisted), so a cold start with the backend down still renders the user's closet.

**Tech Stack:** Expo 57 / expo-router / React Native 0.86.3 / React 19.2.3 / TypeScript / zustand 5 + `persist` + AsyncStorage / jest-expo. Backend: Python 3.14 / FastAPI / `patrickjohncyh/fashion-clip` / numpy / pandas / pyarrow / SQLite / pytest.

**Design spec:** `docs/superpowers/specs/2026-09-20-fashionclip-backend-integration-design.md`. Every task below cites the spec sections it implements.

## Global Constraints

- **Repo root for all paths:** `/Users/achillesshui/VIBES/fit_builder/.claude/worktrees/affectionate-meitner-6d88ec`. All paths in this plan are relative to it.
- **`lib/` purity:** every file under `lib/` must have **zero** React, React Native, or Expo imports. `lib/types.ts` additionally has **zero imports of any kind**.
- **No `Math.random()`** anywhere in `lib/catalog/` — the catalogue must be deterministic.
- **Network calls never throw.** Every function in `lib/api.ts` and `lib/backend.ts` returns a result object with a `degraded: boolean` field. A caught error becomes `{ degraded: true }`, never a rejected promise.
- **`EXPO_PUBLIC_BACKEND_URL` unset → no fetch is issued at all.** Not a failed fetch — no fetch.
- **Network timeout is 20 s**, via `AbortSignal.timeout(20_000)`, mirroring `lib/api.ts`.
- **`embeddings.npy` is positionally aligned with `catalog.parquet`.** Never drop, reorder, or filter rows from `self.catalog` in `engine.py`. Exclusion is always a boolean mask.
- **`StyleVector` is 9 dimensions**, exactly: `minimalism, streetwear, workwear, outdoor, vintage, formal, colorfulness, pattern, relaxedFit`. The backend's separate 10-axis `STYLE_AXES` list is for display copy only and never feeds ranking. Never map between the two spaces.
- **All backend commands run through `Backend/.venv/bin/python`.** Never the system interpreter. No Python version pin — `torch 2.14.0` ships a `cp314-macosx_14_0_arm64` wheel, so the system 3.14 is fine.
- **Backend tests must run without torch.** Use the existing `StyleEngine(load_model=False)` flag and the `monkeypatch` stubs in `Backend/tests/test_api.py`.
- **Test commands:** frontend `npx jest <path>`; backend `cd Backend && .venv/bin/python -m pytest <path> -v`.
- **Commit after every task.** Each task leaves the app working.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `Backend/axes.py` | Prompt pairs, projection math, quantile breakpoints, percentile ranking. Pure numpy, no model import. |
| `Backend/derive.py` | Deterministic categorical derivation: category, colour family, formality, seasons, exclusion set. Pure strings, no model import. |
| `Backend/build_style_index.py` | Offline one-shot script: embeds prompts, projects the catalog, writes the sidecar. |
| `Backend/tests/test_axes.py` | Unit tests for `axes.py` with hand-built arrays. |
| `Backend/tests/test_derive.py` | Unit tests for `derive.py` against known `product_type_name` fixtures. |
| `Backend/tests/test_engine.py` | Engine tests against the real index with the model stubbed out. |
| `Backend/index/style.parquet` | Committed sidecar: one row per `catalog.parquet` row, same order, carrying the 9 axes plus the derived categoricals and the `recommendable` mask. |
| `Backend/index/axis_quantiles.npy` | Committed `[9, 101]` float32 percentile breakpoints for the catalog distribution. |
| `lib/backend.ts` | Typed, never-throwing HTTP client for the `/profiles` and `/catalog` surface. |
| `lib/catalog/backendMapper.ts` | Pure `ProfileItem → Product` mapping. Unit-testable, no network. |
| `lib/catalog/backendProvider.ts` | `ProductProvider` implemented over `/profiles/{id}/next`. |
| `lib/catalog/index.ts` | The single module that selects the active provider. |
| `__tests__/fixtures/profileItem.json` | Committed backend response fixture for the mapper test. |
| `__tests__/backendMapper.test.ts` | Mapper tests. |
| `__tests__/blendWithPrior.test.ts` | Decaying-prior blend tests. |
| `__tests__/stateMigrationV3.test.ts` | Persist v2 → v3 migration tests. |

**Modified:** `lib/types.ts`, `lib/scoring.ts`, `lib/deck.ts`, `lib/gaps.ts`, `lib/vector.ts`, `lib/profile.ts`, `lib/stateMigration.ts`, `lib/catalog/provider.ts`, `lib/catalog/seeded.ts`, `lib/catalog/archetypes.ts`, `store/useAppStore.ts`, `components/ProductCard.tsx`, `components/GarmentSwipeCard.tsx`, `components/panes/ExplorePane.tsx`, `components/panes/ClosetPane.tsx`, `components/panes/ProfilePane.tsx`, `app/product/[id].tsx`, `app/onboarding/analyzing.tsx`, `Backend/engine.py`, `Backend/api.py`, `Backend/tests/test_api.py`, and the existing frontend test suite.

---

## Task 1: Excise price from the product model

Implements spec §5 (D4). Standalone, no backend involvement. The whole existing suite must be green at the end — that is the signal the excision broke nothing.

**Files:**
- Modify: `lib/types.ts` (lines 33, 126)
- Modify: `lib/catalog/provider.ts` (lines 5-6)
- Modify: `lib/scoring.ts` (lines 60-68, 102-104, 129, 133, 140, 147, 181, 186, 204)
- Modify: `lib/deck.ts` (lines 5, 29, 39-41, 44)
- Modify: `lib/gaps.ts` (lines 4-7, 55, 138, 153)
- Modify: `lib/catalog/seeded.ts` (lines 11-31, 65-66, 75, 109-115)
- Modify: `lib/catalog/archetypes.ts` (line 13, the field declaration, plus all 40 `basePrice:` data entries)
- Modify: `components/ProductCard.tsx:37`
- Modify: `components/GarmentSwipeCard.tsx:128,134`
- Modify: `components/panes/ExplorePane.tsx:14,24,53,161`
- Modify: `components/panes/ClosetPane.tsx:59,333,360`
- Modify: `app/product/[id].tsx:2`
- Test: `__tests__/types.test.ts:33`, `__tests__/catalog.test.ts`, `__tests__/scoring.test.ts`, `__tests__/deck.test.ts`, `__tests__/gaps.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `SCORE_WEIGHTS = { style: 0.60, wardrobe: 0.25, occasion: 0.15 }`; `ScoreComponent = 'style' | 'wardrobe' | 'occasion'`; `Product` without `price`; `ScoreProductArgs` and `RankProductsArgs` without `budgetCenter`; `DeckContext` without `budgetCenter`; `AnalyzeGapsArgs` without `budgetCenter`; `priceScore` and `outfitTotal` deleted; `ProductQuery` without `minPrice`/`maxPrice`.

- [ ] **Step 1: Update the weights test to the new distribution**

In `__tests__/types.test.ts`, replace line 33:

```ts
      + SCORE_WEIGHTS.price + SCORE_WEIGHTS.occasion;
```

with:

```ts
      + SCORE_WEIGHTS.occasion;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx jest __tests__/types.test.ts`
Expected: FAIL — TypeScript reports `Property 'price' does not exist` is *not* yet the error; instead the sum is `0.5 + 0.2 + 0.15 = 0.85`, not `1`.

- [ ] **Step 3: Renormalise the weights and drop `Product.price`**

In `lib/types.ts`, replace line 33:

```ts
export const SCORE_WEIGHTS = { style: 0.5, wardrobe: 0.2, price: 0.15, occasion: 0.15 } as const;
```

with:

```ts
export const SCORE_WEIGHTS = { style: 0.60, wardrobe: 0.25, occasion: 0.15 } as const;
```

In the same file, delete line 126 from the `Product` interface:

```ts
  price: number;
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx jest __tests__/types.test.ts`
Expected: PASS

- [ ] **Step 5: Strip price from `lib/scoring.ts`**

Delete the whole `priceScore` function and its docblock (lines 60-68):

```ts
/**
 * Price match: Gaussian centred on the budget centre.
 * Formula: exp(-((price - center) / center)^2 / 0.5)
 */
export function priceScore(price: number, center: number): number {
  // A non-positive centre would divide by zero and poison `total` with NaN.
  if (center <= 0) return 0;
  return Math.exp(-Math.pow((price - center) / center, 2) / 0.5);
}
```

Delete the budget reason (lines 102-104):

```ts
  if (scores.price > 0.8) {
    reasons.push('Fits your budget well');
  }
```

Replace the `ScoreProductArgs` interface with:

```ts
export interface ScoreProductArgs {
  userVector: StyleVector;
  wardrobe: WardrobeItem[];
  inspoImages: InspoImage[];
  product: Product;
  targetFormality: number;
}
```

Replace the destructure and score block inside `scoreProduct` with:

```ts
  const { userVector, wardrobe, inspoImages, product, targetFormality } = args;

  const compatibleItems = wardrobe.filter((item) => areCompatible(item, product));

  const scores: Record<ScoreComponent, number> = {
    style:    styleScore(userVector, product),
    wardrobe: Math.min(1, compatibleItems.length / WARDROBE_SATURATION),
    occasion: occasionScore(product, targetFormality),
  };

  const total =
    SCORE_WEIGHTS.style    * scores.style +
    SCORE_WEIGHTS.wardrobe * scores.wardrobe +
    SCORE_WEIGHTS.occasion * scores.occasion;
```

Replace the `RankProductsArgs` interface with:

```ts
export interface RankProductsArgs {
  userVector: StyleVector;
  wardrobe: WardrobeItem[];
  inspoImages: InspoImage[];
  products: Product[];
  intentId: IntentId;
  limit: number;
}
```

Replace the destructure and the `scoreProduct` call inside `rankProducts` with:

```ts
  const { userVector, wardrobe, inspoImages, products, intentId, limit } = args;
```

```ts
  const scored = candidates.map((product) =>
    scoreProduct({
      userVector,
      wardrobe,
      inspoImages,
      product,
      targetFormality: intent.targetFormality,
    }),
  );
```

- [ ] **Step 6: Strip price from `lib/deck.ts`**

Replace the import on line 5:

```ts
import { priceScore, styleScore } from '@/lib/scoring';
```

with:

```ts
import { styleScore } from '@/lib/scoring';
```

Replace `DeckContext`:

```ts
export interface DeckContext {
  products: Product[];
  userVector: StyleVector;
  rejectedIds: string[];
}
```

Delete `outfitTotal` entirely:

```ts
export function outfitTotal(outfit: DeckOutfit): number {
  return outfitProducts(outfit).reduce((sum, p) => sum + p.price, 0);
}
```

Replace `rank`:

```ts
function rank(ctx: DeckContext, p: Product): number {
  return styleScore(ctx.userVector, p);
}
```

- [ ] **Step 7: Strip price from `lib/gaps.ts` and delete its dead import**

Delete line 7 entirely — `ALL_PRODUCTS` is imported but never referenced in this file:

```ts
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';
```

Replace `AnalyzeGapsArgs`:

```ts
export interface AnalyzeGapsArgs {
  wardrobe: WardrobeItem[];
  userVector: StyleVector;
  products: Product[];
}
```

In `attachSuggestion`, replace the destructure and the `scoreProduct` call:

```ts
  const { wardrobe, userVector, products } = args;
```

```ts
  const scored = candidates
    .map((product) =>
      scoreProduct({
        userVector,
        wardrobe,
        inspoImages: [],
        product,
        targetFormality: 2,
      }),
    )
```

- [ ] **Step 8: Strip price from `lib/catalog/provider.ts`**

Replace the whole file:

```ts
import type { Category, Product } from '@/lib/types';

export interface ProductQuery {
  category?: Category;
  text?: string;
}

export interface ProductProvider {
  all(): Promise<Product[]>;
  search(query: ProductQuery): Promise<Product[]>;
}
```

- [ ] **Step 9: Strip price from `lib/catalog/seeded.ts`**

Delete the offset helper, the band constants, and the clamp (lines 11-31):

```ts
// ---------------------------------------------------------------------------
// Deterministic price offset: derived from archetype id and colour string.
// Uses a simple character-code sum to stay fully deterministic.
// ---------------------------------------------------------------------------
function deterministicOffset(archetypeId: string, color: string): number {
  let hash = 0;
  const str = `${archetypeId}:${color}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffff;
  }
  // Offset in range [-15, +20] — spreads prices slightly without large swings.
  return (hash % 36) - 15;
}

/** Spec §9 fixes the catalogue's price band at $35–$320. */
export const MIN_PRICE = 35;
export const MAX_PRICE = 320;

function clampPrice(price: number): number {
  return Math.min(MAX_PRICE, Math.max(MIN_PRICE, price));
}
```

Inside `expandCatalogue`, delete lines 65-66:

```ts
      const priceOffset = deterministicOffset(arch.id, color);
      const price = clampPrice(arch.basePrice + priceOffset);
```

and delete `price,` from the pushed object literal (line 75).

In `seededProvider.search`, delete both price filters (lines 109-115):

```ts
    if (query.minPrice !== undefined) {
      results = results.filter((p) => p.price >= query.minPrice!);
    }

    if (query.maxPrice !== undefined) {
      results = results.filter((p) => p.price <= query.maxPrice!);
    }
```

- [ ] **Step 10: Strip `basePrice` from `lib/catalog/archetypes.ts`**

Delete line 13 from the archetype interface:

```ts
  basePrice: number;
```

Then delete all 40 `basePrice: <n>,` lines from the archetype literals (`grep -c basePrice lib/catalog/archetypes.ts` reports 41 before the edit — 40 entries plus the field declaration you just removed). Verify none remain:

Run: `npx tsc --noEmit 2>&1 | head -40`
Expected: no error mentioning `basePrice`. (Other errors from remaining call-sites are expected at this point and are fixed in the next steps.)

- [ ] **Step 11: Strip price rendering from the components**

`components/ProductCard.tsx:37` — replace:

```tsx
              {product.brand} · ${product.price}
```

with:

```tsx
              {product.brand}
```

`components/GarmentSwipeCard.tsx:128` — replace:

```tsx
              accessibilityLabel={`${product.name} by ${product.brand}, $${product.price}. Open details.`}
```

with:

```tsx
              accessibilityLabel={`${product.name} by ${product.brand}. Open details.`}
```

`components/GarmentSwipeCard.tsx:134` — replace:

```tsx
              {product.brand} · ${product.price}
```

with:

```tsx
              {product.brand}
```

`components/panes/ClosetPane.tsx:333` — replace:

```tsx
                    {product.brand} · ${product.price}
```

with:

```tsx
                    {product.brand}
```

`components/panes/ClosetPane.tsx:59` — delete the line:

```tsx
            budgetCenter: 120,
```

`components/panes/ClosetPane.tsx:360` and the `<Text>` that renders `total` — delete both. This is the accepted feature loss from spec §5: the saved-outfit total disappears from under each fit.

```tsx
            const total = pieces.reduce((sum, p) => sum + p.price, 0);
```

- [ ] **Step 12: Strip price from `ExplorePane`**

`components/panes/ExplorePane.tsx` — remove `outfitTotal,` from the `@/lib/deck` import block (line 14).

Delete line 24:

```tsx
const BUDGET_CENTER = 120;
```

In the `ctx` memo, delete line 53:

```tsx
            budgetCenter: BUDGET_CENTER,
```

Delete the outfit-total `<Text>` (lines 160-162) and let the buttons take the full row:

```tsx
            <Text style={[type.title, { color: accent.bright, flex: 1 }]}>
              ${outfitTotal(outfit)}
            </Text>
```

- [ ] **Step 13: Strip price from `app/product/[id].tsx`**

This file is written on two long lines. Make two exact string replacements within line 2.

Replace:

```tsx
scoreProduct({ product, userVector: profile.vector, wardrobe, inspoImages: [], targetFormality: 3, budgetCenter: 120 })
```

with:

```tsx
scoreProduct({ product, userVector: profile.vector, wardrobe, inspoImages: [], targetFormality: 3 })
```

Replace:

```tsx
<Text style={[type.body, { color: base.textMid }]}>{product.brand} · ${product.price}</Text>
```

with:

```tsx
<Text style={[type.body, { color: base.textMid }]}>{product.brand}</Text>
```

- [ ] **Step 14: Update the tests that assert on price**

`__tests__/catalog.test.ts` — six changes. **Two tests are deleted; three are amended; one import is trimmed.**

*Delete entirely* (these exist only to assert the price band, which no longer exists):
- `'keeps every price inside the spec price band'` (lines 5-10)
- `'excludes products below a price floor'` (lines 67-72)

*Amend* `'spans the intended price range and every formality level'` (lines 44-49) — rename it to `'covers every formality level'` and delete the three price lines, leaving:

```ts
  it('covers every formality level', () => {
    expect(new Set(ALL_PRODUCTS.map((p) => p.formality)).size).toBe(5);
  });
```

*Amend* `'filters by category and price ceiling'` (lines 55-59) — rename it to `'filters by category'`, leaving:

```ts
  it('filters by category', async () => {
    const found = await seededProvider.search({ category: 'outerwear' });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((p) => p.category === 'outerwear')).toBe(true);
  });
```

*Amend* `'is deterministic across repeated expansion'` (lines 12-17) — the fingerprint currently interpolates price into the compared string, so it must fall back to ids alone:

```ts
    expect(again.map((p: { id: string }) => p.id))
      .toEqual(ALL_PRODUCTS.map((p) => p.id));
```

*Delete one line* inside `'keeps every product internally consistent'`: `expect(p.price).toBeGreaterThan(0);` (line 33).

*Trim the import* on line 1 to `import { seededProvider, ALL_PRODUCTS } from '@/lib/catalog/seeded';` — `MIN_PRICE` and `MAX_PRICE` no longer exist.

`__tests__/scoring.test.ts` — remove `priceScore` from the line-1 import; delete `price: 120,` from the product fixture on line 8; delete the two price tests (`'peaks price score at the budget centre and decays away from it'` and `'returns a finite price score for a degenerate budget centre'`); delete `budgetCenter: 120,` at line 63; and replace line 93:

```ts
      + SCORE_WEIGHTS.price * top.scores.price
```

with nothing (the surrounding expression keeps `style`, `wardrobe`, `occasion`).

`__tests__/deck.test.ts` — delete `price: 100,` (line 16) and `budgetCenter: 100,` (line 47).

`__tests__/gaps.test.ts` — delete `budgetCenter: 120,` (line 16).

- [ ] **Step 15: Typecheck and run the whole suite**

Run: `npx tsc --noEmit`
Expected: no output (clean).

Run: `npx jest`
Expected: all suites PASS. No test mentions price.

Run: `grep -rn "price\|Price\|budgetCenter\|BUDGET_CENTER\|outfitTotal" lib components app __tests__ --include=*.ts --include=*.tsx`
Expected: no output.

- [ ] **Step 16: Commit**

```bash
git add lib components app __tests__
git commit -m "refactor: remove price from the product model

There is no price column in catalog.parquet and no transactions data.
Faking one would put invented numbers next to a live H&M buy_url.
SCORE_WEIGHTS renormalised to style 0.60 / wardrobe 0.25 / occasion 0.15."
```

---

## Task 2: Create the `Backend/` virtualenv

Implements spec §12 step 1a. **Blocking** — nothing in Tasks 3–7 can be verified until this passes.

The spec's §12 risk ("PyTorch has no 3.14 wheels, pin 3.12") was checked against
PyPI before execution and is **stale**. `torch 2.14.0` publishes
`cp312`, `cp313`, and `cp314` wheels for `macosx_14_0_arm64`, and the full
`requirements-api.txt` resolves clean on 3.14 (`torch==2.14.0`,
`transformers==5.17.0`, `pandas==3.0.6`, `numpy==2.5.3`). There is no version
pin and no `.python-version` file. The venv still exists for isolation — a
200 MB torch does not belong in system site-packages — and every later backend
command in this plan runs through `Backend/.venv/bin/python`.

**Files:**
- No files created or modified. This task produces an untracked, git-ignored `Backend/.venv/`.

**Interfaces:**
- Consumes: nothing.
- Produces: `Backend/.venv/bin/python` — an interpreter with torch, transformers, numpy, pandas, pyarrow, fastapi, pytest, httpx installed. Every later backend command in this plan uses this exact path.

- [ ] **Step 1: Create and populate the venv**

```bash
cd Backend
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements-api.txt
```

Expected: installs without error. This downloads roughly 200 MB and takes a few minutes.

- [ ] **Step 2: Verify the heavy imports actually work**

Resolving a wheel and importing it are different things — a `cp314` wheel that
segfaults on import would still have installed cleanly above.

```bash
cd Backend && .venv/bin/python -c "import torch, transformers, pandas, pyarrow; print(torch.__version__, pandas.__version__)"
```

Expected: two version strings. No traceback.

- [ ] **Step 3: Confirm the existing backend suite is green**

```bash
cd Backend && .venv/bin/python -m pytest tests/ -v
```

Expected: all tests PASS. These tests monkeypatch `StyleEngine._load_model` and `embed_images`, so they pass even without a downloaded model — but they must pass *now*, before any change, as the baseline.

- [ ] **Step 4: Confirm the venv is git-ignored, and commit nothing**

`.gitignore` line 52 is a bare `.venv/`, which matches at any depth including
`Backend/.venv/`. Confirm rather than duplicate:

Run: `git check-ignore -v Backend/.venv`
Expected: one line pointing at `.gitignore:52`.

Run: `git status --short`
Expected: no output. **This task commits nothing** — it produces only a local,
ignored directory. Do not create a `.python-version` file and do not add a
version comment to `requirements-api.txt`; there is no pin to record.

---

## Task 3: `Backend/axes.py` — contrastive projection and percentile normalisation

Implements spec §3 (D2, D8). Pure numpy — **no model import, no torch, no transformers**. Fully unit-testable with hand-built arrays.

**Files:**
- Create: `Backend/axes.py`
- Test: `Backend/tests/test_axes.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `STYLE_DIMENSIONS: list[str]` — the 9 frontend dimension names, in the exact order of `lib/types.ts`.
  - `PROMPT_PAIRS: list[tuple[str, str]]` — 9 `(positive, negative)` pairs, index-aligned to `STYLE_DIMENSIONS`.
  - `prompt_texts() -> list[str]` — the 18 prompts flattened as `[pos0, neg0, pos1, neg1, ...]`, the order `embed_texts` must be called with.
  - `raw_scores(emb: np.ndarray, text_vecs: np.ndarray) -> np.ndarray` — `emb` is `[n, d]`, `text_vecs` is `[18, d]` in `prompt_texts()` order; returns `[n, 9]` float32.
  - `quantile_breakpoints(raw: np.ndarray) -> np.ndarray` — `[n, 9]` in, `[9, 101]` float32 out.
  - `percentile_rank(raw: np.ndarray, breakpoints: np.ndarray) -> np.ndarray` — `[n, 9]` in, `[n, 9]` float32 in `[0, 1]` out.

- [ ] **Step 1: Write the failing test**

Create `Backend/tests/test_axes.py`:

```python
import numpy as np
import pytest

import axes


def test_dimensions_and_pairs_are_aligned():
    assert len(axes.STYLE_DIMENSIONS) == 9
    assert len(axes.PROMPT_PAIRS) == 9
    assert axes.STYLE_DIMENSIONS == [
        "minimalism", "streetwear", "workwear", "outdoor", "vintage",
        "formal", "colorfulness", "pattern", "relaxedFit",
    ]


def test_prompt_texts_interleaves_positive_then_negative():
    texts = axes.prompt_texts()
    assert len(texts) == 18
    assert texts[0] == axes.PROMPT_PAIRS[0][0]
    assert texts[1] == axes.PROMPT_PAIRS[0][1]
    assert texts[16] == axes.PROMPT_PAIRS[8][0]
    assert texts[17] == axes.PROMPT_PAIRS[8][1]
    assert len(set(texts)) == 18, "prompts must be distinct"


def test_raw_scores_is_positive_dot_minus_negative_dot():
    # d=2. Axis 0: pos=[1,0], neg=[0,1]. Remaining 8 axes are zero vectors.
    text_vecs = np.zeros((18, 2), dtype=np.float32)
    text_vecs[0] = [1.0, 0.0]
    text_vecs[1] = [0.0, 1.0]

    emb = np.array([[1.0, 0.0], [0.0, 1.0], [0.6, 0.8]], dtype=np.float32)
    raw = axes.raw_scores(emb, text_vecs)

    assert raw.shape == (3, 9)
    assert raw[0, 0] == pytest.approx(1.0)    # e·pos - e·neg = 1 - 0
    assert raw[1, 0] == pytest.approx(-1.0)   # e·pos - e·neg = 0 - 1
    assert raw[2, 0] == pytest.approx(-0.2)   # e·pos - e·neg = 0.6 - 0.8
    assert np.allclose(raw[:, 1:], 0.0)


def test_raw_scores_is_monotone_in_positive_similarity():
    text_vecs = np.zeros((18, 2), dtype=np.float32)
    text_vecs[0] = [1.0, 0.0]
    text_vecs[1] = [0.0, 1.0]

    # Sweep from pointing at neg to pointing at pos.
    angles = np.linspace(np.pi / 2, 0.0, 20)
    emb = np.stack([np.cos(angles), np.sin(angles)], axis=1).astype(np.float32)
    raw = axes.raw_scores(emb, text_vecs)[:, 0]

    assert np.all(np.diff(raw) > 0)


def test_quantile_breakpoints_shape_and_monotonicity():
    rng = np.random.default_rng(0)
    raw = rng.normal(size=(500, 9)).astype(np.float32)
    bp = axes.quantile_breakpoints(raw)

    assert bp.shape == (9, 101)
    assert bp.dtype == np.float32
    for a in range(9):
        assert np.all(np.diff(bp[a]) >= 0), f"axis {a} breakpoints not sorted"


def test_percentile_rank_is_uniform_over_the_source_distribution():
    rng = np.random.default_rng(1)
    raw = rng.normal(size=(5000, 9)).astype(np.float32)
    bp = axes.quantile_breakpoints(raw)
    ranks = axes.percentile_rank(raw, bp)

    assert ranks.shape == (5000, 9)
    assert ranks.min() >= 0.0 and ranks.max() <= 1.0
    for a in range(9):
        # A uniform distribution has mean 0.5 and a decile histogram that is flat.
        assert abs(float(ranks[:, a].mean()) - 0.5) < 0.02
        hist, _ = np.histogram(ranks[:, a], bins=10, range=(0.0, 1.0))
        assert hist.min() > 5000 / 10 * 0.75


def test_percentile_rank_clamps_outside_the_breakpoint_range():
    raw = np.zeros((2, 9), dtype=np.float32)
    raw[0, :] = -99.0
    raw[1, :] = 99.0
    bp = np.tile(np.linspace(0.0, 1.0, 101, dtype=np.float32), (9, 1))
    ranks = axes.percentile_rank(raw, bp)

    assert np.allclose(ranks[0], 0.0)
    assert np.allclose(ranks[1], 1.0)


def test_percentile_rank_preserves_order_within_an_axis():
    rng = np.random.default_rng(2)
    raw = rng.normal(size=(300, 9)).astype(np.float32)
    bp = axes.quantile_breakpoints(raw)
    ranks = axes.percentile_rank(raw, bp)

    order_raw = np.argsort(raw[:, 3], kind="stable")
    assert np.all(np.diff(ranks[order_raw, 3]) >= 0)
```

Note the second assertion in `test_raw_scores_is_positive_dot_minus_negative_dot`: for `emb[1] = [0, 1]`, `pos·e = 0` and `neg·e = 1`, so `raw = -1.0`. Write the comment as `# 0 - 1`.

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd Backend && .venv/bin/python -m pytest tests/test_axes.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'axes'`

- [ ] **Step 3: Write `Backend/axes.py`**

```python
"""
Projection of FashionCLIP embeddings into the frontend's 9-dimension StyleVector
space, via contrastive text prompts.

Deliberately model-free: this module does pure numpy over embeddings someone
else produced, so it is unit-testable with hand-built arrays and imports neither
torch nor transformers.

Why contrastive pairs rather than a single positive prompt: a bare
`e . pos` score is dominated by how close each prompt happens to sit to the
image-embedding centroid, which is a property of the prompt, not the garment.
Subtracting a deliberately opposed negative prompt cancels most of that shared
component. Percentile normalisation (below) removes what is left.
"""
import numpy as np

# Must stay identical, and in the same order, as STYLE_DIMENSIONS in lib/types.ts.
STYLE_DIMENSIONS = [
    "minimalism", "streetwear", "workwear", "outdoor", "vintage",
    "formal", "colorfulness", "pattern", "relaxedFit",
]

# (positive, negative), index-aligned to STYLE_DIMENSIONS.
PROMPT_PAIRS = [
    ("a plain minimal understated garment",
     "an ornate decorative embellished garment"),
    ("a streetwear urban garment",
     "a classic conservative tailored garment"),
    ("a rugged utilitarian workwear garment with pockets",
     "a delicate refined dressy garment"),
    ("a technical outdoor hiking garment",
     "an indoor city garment"),
    ("a vintage retro garment",
     "a modern contemporary garment"),
    ("a formal elegant evening garment",
     "a casual everyday garment"),
    ("a brightly coloured vivid saturated garment",
     "a muted neutral monochrome garment"),
    ("a patterned printed graphic garment",
     "a plain solid colour garment"),
    ("a loose oversized relaxed fit garment",
     "a fitted slim tailored garment"),
]

assert len(PROMPT_PAIRS) == len(STYLE_DIMENSIONS)

N_AXES = len(STYLE_DIMENSIONS)

# 101 breakpoints = the 0th through 100th percentile, inclusive, one per integer.
N_BREAKPOINTS = 101


def prompt_texts() -> list[str]:
    """The 18 prompts flattened as [pos0, neg0, pos1, neg1, ...].

    This is the exact order `StyleEngine.embed_texts` must be called with, and
    the order `raw_scores` expects its `text_vecs` argument in.
    """
    out: list[str] = []
    for pos, neg in PROMPT_PAIRS:
        out.append(pos)
        out.append(neg)
    return out


def raw_scores(emb: np.ndarray, text_vecs: np.ndarray) -> np.ndarray:
    """raw[i, a] = emb[i] . pos[a] - emb[i] . neg[a].

    emb:       [n, d] image (or profile) embeddings, L2-normalized.
    text_vecs: [18, d] prompt embeddings in `prompt_texts()` order, L2-normalized.
    returns:   [n, 9] float32. Unbounded; feed to `percentile_rank` before use.
    """
    emb = np.atleast_2d(np.asarray(emb, dtype=np.float32))
    text_vecs = np.asarray(text_vecs, dtype=np.float32)
    if text_vecs.shape[0] != 2 * N_AXES:
        raise ValueError(f"expected {2 * N_AXES} prompt vectors, got {text_vecs.shape[0]}")

    sims = emb @ text_vecs.T                 # [n, 18]
    pos = sims[:, 0::2]                      # [n, 9]
    neg = sims[:, 1::2]                      # [n, 9]
    return (pos - neg).astype(np.float32)


def quantile_breakpoints(raw: np.ndarray) -> np.ndarray:
    """Per-axis quantile breakpoints of a reference distribution.

    raw:     [n, 9] raw scores for the whole catalog.
    returns: [9, 101] float32, sorted ascending along axis 1.
    """
    raw = np.asarray(raw, dtype=np.float32)
    qs = np.linspace(0.0, 100.0, N_BREAKPOINTS)
    # np.percentile over axis 0 gives [101, 9]; transpose to [9, 101].
    bp = np.percentile(raw, qs, axis=0).T
    return np.ascontiguousarray(bp, dtype=np.float32)


def percentile_rank(raw: np.ndarray, breakpoints: np.ndarray) -> np.ndarray:
    """Map raw scores onto [0, 1] by interpolating against stored breakpoints.

    raw:         [n, 9] raw scores.
    breakpoints: [9, 101] from `quantile_breakpoints`.
    returns:     [n, 9] float32 in [0, 1], clamped outside the breakpoint range.

    `np.interp` requires the x-array to be increasing and already clamps to the
    endpoint y-values outside the range, which gives us the clamping for free.
    """
    raw = np.atleast_2d(np.asarray(raw, dtype=np.float32))
    breakpoints = np.asarray(breakpoints, dtype=np.float32)
    if breakpoints.shape != (N_AXES, N_BREAKPOINTS):
        raise ValueError(f"expected breakpoints of shape {(N_AXES, N_BREAKPOINTS)}, "
                         f"got {breakpoints.shape}")

    ys = np.linspace(0.0, 1.0, N_BREAKPOINTS)
    out = np.empty_like(raw, dtype=np.float32)
    for a in range(N_AXES):
        out[:, a] = np.interp(raw[:, a], breakpoints[a], ys)
    return out
```

- [ ] **Step 4: Run it to make sure it passes**

```bash
cd Backend && .venv/bin/python -m pytest tests/test_axes.py -v
```

Expected: 8 passed.

- [ ] **Step 5: Confirm nothing else broke**

```bash
cd Backend && .venv/bin/python -m pytest tests/ -v
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add Backend/axes.py Backend/tests/test_axes.py
git commit -m "feat(backend): contrastive style-axis projection with percentile normalisation

Projects FashionCLIP embeddings into the frontend's 9-dim StyleVector space
using one positive and one negative prompt per dimension. Raw CLIP margins are
axis-biased, so scores are re-expressed as percentile ranks against the catalog
distribution -- which is what comparing dimensions to each other assumes."
```

---

## Task 4: `Backend/derive.py` — deterministic categorical derivation

Implements spec §4 (D3, D5). Split out of the build script so the lookup tables are testable without pandas fixtures or a model. Pure string work.

**Files:**
- Create: `Backend/derive.py`
- Test: `Backend/tests/test_derive.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `EXCLUDED_GROUPS: frozenset[str]` — `product_group_name` values that are never recommendable.
  - `is_recommendable(product_group_name: str) -> bool`
  - `derive_category(product_type_name: str, product_group_name: str) -> str | None` — one of `top | bottom | outerwear | footwear | knitwear | accessory`, or `None` if not recommendable.
  - `derive_colour_family(colour_group_name: str) -> str` — one of `neutral | warm | cool | earth | bold`. Never `None`.
  - `derive_formality(product_type_name: str) -> int` — 1–5.
  - `derive_seasons(detail_desc: str, product_type_name: str) -> list[str]` — a subset of `spring, summer, fall, winter`, in that canonical order, never empty.

- [ ] **Step 1: Write the failing test**

Create `Backend/tests/test_derive.py`:

```python
import pytest

import derive


# ------------------------------------------------------------------ category

@pytest.mark.parametrize("ptype,pgroup,expected", [
    ("T-shirt",         "Garment Upper body", "top"),
    ("Blouse",          "Garment Upper body", "top"),
    ("Vest top",        "Garment Upper body", "top"),
    ("Sweater",         "Garment Upper body", "knitwear"),
    ("Cardigan",        "Garment Upper body", "knitwear"),
    ("Jacket",          "Garment Upper body", "outerwear"),
    ("Coat",            "Garment Upper body", "outerwear"),
    ("Blazer",          "Garment Upper body", "outerwear"),
    ("Outdoor jacket",  "Garment Upper body", "outerwear"),
    ("Trousers",        "Garment Lower body", "bottom"),
    ("Jeans",           "Garment Lower body", "bottom"),
    ("Sneakers",        "Shoes",              "footwear"),
    ("Boots",           "Shoes",              "footwear"),
    ("Hat/beanie",      "Accessories",        "accessory"),
    ("Backpack",        "Bags",               "accessory"),
])
def test_derive_category_maps_known_types(ptype, pgroup, expected):
    assert derive.derive_category(ptype, pgroup) == expected


@pytest.mark.parametrize("pgroup", [
    "Garment Full body", "Underwear", "Underwear/nightwear", "Nightwear",
    "Swimwear", "Socks & Tights", "Cosmetic", "Furniture", "Interior textile",
    "Stationery", "Items", "Fun", "Garment and Shoe care", "Unknown",
])
def test_excluded_groups_derive_to_none(pgroup):
    assert derive.is_recommendable(pgroup) is False
    assert derive.derive_category("Anything", pgroup) is None


def test_bags_are_kept_as_accessories():
    assert derive.is_recommendable("Bags") is True


def test_unknown_upper_body_type_falls_back_to_top():
    assert derive.derive_category("Some Novel Shirt Thing", "Garment Upper body") == "top"


def test_unknown_group_that_is_not_excluded_derives_to_none():
    assert derive.derive_category("Widget", "Garment Not A Real Group") is None


def test_category_matching_is_case_insensitive():
    assert derive.derive_category("SWEATER", "Garment Upper body") == "knitwear"


# -------------------------------------------------------------- colour family

@pytest.mark.parametrize("colour,expected", [
    ("Black", "neutral"),
    ("White", "neutral"),
    ("Light Beige", "neutral"),
    ("Dark Brown", "earth"),
    ("Khaki green", "earth"),
    ("Orange", "warm"),
    ("Dark Red", "bold"),
    ("Navy Blue", "cool"),
    ("Pink", "bold"),
])
def test_derive_colour_family_maps_known_colours(colour, expected):
    assert derive.derive_colour_family(colour) == expected


def test_unknown_colour_falls_back_to_neutral():
    assert derive.derive_colour_family("Mauve Sparkle") == "neutral"
    assert derive.derive_colour_family("") == "neutral"
    assert derive.derive_colour_family(None) == "neutral"


# ----------------------------------------------------------------- formality

@pytest.mark.parametrize("ptype,expected", [
    ("Leggings/Tights", 1),
    ("Sweatpants", 1),
    ("T-shirt", 2),
    ("Jeans", 2),
    ("Sneakers", 2),
    ("Hoodie", 2),
    ("Shirt", 3),
    ("Chinos", 3),
    ("Sweater", 3),
    ("Boots", 3),
    ("Blazer", 4),
    ("Coat", 4),
    ("Heeled sandals", 4),
    ("Suit", 5),
])
def test_derive_formality_maps_known_types(ptype, expected):
    assert derive.derive_formality(ptype) == expected


def test_unknown_type_defaults_to_three():
    assert derive.derive_formality("Widget") == 3
    assert derive.derive_formality("") == 3


def test_formality_is_always_in_range():
    for ptype in ["Suit", "Widget", "", "Sweatpants", "Tuxedo jacket"]:
        assert 1 <= derive.derive_formality(ptype) <= 5


# ------------------------------------------------------------------- seasons

def test_cold_keywords_give_fall_and_winter():
    assert derive.derive_seasons("Padded wool coat with a quilted lining", "Coat") == ["fall", "winter"]


def test_warm_keywords_give_spring_and_summer():
    assert derive.derive_seasons("Lightweight linen shirt", "Shirt") == ["spring", "summer"]


def test_both_matched_gives_all_four():
    seasons = derive.derive_seasons("Linen blend with a wool trim", "Shirt")
    assert seasons == ["spring", "summer", "fall", "winter"]


def test_neither_matched_gives_all_four():
    assert derive.derive_seasons("A garment.", "Widget") == ["spring", "summer", "fall", "winter"]


def test_product_type_contributes_keywords():
    # "boot" is a cold keyword and appears only in the type, not the description.
    assert derive.derive_seasons("Ankle height.", "Boots") == ["fall", "winter"]


def test_seasons_handles_missing_description():
    assert derive.derive_seasons(None, "Coat") == ["fall", "winter"]
    assert derive.derive_seasons(None, None) == ["spring", "summer", "fall", "winter"]
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd Backend && .venv/bin/python -m pytest tests/test_derive.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'derive'`

- [ ] **Step 3: Write `Backend/derive.py`**

```python
"""
Deterministic derivation of the categorical Product fields the frontend needs
but `catalog.parquet` does not carry in a usable shape.

No model involved, by design. `category`, `colour_family` and `formality` are
facts about a garment that H&M's own metadata already states; asking CLIP to
re-infer them would be slower, less accurate, and non-reproducible.

The `colour_family` values mirror COLOR_TO_FAMILY in lib/types.ts. The keys
differ because H&M's `colour_group_name` is prose ("Light Beige", "Khaki green")
rather than the single tokens the frontend table uses, so this is a substring
scan rather than a dict lookup.
"""
from __future__ import annotations

# --------------------------------------------------------------------- groups

EXCLUDED_GROUPS = frozenset({
    "Garment Full body",       # dresses and jumpsuits: the outfit graph has no dress slot
    "Underwear",
    "Underwear/nightwear",
    "Nightwear",
    "Swimwear",
    "Socks & Tights",
    "Cosmetic",
    "Furniture",
    "Interior textile",
    "Stationery",
    "Items",
    "Fun",
    "Garment and Shoe care",
    "Unknown",
})

# product_group_name -> frontend category, for groups with a single mapping.
_GROUP_TO_CATEGORY = {
    "Garment Lower body": "bottom",
    "Shoes": "footwear",
    "Accessories": "accessory",
    "Bags": "accessory",
}

# Upper-body garments split three ways on product_type_name.
_KNIT_TYPES = ("sweater", "cardigan", "jumper", "pullover", "knit")
_OUTER_TYPES = ("jacket", "coat", "blazer", "parka", "anorak", "trench")


def is_recommendable(product_group_name: str | None) -> bool:
    """False for groups the outfit engine cannot place. Never drops rows --
    callers turn this into a boolean mask, because embeddings.npy is
    positionally aligned with catalog.parquet."""
    return (product_group_name or "") not in EXCLUDED_GROUPS


def derive_category(product_type_name: str | None,
                    product_group_name: str | None) -> str | None:
    """Returns a frontend Category, or None if the row is not recommendable."""
    group = product_group_name or ""
    if not is_recommendable(group):
        return None

    if group in _GROUP_TO_CATEGORY:
        return _GROUP_TO_CATEGORY[group]

    if group == "Garment Upper body":
        ptype = (product_type_name or "").lower()
        if any(k in ptype for k in _OUTER_TYPES):
            return "outerwear"
        if any(k in ptype for k in _KNIT_TYPES):
            return "knitwear"
        return "top"

    return None


# -------------------------------------------------------------- colour family

# Ordered: the first matching token wins, so put more specific tokens first
# within a family and order families so "dark red" hits bold before "dark"
# can hit anything else.
_COLOUR_TOKENS: list[tuple[str, str]] = [
    # bold
    ("purple", "bold"), ("lilac", "bold"), ("magenta", "bold"), ("pink", "bold"),
    ("red", "bold"), ("yellow", "bold"), ("turquoise", "bold"), ("lime", "bold"),
    # cool
    ("navy", "cool"), ("indigo", "cool"), ("denim", "cool"), ("cobalt", "cool"),
    ("blue", "cool"),
    # warm
    ("rust", "warm"), ("terracotta", "warm"), ("orange", "warm"),
    ("burgundy", "warm"), ("mustard", "warm"),
    # earth
    ("khaki", "earth"), ("olive", "earth"), ("forest", "earth"), ("sage", "earth"),
    ("brown", "earth"), ("chocolate", "earth"), ("camel", "earth"), ("tan", "earth"),
    ("green", "earth"),
    # neutral
    ("black", "neutral"), ("white", "neutral"), ("grey", "neutral"),
    ("gray", "neutral"), ("charcoal", "neutral"), ("ivory", "neutral"),
    ("cream", "neutral"), ("beige", "neutral"), ("silver", "neutral"),
]


def derive_colour_family(colour_group_name: str | None) -> str:
    """Substring scan over H&M's prose colour names. Unmatched -> 'neutral'."""
    name = (colour_group_name or "").lower()
    for token, family in _COLOUR_TOKENS:
        if token in name:
            return family
    return "neutral"


# ----------------------------------------------------------------- formality

# Checked high-to-low so "dress shirt" resolves to 4 before "shirt" resolves to 3.
_FORMALITY_TOKENS: list[tuple[int, tuple[str, ...]]] = [
    (5, ("suit", "tuxedo", "evening")),
    (4, ("blazer", "skirt", "coat", "heel", "dress shirt", "loafer", "oxford")),
    (3, ("shirt", "chino", "sweater", "cardigan", "boot", "trousers", "knit")),
    (2, ("t-shirt", "tee", "jeans", "sneaker", "shorts", "hoodie", "denim", "cap")),
    (1, ("sport", "athletic", "legging", "sweatpant", "track", "jogger", "gym")),
]


def derive_formality(product_type_name: str | None) -> int:
    """1 (athletic) to 5 (black tie). Unmatched -> 3."""
    ptype = (product_type_name or "").lower()
    # Athletic wins outright: "sports jacket" is activewear, not a blazer.
    if any(t in ptype for t in _FORMALITY_TOKENS[4][1]):
        return 1
    for level, tokens in _FORMALITY_TOKENS[:4]:
        if any(t in ptype for t in tokens):
            return level
    return 3


# ------------------------------------------------------------------- seasons

_COLD_TOKENS = (
    "wool", "padded", "fleece", "knit", "thermal", "quilted", "down",
    "faux fur", "corduroy", "flannel", "cashmere", "boot",
)
_WARM_TOKENS = (
    "linen", "shorts", "swim", "sleeveless", "sandal", "tank",
    "lightweight", "mesh", "crochet",
)

_ALL_SEASONS = ["spring", "summer", "fall", "winter"]


def derive_seasons(detail_desc: str | None,
                   product_type_name: str | None) -> list[str]:
    """Keyword scan over description + type. Ambiguous or silent -> all four.

    Returns seasons in the canonical order used by lib/types.ts SEASONS.
    Never returns an empty list -- an item with no season is unwearable, and a
    missing description is far more likely than a genuinely seasonless garment.
    """
    text = f"{detail_desc or ''} {product_type_name or ''}".lower()
    cold = any(t in text for t in _COLD_TOKENS)
    warm = any(t in text for t in _WARM_TOKENS)

    if cold and not warm:
        return ["fall", "winter"]
    if warm and not cold:
        return ["spring", "summer"]
    return list(_ALL_SEASONS)
```

- [ ] **Step 4: Run it to make sure it passes**

```bash
cd Backend && .venv/bin/python -m pytest tests/test_derive.py -v
```

Expected: all parametrised cases PASS.

- [ ] **Step 5: Commit**

```bash
git add Backend/derive.py Backend/tests/test_derive.py
git commit -m "feat(backend): deterministic category, colour, formality and season derivation

Split from the build script so the lookup tables are testable without pandas
fixtures or a model. Full-body garments are excluded because the outfit graph
has six slots and no dress slot; filing a dress under 'top' would let the
engine pair it with trousers."
```

---

## Task 5: `Backend/build_style_index.py` — build and commit the sidecar

Implements spec §7 (new build script). Offline, idempotent, run once. **This is the only task that needs the real FashionCLIP model** — it embeds the 18 prompts. First run downloads ~600 MB from HuggingFace.

**Files:**
- Create: `Backend/build_style_index.py`
- Create (generated, committed): `Backend/index/style.parquet`, `Backend/index/axis_quantiles.npy`

**Interfaces:**
- Consumes: `axes.STYLE_DIMENSIONS`, `axes.prompt_texts`, `axes.raw_scores`, `axes.quantile_breakpoints`, `axes.percentile_rank` (Task 3); `derive.derive_category`, `derive.derive_colour_family`, `derive.derive_formality`, `derive.derive_seasons`, `derive.is_recommendable` (Task 4); `engine.StyleEngine.embed_texts`.
- Produces:
  - `index/style.parquet` — one row per catalog row, **same count and same order** as `catalog.parquet`. Columns: `article_id: str`, the 9 axis names as `float32`, `category: str` (empty string when not recommendable), `colour_family: str`, `formality: int8`, `seasons: str` (comma-joined, e.g. `"fall,winter"`), `recommendable: bool`.
  - `index/axis_quantiles.npy` — `[9, 101]` float32.

- [ ] **Step 1: Write the script**

Create `Backend/build_style_index.py`:

```python
"""
Offline sidecar builder. Run once; commit the two files it writes.

    cd Backend && .venv/bin/python build_style_index.py

Writes a SIDECAR rather than modifying catalog.parquet, so the raw import stays
pristine and a bad run can never corrupt the source. The output has exactly one
row per catalog row, in the same order, because embeddings.npy is positionally
aligned with catalog.parquet and engine.recommend() indexes self.emb by catalog
row position. Non-recommendable rows are marked, never dropped.
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

import axes
import derive
from engine import StyleEngine


def build(index_dir: str = "index") -> None:
    index_dir = Path(index_dir)
    eng = StyleEngine(index_dir, load_model=True)

    print(f"catalog: {len(eng.catalog):,} rows", flush=True)

    # 1. Embed the 18 prompts, in prompt_texts() order.
    prompts = axes.prompt_texts()
    text_vecs = eng.embed_texts(prompts)
    print(f"embedded {len(prompts)} prompts -> {text_vecs.shape}", flush=True)

    # 2. Project every catalog embedding, then learn the catalog's own
    #    distribution per axis and re-express each score as its percentile.
    raw = axes.raw_scores(eng.emb, text_vecs)
    breakpoints = axes.quantile_breakpoints(raw)
    ranks = axes.percentile_rank(raw, breakpoints)
    print(f"projected -> {ranks.shape}", flush=True)

    # 3. Derive the categoricals, preserving row order.
    cat = eng.catalog
    categories, families, formalities, seasons, recommendable = [], [], [], [], []
    for ptype, pgroup, colour, desc in zip(
        cat["product_type_name"].fillna(""),
        cat["product_group_name"].fillna(""),
        cat["colour_group_name"].fillna(""),
        cat["detail_desc"].fillna(""),
    ):
        category = derive.derive_category(ptype, pgroup)
        categories.append(category or "")
        recommendable.append(category is not None)
        families.append(derive.derive_colour_family(colour))
        formalities.append(derive.derive_formality(ptype))
        seasons.append(",".join(derive.derive_seasons(desc, ptype)))

    out = pd.DataFrame({"article_id": cat["article_id"].to_numpy()})
    for i, dim in enumerate(axes.STYLE_DIMENSIONS):
        out[dim] = ranks[:, i].astype(np.float32)
    out["category"] = categories
    out["colour_family"] = families
    out["formality"] = np.asarray(formalities, dtype=np.int8)
    out["seasons"] = seasons
    out["recommendable"] = np.asarray(recommendable, dtype=bool)

    assert len(out) == len(cat), "sidecar row count must match the catalog exactly"

    out.to_parquet(index_dir / "style.parquet", index=False)
    np.save(index_dir / "axis_quantiles.npy", breakpoints)

    n_ok = int(out["recommendable"].sum())
    print(f"wrote style.parquet ({len(out):,} rows, {n_ok:,} recommendable "
          f"= {100 * n_ok / len(out):.1f}%)", flush=True)
    print(f"wrote axis_quantiles.npy {breakpoints.shape}", flush=True)
    print("\ncategory distribution:")
    print(out.loc[out["recommendable"], "category"].value_counts().to_string())


def spot_check(index_dir: str = "index", k: int = 10) -> None:
    """Prints the top-k and bottom-k item names per axis, so a human can confirm
    the prompts measure what they claim to. Spec §12 calls for this after the
    first build."""
    index_dir = Path(index_dir)
    style = pd.read_parquet(index_dir / "style.parquet")
    catalog = pd.read_parquet(index_dir / "catalog.parquet")
    merged = style.merge(catalog[["article_id", "prod_name", "product_type_name"]],
                         on="article_id", how="left")
    merged = merged[merged["recommendable"]]

    for dim in axes.STYLE_DIMENSIONS:
        s = merged.sort_values(dim)
        print(f"\n=== {dim} ===")
        print("  LOW: ", "; ".join(s.head(k)["product_type_name"].astype(str)))
        print("  HIGH:", "; ".join(s.tail(k)["product_type_name"].astype(str)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--index-dir", default="index")
    ap.add_argument("--spot-check", action="store_true",
                    help="skip building; print top/bottom items per axis")
    args = ap.parse_args()
    if args.spot_check:
        spot_check(args.index_dir)
    else:
        build(args.index_dir)
```

- [ ] **Step 2: Run the build**

```bash
cd Backend && .venv/bin/python build_style_index.py
```

Expected output shape:

```
catalog: 20,000 rows
embedded 18 prompts -> (18, 512)
projected -> (20000, 9)
wrote style.parquet (20,000 rows, N recommendable = XX.X%)
wrote axis_quantiles.npy (9, 101)

category distribution:
top          ...
bottom       ...
footwear     ...
outerwear    ...
knitwear     ...
accessory    ...
```

If the recommendable percentage is below 40%, stop and report it — spec §12 flags catalogue reduction as a known risk and that would be too thin for `refillSlot`.

- [ ] **Step 3: Verify the sidecar is aligned and well-formed**

```bash
cd Backend && .venv/bin/python -c "
import numpy as np, pandas as pd
s = pd.read_parquet('index/style.parquet')
c = pd.read_parquet('index/catalog.parquet')
q = np.load('index/axis_quantiles.npy')
assert len(s) == len(c), (len(s), len(c))
assert (s['article_id'].to_numpy() == c['article_id'].to_numpy()).all(), 'row order drifted'
assert q.shape == (9, 101), q.shape
assert s['minimalism'].between(0, 1).all()
assert set(s.loc[s['recommendable'], 'category']) <= {'top','bottom','outerwear','footwear','knitwear','accessory'}
assert s['formality'].between(1, 5).all()
print('sidecar OK', len(s), 'rows')
"
```

Expected: `sidecar OK 20000 rows`

- [ ] **Step 4: Spot-check the prompts (spec §12)**

```bash
cd Backend && .venv/bin/python build_style_index.py --spot-check
```

Read the output. Each axis should show a recognisable contrast — e.g. `relaxedFit` LOW should skew to fitted types (leggings, slim jeans) and HIGH to oversized types (hoodies, coats). If an axis is obviously measuring the wrong thing, revise that prompt pair in `axes.py` and re-run Step 2. Record what you saw in the commit message.

- [ ] **Step 5: Commit the script and the generated files**

The two generated files are committed deliberately: they are build outputs of a step that requires a 600 MB model download, and everything downstream (engine, api, the whole frontend) needs them present.

```bash
git add Backend/build_style_index.py Backend/index/style.parquet Backend/index/axis_quantiles.npy
git commit -m "feat(backend): build the style sidecar

Projects all 20k catalog embeddings into the 9-dim StyleVector space and
derives category/colour/formality/seasons. Written as a sidecar keyed on
article_id with one row per catalog row, in catalog order -- embeddings.npy is
positionally aligned with catalog.parquet, so filtering here would silently
desynchronise them.

Spot-check of top/bottom 10 per axis: <record what you observed>"
```

---

## Task 6: `Backend/engine.py` — join the sidecar, mask exclusions, project profiles

Implements spec §7 (engine changes). The critical invariant: the join must preserve row **order and count**.

**Files:**
- Modify: `Backend/engine.py` (lines 54-63 `__init__`, 127-160 `recommend`)
- Test: `Backend/tests/test_engine.py` (create)

**Interfaces:**
- Consumes: `index/style.parquet` and `index/axis_quantiles.npy` (Task 5); `axes.raw_scores`, `axes.percentile_rank`, `axes.prompt_texts`, `axes.STYLE_DIMENSIONS` (Task 3).
- Produces:
  - `StyleEngine.style` — the joined sidecar DataFrame, same length and order as `self.catalog`.
  - `StyleEngine.catalog` gains the sidecar columns (`category`, `colour_family`, `formality`, `seasons`, `recommendable`, and the 9 axis columns), so `recommend()`'s returned rows carry them and `_to_profile_item` can read them straight off the row.
  - `StyleEngine.axis_quantiles: np.ndarray` — `[9, 101]`.
  - `StyleEngine.project_profile(vec: np.ndarray) -> list[float]` — returns 9 floats in `[0, 1]`, percentile-ranked against the same catalog breakpoints. Lazily embeds and caches the 18 prompt vectors on first call.
  - `recommend()` returns only rows where `recommendable` is true.

- [ ] **Step 1: Write the failing test**

Create `Backend/tests/test_engine.py`:

```python
"""Engine tests against the REAL index, with the model stubbed out."""
import sys
from pathlib import Path

import numpy as np
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import axes  # noqa: E402
import engine  # noqa: E402

EMB_DIM = 512
INDEX = str(BACKEND_DIR / "index")


@pytest.fixture
def eng(monkeypatch):
    monkeypatch.setattr(engine.StyleEngine, "_load_model", lambda self: None)
    monkeypatch.setattr(
        engine.StyleEngine,
        "embed_texts",
        lambda self, texts: engine._normalize(
            np.random.default_rng(1).normal(size=(len(list(texts)), EMB_DIM)).astype(np.float32)
        ),
    )
    return engine.StyleEngine(INDEX, load_model=False)


def test_sidecar_joins_without_changing_row_count_or_order(eng):
    assert len(eng.catalog) == len(eng.emb), "join desynchronised catalog from embeddings"
    assert len(eng.style) == len(eng.catalog)
    assert (eng.style["article_id"].to_numpy() == eng.catalog["article_id"].to_numpy()).all()


def test_catalog_carries_the_derived_columns(eng):
    for col in ["category", "colour_family", "formality", "seasons", "recommendable"]:
        assert col in eng.catalog.columns, col
    for dim in axes.STYLE_DIMENSIONS:
        assert dim in eng.catalog.columns, dim


def test_axis_quantiles_are_loaded(eng):
    assert eng.axis_quantiles.shape == (9, 101)


def test_recommend_returns_only_recommendable_rows(eng):
    profile = engine._normalize(
        np.random.default_rng(7).normal(size=(1, EMB_DIM)).astype(np.float32)
    )
    recs = eng.recommend(profile, n=40)
    assert len(recs) > 0
    assert recs["recommendable"].all()
    assert recs["category"].ne("").all()


def test_recommend_still_honours_exclude_ids(eng):
    profile = engine._normalize(
        np.random.default_rng(8).normal(size=(1, EMB_DIM)).astype(np.float32)
    )
    first = eng.recommend(profile, n=10)
    excluded = set(first["article_id"].tolist()[:5])
    second = eng.recommend(profile, n=10, exclude_ids=excluded)
    assert not (set(second["article_id"].tolist()) & excluded)


def test_project_profile_returns_nine_bounded_floats(eng):
    profile = engine._normalize(
        np.random.default_rng(9).normal(size=(1, EMB_DIM)).astype(np.float32)
    )
    vec = eng.project_profile(profile)
    assert isinstance(vec, list) and len(vec) == 9
    assert all(isinstance(v, float) for v in vec)
    assert all(0.0 <= v <= 1.0 for v in vec)


def test_project_profile_caches_the_prompt_embeddings(eng, monkeypatch):
    calls = {"n": 0}
    real = eng.embed_texts

    def counting(texts):
        calls["n"] += 1
        return real(texts)

    monkeypatch.setattr(eng, "embed_texts", counting)
    profile = engine._normalize(
        np.random.default_rng(10).normal(size=(1, EMB_DIM)).astype(np.float32)
    )
    eng.project_profile(profile)
    eng.project_profile(profile)
    assert calls["n"] == 1, "prompt embeddings must be embedded once and cached"
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd Backend && .venv/bin/python -m pytest tests/test_engine.py -v
```

Expected: FAIL — `AttributeError: 'StyleEngine' object has no attribute 'style'`

- [ ] **Step 3: Modify `StyleEngine.__init__`**

Replace lines 55-63 of `Backend/engine.py`:

```python
    def __init__(self, index_dir="index", load_model: bool = True):
        index_dir = Path(index_dir)
        self.emb = np.load(index_dir / "embeddings.npy")            # [N, d], L2-normalized
        self.catalog = pd.read_parquet(index_dir / "catalog.parquet")
        assert len(self.emb) == len(self.catalog), "index files are out of sync"
        self.id_to_row = {a: i for i, a in enumerate(self.catalog["article_id"])}
        self._model = self._processor = self._device = None
        if load_model:
            self._load_model()
```

with:

```python
    def __init__(self, index_dir="index", load_model: bool = True):
        index_dir = Path(index_dir)
        self.emb = np.load(index_dir / "embeddings.npy")            # [N, d], L2-normalized
        self.catalog = pd.read_parquet(index_dir / "catalog.parquet")
        assert len(self.emb) == len(self.catalog), "index files are out of sync"

        # Sidecar (built by build_style_index.py). A LEFT join on a de-duplicated
        # right side cannot add or reorder rows, so `self.emb` stays positionally
        # aligned with `self.catalog` -- which recommend() depends on absolutely.
        self.style = self._load_sidecar(index_dir)
        self.axis_quantiles = np.load(index_dir / "axis_quantiles.npy")
        assert self.axis_quantiles.shape == (len(axes.STYLE_DIMENSIONS), axes.N_BREAKPOINTS)

        self.id_to_row = {a: i for i, a in enumerate(self.catalog["article_id"])}
        self._model = self._processor = self._device = None
        self._axis_text_vecs = None          # lazily embedded on first project_profile
        if load_model:
            self._load_model()

    def _load_sidecar(self, index_dir: Path) -> pd.DataFrame:
        style = pd.read_parquet(index_dir / "style.parquet")
        style = style.drop_duplicates(subset="article_id", keep="first")

        before = len(self.catalog)
        merged = self.catalog.merge(style, on="article_id", how="left", validate="m:1")
        assert len(merged) == before, "sidecar join changed the row count"

        # A row missing from the sidecar is not recommendable: we have no vector
        # for it, so it can never be ranked or mapped to a Product.
        merged["recommendable"] = merged["recommendable"].fillna(False).astype(bool)
        merged["category"] = merged["category"].fillna("")
        merged["colour_family"] = merged["colour_family"].fillna("neutral")
        merged["formality"] = merged["formality"].fillna(3).astype(int)
        merged["seasons"] = merged["seasons"].fillna("spring,summer,fall,winter")
        for dim in axes.STYLE_DIMENSIONS:
            merged[dim] = merged[dim].fillna(0.5).astype(np.float32)

        self.catalog = merged
        cols = ["article_id", "category", "colour_family", "formality",
                "seasons", "recommendable", *axes.STYLE_DIMENSIONS]
        return merged[cols]
```

Add the import at the top of the file, after `import pandas as pd`:

```python
import axes
```

- [ ] **Step 4: Fold `recommendable` into the recommend mask**

In `Backend/engine.py`, replace the mask construction inside `recommend` (lines 134-141):

```python
        profile = np.atleast_2d(profile)
        mask = np.ones(len(self.emb), dtype=bool)
        if groups is not None:
            mask &= self.catalog["product_group_name"].isin(groups).to_numpy()
```

with:

```python
        profile = np.atleast_2d(profile)
        # Exclusion is a MASK, never a filter of self.catalog: self.emb is
        # positionally aligned with it and dropping rows would silently return
        # the wrong garments.
        mask = self.catalog["recommendable"].to_numpy(dtype=bool).copy()
        if groups is not None:
            mask &= self.catalog["product_group_name"].isin(groups).to_numpy()
```

- [ ] **Step 5: Add `project_profile`**

Append to `StyleEngine`, immediately after `style_breakdown`:

```python
    def _axis_prompt_vectors(self) -> np.ndarray:
        """[18, d] prompt embeddings in axes.prompt_texts() order. Embedded once
        per process: the prompts are constant, and a CLIP text forward pass per
        profile read would dominate the request."""
        if self._axis_text_vecs is None:
            self._axis_text_vecs = self.embed_texts(axes.prompt_texts())
        return self._axis_text_vecs

    def project_profile(self, profile: np.ndarray) -> list:
        """Projects a profile into the frontend's 9-dim StyleVector space,
        percentile-ranked against the SAME catalog breakpoints the per-item
        vectors were ranked against -- so profile and product vectors are
        directly comparable by cosine similarity on the client."""
        v = _normalize(np.atleast_2d(profile).mean(0, keepdims=True))
        raw = axes.raw_scores(v, self._axis_prompt_vectors())
        ranks = axes.percentile_rank(raw, self.axis_quantiles)
        return [float(x) for x in ranks[0]]
```

- [ ] **Step 6: Run the engine tests**

```bash
cd Backend && .venv/bin/python -m pytest tests/test_engine.py -v
```

Expected: 7 passed.

- [ ] **Step 7: Confirm the existing suite is still green**

```bash
cd Backend && .venv/bin/python -m pytest tests/ -v
```

Expected: all PASS. `test_api.py` exercises `/profiles/{id}/next`, which now goes through the new mask — if it fails, the join is wrong, not the test.

- [ ] **Step 8: Commit**

```bash
git add Backend/engine.py Backend/tests/test_engine.py
git commit -m "feat(backend): join the style sidecar and mask non-recommendable items

The join is a validated m:1 left join with an explicit row-count assertion:
embeddings.npy is positionally aligned with catalog.parquet, so any row
addition, loss, or reorder here would silently return the wrong garments while
the existing len() assert still passed.

Adds project_profile(), which ranks a profile against the same catalog
breakpoints as the per-item vectors, making the two directly comparable."
```

---

## Task 7: `Backend/api.py` — new fields, `/catalog/{id}`, 3-photo floor, delete `/sessions`

Implements spec §7 (api changes, D1, D6).

**Files:**
- Modify: `Backend/api.py`
- Modify: `Backend/tests/test_api.py`

**Interfaces:**
- Consumes: `StyleEngine.project_profile` and the sidecar columns now on `eng.catalog` (Task 6).
- Produces the wire contract the client (Task 8) types against:

```
ProfileItem  { article_id: str, name: str|null, product_type: str|null,
               colour: str|null, description: str|null, image_url: str,
               buy_url: str, category: str, colour_family: str,
               formality: int, seasons: list[str], vector: list[float] }   # 9
ProfileOut   { profile_id: str, name: str, n_refs: int,
               references: [{ ref_id: str, image_url: str }] }
ProfileDetail{ profile_id: str, name: str, n_refs: int, n_swipes: int,
               n_liked: int, style_breakdown: dict[str, float],
               vector: list[float] }                                        # 9
NextOut      { items: ProfileItem[] }
SwipeOut     { n_swipes: int }
GET /catalog/{article_id} -> ProfileItem      (404 on unknown id)
```

- [ ] **Step 1: Write the failing tests**

Append to `Backend/tests/test_api.py`:

```python
def test_profile_items_carry_product_fields(client):
    profile_id = _create_profile(client)
    r = client.get(f"/profiles/{profile_id}/next", params={"n": 5})
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 5
    for item in items:
        assert item["category"] in {
            "top", "bottom", "outerwear", "footwear", "knitwear", "accessory"
        }
        assert item["colour_family"] in {"neutral", "warm", "cool", "earth", "bold"}
        assert 1 <= item["formality"] <= 5
        assert item["seasons"] and set(item["seasons"]) <= {
            "spring", "summer", "fall", "winter"
        }
        assert len(item["vector"]) == 9
        assert all(0.0 <= v <= 1.0 for v in item["vector"])


def test_profile_detail_carries_a_nine_dim_vector(client):
    profile_id = _create_profile(client)
    r = client.get(f"/profiles/{profile_id}")
    assert r.status_code == 200
    vector = r.json()["vector"]
    assert len(vector) == 9
    assert all(0.0 <= v <= 1.0 for v in vector)


def test_create_profile_returns_reference_urls(client):
    r = client.post(
        "/profiles",
        data={"name": "Ref test"},
        files=[("files", (f"p{i}.jpg", _fake_image_bytes(), "image/jpeg")) for i in range(3)],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["n_refs"] == 3
    assert len(body["references"]) == 3
    for ref in body["references"]:
        assert ref["ref_id"]
        assert ref["image_url"].startswith("http")
        assert "/references/" in ref["image_url"]


def test_three_photos_is_accepted(client):
    r = client.post(
        "/profiles",
        data={"name": "Three"},
        files=[("files", (f"p{i}.jpg", _fake_image_bytes(), "image/jpeg")) for i in range(3)],
    )
    assert r.status_code == 200


def test_two_photos_is_rejected(client):
    r = client.post(
        "/profiles",
        data={"name": "Two"},
        files=[("files", (f"p{i}.jpg", _fake_image_bytes(), "image/jpeg")) for i in range(2)],
    )
    assert r.status_code == 400


def test_catalog_item_lookup_returns_a_profile_item(client):
    profile_id = _create_profile(client)
    first = client.get(f"/profiles/{profile_id}/next", params={"n": 1}).json()["items"][0]

    r = client.get(f"/catalog/{first['article_id']}")
    assert r.status_code == 200
    assert r.json()["article_id"] == first["article_id"]
    assert r.json()["category"] == first["category"]
    assert r.json()["vector"] == first["vector"]


def test_catalog_item_lookup_404s_on_unknown_id(client):
    assert client.get("/catalog/0000000000").status_code == 404


def test_sessions_endpoints_are_gone(client):
    assert client.post("/sessions/from-photos").status_code == 404
    assert client.get("/sessions/abc").status_code == 404
    assert client.get("/sessions/abc/recommendations").status_code == 404
    assert client.post("/sessions/abc/feedback", json={}).status_code == 404


def test_health_reports_profiles_not_sessions(client):
    body = client.get("/health").json()
    assert "sessions" not in body
    assert "profiles" in body
```

Add this helper near the top of `Backend/tests/test_api.py`, just below `_fake_image_bytes`:

```python
def _create_profile(client, name: str = "Test", n: int = 3) -> str:
    r = client.post(
        "/profiles",
        data={"name": name},
        files=[("files", (f"p{i}.jpg", _fake_image_bytes(), "image/jpeg")) for i in range(n)],
    )
    assert r.status_code == 200, r.text
    return r.json()["profile_id"]
```

Then delete every existing test in the file that exercises a `/sessions/*` endpoint, and rewrite any existing `/profiles` test that posts 5 photos to use `_create_profile(client)` instead.

- [ ] **Step 2: Run them to make sure they fail**

```bash
cd Backend && .venv/bin/python -m pytest tests/test_api.py -v
```

Expected: the new tests FAIL — `KeyError: 'category'`, `assert 400 == 200` for three photos, `404` for `/catalog/{id}` because the route does not exist, and `test_sessions_endpoints_are_gone` fails because the routes still answer.

- [ ] **Step 3: Extend the schemas**

In `Backend/api.py`, replace the `ProfileItem`, `ProfileOut`, and `ProfileDetail` models:

```python
class ProfileItem(BaseModel):
    article_id: str
    name: Optional[str] = None
    product_type: Optional[str] = None
    colour: Optional[str] = None
    description: Optional[str] = None
    image_url: str
    buy_url: str
    category: str
    colour_family: str
    formality: int
    seasons: List[str]
    vector: List[float]


class ProfileOut(BaseModel):
    profile_id: str
    name: str
    n_refs: int
    references: List["ReferencePhotoOut"] = []


class ProfileDetail(BaseModel):
    profile_id: str
    name: str
    n_refs: int
    n_swipes: int
    n_liked: int
    style_breakdown: Dict[str, float]
    vector: List[float]
```

`ProfileOut` forward-references `ReferencePhotoOut`, which is declared further down the file. Move the existing `ReferencePhotoOut` declaration **above** `ProfileItem` so the reference resolves without a `model_rebuild()` call:

```python
class ReferencePhotoOut(BaseModel):
    ref_id: str
    image_url: str
```

(and delete its later duplicate declaration).

- [ ] **Step 4: Lower the photo floor**

Replace line 48:

```python
MIN_PROFILE_PHOTOS = 5
```

with:

```python
# 3, not 5: app/onboarding/index.tsx asks for 3-8 photos, and a user following
# the UI's own instructions was getting a 400.
MIN_PROFILE_PHOTOS = 3
```

- [ ] **Step 5: Populate the new fields in `_to_profile_item`**

Replace `_to_profile_item`:

```python
def _to_profile_item(row, base_url: str) -> ProfileItem:
    seasons = str(row.get("seasons") or "")
    return ProfileItem(
        article_id=row["article_id"],
        name=_clean(row.get("prod_name")),
        product_type=_clean(row.get("product_type_name")),
        colour=_clean(row.get("colour_group_name")),
        description=_clean(row.get("detail_desc")),
        image_url=f"{base_url}thumbs/{row['image_rel']}",
        buy_url=_buy_url(row["article_id"]),
        category=str(row.get("category") or "top"),
        colour_family=str(row.get("colour_family") or "neutral"),
        formality=int(row.get("formality") or 3),
        seasons=[s for s in seasons.split(",") if s],
        vector=[float(row[dim]) for dim in axes.STYLE_DIMENSIONS],
    )
```

Add the import beside the existing `from engine import StyleEngine`:

```python
import axes
```

- [ ] **Step 6: Return reference URLs from `POST /profiles`**

Replace the tail of `create_profile` (the loop and the return):

```python
    profile_id, _ = DB.create_profile(name)
    references = []
    base = str(request.base_url)
    for img, vec in zip(images, vecs):
        ref_id, rel_path = DB.add_reference_photo(profile_id, vec)
        dest = DB.refs_dir / rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest, format="JPEG", quality=85)
        references.append(
            ReferencePhotoOut(ref_id=ref_id, image_url=f"{base}references/{rel_path}")
        )

    return ProfileOut(
        profile_id=profile_id,
        name=name,
        n_refs=len(images),
        references=references,
    )
```

- [ ] **Step 7: Add the profile vector to `GET /profiles/{id}`**

Replace the return of `get_profile`:

```python
    return ProfileDetail(
        profile_id=profile_id,
        name=row["name"],
        n_refs=DB.count_reference_photos(profile_id),
        n_swipes=DB.count_swipes(profile_id),
        n_liked=DB.count_liked(profile_id),
        style_breakdown=_breakdown(eng, profile_vec),
        vector=eng.project_profile(profile_vec),
    )
```

- [ ] **Step 8: Add `GET /catalog/{article_id}`**

Insert immediately after the existing `catalog_groups` endpoint. It must be declared **after** `/catalog/groups` so the literal path wins over the parameterised one:

```python
@app.get("/catalog/{article_id}", response_model=ProfileItem)
def catalog_item(article_id: str, request: Request):
    """Single-item lookup. The client's product-detail screen and its persisted
    closet both hold article_ids that will not be in the current /next slice."""
    eng = _engine(request)
    r = eng.id_to_row.get(article_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Unknown article_id")
    return _to_profile_item(eng.catalog.iloc[r], str(request.base_url))
```

- [ ] **Step 9: Delete the entire `/sessions` surface**

From `Backend/api.py`, delete:

- the models `Item`, `SessionOut`, `RecsOut`, `ArticlesIn`, `FeedbackIn`, `FeedbackOut`
- the `@dataclass class Session` and `SESSIONS: Dict[str, Session] = {}`
- the helpers `_get_session`, `_new_session`, `_to_item`
- the endpoints `session_from_photos`, `session_from_articles`, `get_session`, `recommendations`, `feedback`
- the constant `MAX_PHOTOS = 12`
- the now-unused imports `uuid`, `dataclass`, `field`, `Set`, and `Query`/`Form`/`File`/`UploadFile` **only if** nothing else uses them (`create_profile` still uses `Form`, `File`, `UploadFile`; `next_items` still uses `Query`)

Replace the `/health` body:

```python
@app.get("/health")
def health(request: Request):
    return {
        "status": "ok",
        "catalog_size": len(_engine(request).catalog),
        "profiles": len(DB.list_profiles()),
    }
```

Update the module docstring's `Flow:` block:

```
Flow:
    1. POST /profiles                       (name + 3..15 photos)
       -> persisted profile_id + reference image URLs
    2. GET  /profiles/{id}/next             -> ranked items, swiped ones excluded
    3. POST /profiles/{id}/swipe            -> the profile vector moves
       -> call step 2 again for a fresh batch
```

And delete the stale comment above the `/profiles` section:

```python
# Persistent counterpart to /sessions, backed by SQLite (see db.py). Kept
# alongside /sessions until the frontend switches over to this contract.
```

- [ ] **Step 10: Run the API tests**

```bash
cd Backend && .venv/bin/python -m pytest tests/test_api.py -v
```

Expected: all PASS, including `test_sessions_endpoints_are_gone`.

- [ ] **Step 11: Run the whole backend suite**

```bash
cd Backend && .venv/bin/python -m pytest tests/ -v
```

Expected: all PASS.

```bash
cd Backend && grep -rn "SESSIONS\|/sessions\|_new_session\|_to_item\b" api.py tests/
```

Expected: no output.

- [ ] **Step 12: Smoke-test the live server**

```bash
cd Backend && .venv/bin/python -m uvicorn api:app --port 8000 &
sleep 60
curl -s localhost:8000/health
curl -s localhost:8000/catalog/groups | head -c 200
```

Expected: `{"status":"ok","catalog_size":20000,"profiles":0}` and a groups map. Then kill the server.

- [ ] **Step 13: Commit**

```bash
git add Backend/api.py Backend/tests/test_api.py
git commit -m "feat(backend): product fields on ProfileItem, /catalog/{id}, 3-photo floor

Deletes the whole /sessions surface: it was in-memory and ephemeral, /profiles
is SQLite-backed and strictly better, and nothing referenced /sessions.

MIN_PROFILE_PHOTOS drops 5 -> 3 so a user following the onboarding UI's own
'3-8 photos' instruction no longer gets a 400."
```

---

## Task 8: `lib/backend.ts`, the mapper, and the provider

Implements spec §8 (new client modules). No component touches these yet — this task is pure, testable plumbing.

**Files:**
- Create: `lib/backend.ts`
- Create: `lib/catalog/backendMapper.ts`
- Create: `lib/catalog/backendProvider.ts`
- Create: `lib/catalog/index.ts`
- Create: `__tests__/fixtures/profileItem.json`
- Create: `__tests__/backendMapper.test.ts`

**Interfaces:**
- Consumes: the wire contract from Task 7; `Product`, `Category`, `ColorFamily`, `Formality`, `Season`, `StyleVector`, `STYLE_DIMENSIONS` from `lib/types.ts`; `ProductProvider`, `ProductQuery` from `lib/catalog/provider.ts` (Task 1); `seededProvider`, `ALL_PRODUCTS` from `lib/catalog/seeded.ts`.
- Produces:
  - `lib/backend.ts`: `backendEnabled(): boolean`; `backendBaseUrl(): string | null`; `createProfile(name, uris) → Promise<{ profile: BackendProfileOut | null; degraded: boolean }>`; `getProfile(id) → Promise<{ detail: BackendProfileDetail | null; degraded: boolean }>`; `getNext(id, n) → Promise<{ items: BackendProfileItem[]; degraded: boolean }>`; `swipe(id, articleId, liked) → Promise<{ degraded: boolean }>`; `getCatalogItem(articleId) → Promise<{ item: BackendProfileItem | null; degraded: boolean }>`. Plus the exported types `BackendProfileItem`, `BackendProfileOut`, `BackendProfileDetail`, `BackendReference`.
  - `lib/catalog/backendMapper.ts`: `mapProfileItemToProduct(item: BackendProfileItem): Product`; `arrayToStyleVector(values: number[]): StyleVector`.
  - `lib/catalog/backendProvider.ts`: `makeBackendProvider(profileId: string): ProductProvider`.
  - `lib/catalog/index.ts`: `activeProvider(profileId: string | null): ProductProvider`; re-exports `ALL_PRODUCTS` as `FALLBACK_PRODUCTS`.

- [ ] **Step 1: Write the fixture**

Create `__tests__/fixtures/profileItem.json` — a real `/profiles/{id}/next` item shape:

```json
{
  "article_id": "0108775015",
  "name": "Strap top",
  "product_type": "Vest top",
  "colour": "Black",
  "description": "Jersey top with narrow shoulder straps.",
  "image_url": "http://localhost:8000/thumbs/010/0108775015.jpg",
  "buy_url": "https://www2.hm.com/en_us/productpage.0108775015.html",
  "category": "top",
  "colour_family": "neutral",
  "formality": 2,
  "seasons": ["spring", "summer"],
  "vector": [0.81, 0.34, 0.12, 0.05, 0.22, 0.18, 0.09, 0.11, 0.64]
}
```

- [ ] **Step 2: Write the failing mapper test**

Create `__tests__/backendMapper.test.ts`:

```ts
import { mapProfileItemToProduct } from '@/lib/catalog/backendMapper';
import { STYLE_DIMENSIONS } from '@/lib/types';
import type { BackendProfileItem } from '@/lib/backend';

import fixture from './fixtures/profileItem.json';

const item = fixture as BackendProfileItem;

describe('mapProfileItemToProduct', () => {
  it('maps every field of a real backend item', () => {
    const p = mapProfileItemToProduct(item);

    expect(p.id).toBe('0108775015');
    expect(p.name).toBe('Strap top');
    expect(p.brand).toBe('H&M');
    expect(p.imageUri).toBe('http://localhost:8000/thumbs/010/0108775015.jpg');
    expect(p.url).toBe('https://www2.hm.com/en_us/productpage.0108775015.html');
    expect(p.description).toBe('Jersey top with narrow shoulder straps.');
    expect(p.category).toBe('top');
    expect(p.color).toBe('black');
    expect(p.colorFamily).toBe('neutral');
    expect(p.formality).toBe(2);
    expect(p.seasons).toEqual(['spring', 'summer']);
  });

  it('rebuilds the 9-dim vector in STYLE_DIMENSIONS order', () => {
    const p = mapProfileItemToProduct(item);
    STYLE_DIMENSIONS.forEach((dim, i) => {
      expect(p.vector[dim]).toBeCloseTo(item.vector[i], 6);
    });
  });

  it('produces no price field', () => {
    expect('price' in mapProfileItemToProduct(item)).toBe(false);
  });

  it('falls back safely on nulls and out-of-range values', () => {
    const p = mapProfileItemToProduct({
      ...item,
      name: null,
      colour: null,
      description: null,
      category: 'not-a-category',
      colour_family: 'not-a-family',
      formality: 99,
      seasons: [],
      vector: [],
    } as unknown as BackendProfileItem);

    expect(p.name).toBe('0108775015');
    expect(p.color).toBe('unknown');
    expect(p.description).toBe('');
    expect(p.category).toBe('top');
    expect(p.colorFamily).toBe('neutral');
    expect(p.formality).toBe(3);
    expect(p.seasons).toEqual(['spring', 'summer', 'fall', 'winter']);
    STYLE_DIMENSIONS.forEach((dim) => expect(p.vector[dim]).toBe(0.5));
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx jest __tests__/backendMapper.test.ts`
Expected: FAIL — `Cannot find module '@/lib/catalog/backendMapper'`

- [ ] **Step 4: Write `lib/backend.ts`**

```ts
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
```

- [ ] **Step 5: Write `lib/catalog/backendMapper.ts`**

```ts
// lib/catalog/backendMapper.ts — pure BackendProfileItem → Product mapping.
// Hard constraint: zero React / React Native / Expo imports, and no network.
// Kept separate from backendProvider.ts precisely so it is testable against a
// committed fixture with no fetch in sight.

import type { BackendProfileItem } from '@/lib/backend';
import {
  CATEGORIES,
  COLOR_FAMILIES,
  SEASONS,
  STYLE_DIMENSIONS,
  type Category,
  type ColorFamily,
  type Formality,
  type Product,
  type Season,
  type StyleVector,
} from '@/lib/types';

const CATEGORY_SET = new Set<string>(CATEGORIES);
const FAMILY_SET = new Set<string>(COLOR_FAMILIES);
const SEASON_SET = new Set<string>(SEASONS);

/** Middle of every axis — the honest answer when the backend sent no vector. */
const NEUTRAL_AXIS = 0.5;

function toCategory(value: string): Category {
  return CATEGORY_SET.has(value) ? (value as Category) : 'top';
}

function toColorFamily(value: string): ColorFamily {
  return FAMILY_SET.has(value) ? (value as ColorFamily) : 'neutral';
}

function toFormality(value: number): Formality {
  const n = Math.round(value);
  return (n >= 1 && n <= 5 ? n : 3) as Formality;
}

function toSeasons(values: string[]): Season[] {
  const kept = (values ?? []).filter((s): s is Season => SEASON_SET.has(s));
  // An item with no season is unwearable; fall back to all-year.
  return kept.length > 0 ? kept : [...SEASONS];
}

/**
 * Exported, not private: the backend sends the 9 axes as a bare array in
 * STYLE_DIMENSIONS order in two places — on each catalogue item and on the
 * profile detail — and `analyzing.tsx` (Task 12) needs the profile one.
 */
export function arrayToStyleVector(values: number[]): StyleVector {
  const vector = {} as StyleVector;
  STYLE_DIMENSIONS.forEach((dim, i) => {
    const v = values?.[i];
    vector[dim] = typeof v === 'number' && Number.isFinite(v) ? v : NEUTRAL_AXIS;
  });
  return vector;
}

export function mapProfileItemToProduct(item: BackendProfileItem): Product {
  return {
    id: item.article_id,
    // The catalogue is H&M's; there is no per-item brand column.
    brand: 'H&M',
    name: item.name ?? item.article_id,
    imageUri: item.image_url,
    url: item.buy_url,
    description: item.description ?? '',
    category: toCategory(item.category),
    color: (item.colour ?? 'unknown').toLowerCase(),
    colorFamily: toColorFamily(item.colour_family),
    formality: toFormality(item.formality),
    seasons: toSeasons(item.seasons),
    vector: arrayToStyleVector(item.vector),
  };
}
```

- [ ] **Step 6: Run the mapper test**

Run: `npx jest __tests__/backendMapper.test.ts`
Expected: 4 passed.

If jest complains about importing JSON, add `"resolveJsonModule": true` to `compilerOptions` in `tsconfig.json`.

- [ ] **Step 7: Write `lib/catalog/backendProvider.ts`**

```ts
// lib/catalog/backendProvider.ts — ProductProvider over /profiles/{id}/next.
// Hard constraint: zero React / React Native / Expo imports.

import { getNext } from '@/lib/backend';
import { mapProfileItemToProduct } from '@/lib/catalog/backendMapper';
import type { ProductProvider, ProductQuery } from '@/lib/catalog/provider';
import type { Product } from '@/lib/types';

/** One page of `/next`. 100 is the endpoint's documented ceiling. */
export const FEED_SIZE = 100;

export function makeBackendProvider(profileId: string): ProductProvider {
  async function pool(): Promise<Product[]> {
    const { items } = await getNext(profileId, FEED_SIZE);
    return items.map(mapProfileItemToProduct);
  }

  return {
    all: pool,

    // Client-side filtering of the ranked pool, matching seededProvider.search's
    // semantics. No text-search endpoint is added: FashionCLIP could serve one
    // via embed_texts, but nothing in the app calls search() today and a
    // retrieval path with no consumer is speculative. When a search UI exists,
    // POST /profiles/{id}/search is its natural home.
    async search(query: ProductQuery): Promise<Product[]> {
      let results = await pool();

      if (query.category !== undefined) {
        results = results.filter((p) => p.category === query.category);
      }

      if (query.text !== undefined && query.text.length > 0) {
        const needle = query.text.toLowerCase();
        results = results.filter((p) =>
          `${p.name} ${p.brand} ${p.description}`.toLowerCase().includes(needle),
        );
      }

      return results;
    },
  };
}
```

- [ ] **Step 8: Write `lib/catalog/index.ts`**

```ts
// lib/catalog/index.ts — the single place that decides which provider is live.
// Nothing above lib/catalog/ imports seeded.ts or backendProvider.ts directly;
// this is the enforcement point the ProductProvider seam always intended.

import { backendEnabled } from '@/lib/backend';
import { makeBackendProvider } from '@/lib/catalog/backendProvider';
import { ALL_PRODUCTS, seededProvider } from '@/lib/catalog/seeded';
import type { ProductProvider } from '@/lib/catalog/provider';

/** The static catalogue, used whenever the backend is off or unreachable. */
export const FALLBACK_PRODUCTS = ALL_PRODUCTS;

export { seededProvider };
export type { ProductProvider, ProductQuery } from '@/lib/catalog/provider';

/**
 * The backend provider needs a profile id, so a profile that predates the
 * backend (or was created while it was down) correctly stays on the seeded
 * catalogue rather than erroring.
 */
export function activeProvider(profileId: string | null): ProductProvider {
  if (profileId && backendEnabled()) return makeBackendProvider(profileId);
  return seededProvider;
}
```

- [ ] **Step 9: Typecheck and run the suite**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx jest`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/backend.ts lib/catalog/backendMapper.ts lib/catalog/backendProvider.ts lib/catalog/index.ts __tests__/backendMapper.test.ts __tests__/fixtures/profileItem.json
git commit -m "feat: backend client, product mapper and provider

Nothing consumes these yet. The mapper is split from the provider so it is
testable against a committed fixture with no network. EXPO_PUBLIC_BACKEND_URL
unset means no fetch is issued at all, not a failed fetch."
```

---

## Task 9: `blendWithPrior` — the decaying questionnaire prior

Implements spec §6 (D7). Pure maths, no network, no store.

**Note on placement:** spec §8 files this under `lib/profile.ts`. It belongs in `lib/vector.ts` instead — it is a vector operation built on `blendVectors`, and `lib/profile.ts` is a single-purpose module that assembles a `StyleProfile`. `buildStyleProfile` in `lib/profile.ts` still gains the optional argument, exactly as the spec describes; only the helper's home moves.

**Files:**
- Modify: `lib/vector.ts`
- Modify: `lib/profile.ts`
- Test: `__tests__/blendWithPrior.test.ts` (create)

**Interfaces:**
- Consumes: `blendVectors`, `zeroVector`, `STYLE_DIMENSIONS` from `lib/vector.ts` / `lib/types.ts`.
- Produces:
  - `EVIDENCE_K = 4` (exported from `lib/vector.ts`)
  - `evidenceWeight(nRefs: number, nSwipes: number): number` — `n / (n + EVIDENCE_K)`, clamped to `[0, 1]`
  - `blendWithPrior(clip: StyleVector, questionnaire: StyleVector, nRefs: number, nSwipes: number): StyleVector`
  - `buildStyleProfile({ attributes, questionnaire, clip? })` where `clip?: { vector: StyleVector; nRefs: number; nSwipes: number }`

- [ ] **Step 1: Write the failing test**

Create `__tests__/blendWithPrior.test.ts`:

```ts
import { EVIDENCE_K, blendWithPrior, evidenceWeight, zeroVector } from '@/lib/vector';
import { STYLE_DIMENSIONS, type StyleVector } from '@/lib/types';

function filled(value: number): StyleVector {
  const v = zeroVector();
  for (const d of STYLE_DIMENSIONS) v[d] = value;
  return v;
}

const CLIP = filled(1);
const QUESTIONNAIRE = filled(0);

describe('evidenceWeight', () => {
  it('is zero with no evidence', () => {
    expect(evidenceWeight(0, 0)).toBe(0);
  });

  it('matches n / (n + K)', () => {
    expect(evidenceWeight(3, 0)).toBeCloseTo(3 / (3 + EVIDENCE_K), 6);
    expect(evidenceWeight(8, 0)).toBeCloseTo(8 / (8 + EVIDENCE_K), 6);
    expect(evidenceWeight(8, 20)).toBeCloseTo(28 / (28 + EVIDENCE_K), 6);
  });

  it('hits the documented values from the design', () => {
    expect(evidenceWeight(3, 0)).toBeCloseTo(0.43, 2);
    expect(evidenceWeight(8, 0)).toBeCloseTo(0.67, 2);
    expect(evidenceWeight(8, 20)).toBeCloseTo(0.88, 2);
  });

  it('is monotone increasing in evidence', () => {
    const weights = [0, 1, 2, 5, 10, 50, 500].map((n) => evidenceWeight(n, 0));
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeGreaterThan(weights[i - 1]);
    }
  });

  it('approaches but never exceeds 1', () => {
    expect(evidenceWeight(100000, 0)).toBeGreaterThan(0.99);
    expect(evidenceWeight(100000, 0)).toBeLessThanOrEqual(1);
  });

  it('treats negative counts as zero', () => {
    expect(evidenceWeight(-5, -5)).toBe(0);
  });
});

describe('blendWithPrior', () => {
  it('returns the questionnaire exactly when there is no evidence', () => {
    const out = blendWithPrior(CLIP, QUESTIONNAIRE, 0, 0);
    for (const d of STYLE_DIMENSIONS) expect(out[d]).toBeCloseTo(0, 6);
  });

  it('weights the two vectors by w and 1-w', () => {
    const out = blendWithPrior(CLIP, QUESTIONNAIRE, 4, 0);
    // n = 4, K = 4 -> w = 0.5
    for (const d of STYLE_DIMENSIONS) expect(out[d]).toBeCloseTo(0.5, 6);
  });

  it('moves monotonically toward the clip vector as evidence accumulates', () => {
    const values = [0, 2, 4, 10, 40].map((n) => blendWithPrior(CLIP, QUESTIONNAIRE, n, 0).minimalism);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('converges on the clip vector with overwhelming evidence', () => {
    const out = blendWithPrior(CLIP, QUESTIONNAIRE, 10000, 0);
    for (const d of STYLE_DIMENSIONS) expect(out[d]).toBeGreaterThan(0.99);
  });

  it('counts swipes and references identically', () => {
    const a = blendWithPrior(CLIP, QUESTIONNAIRE, 6, 2);
    const b = blendWithPrior(CLIP, QUESTIONNAIRE, 2, 6);
    for (const d of STYLE_DIMENSIONS) expect(a[d]).toBeCloseTo(b[d], 6);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx jest __tests__/blendWithPrior.test.ts`
Expected: FAIL — `EVIDENCE_K is not exported` / `blendWithPrior is not a function`

- [ ] **Step 3: Implement in `lib/vector.ts`**

Append immediately after `blendVectors`:

```ts
/**
 * How much evidence it takes before the CLIP projection outweighs the
 * questionnaire. At n = K the two are equal. Tunable once real projections
 * have been observed.
 */
export const EVIDENCE_K = 4;

/**
 * Fraction of the profile vector that should come from CLIP, given how much
 * the user has actually shown us. `w = n / (n + K)`.
 *
 * Zero evidence returns 0, which is why the backend-down path needs no special
 * case: it is the formula's natural endpoint, not an exception to it.
 */
export function evidenceWeight(nRefs: number, nSwipes: number): number {
  const n = Math.max(0, nRefs) + Math.max(0, nSwipes);
  if (n <= 0) return 0;
  return n / (n + EVIDENCE_K);
}

/**
 * Treats the questionnaire as a PRIOR that evidence displaces, rather than a
 * competitor to be discarded. A mean of 3 CLIP embeddings is noisy, and at that
 * floor the questionnaire genuinely is the better estimate — this says so.
 */
export function blendWithPrior(
  clip: StyleVector,
  questionnaire: StyleVector,
  nRefs: number,
  nSwipes: number,
): StyleVector {
  const w = evidenceWeight(nRefs, nSwipes);
  if (w <= 0) return { ...questionnaire };
  return blendVectors([
    { vector: clip, weight: w },
    { vector: questionnaire, weight: 1 - w },
  ]);
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx jest __tests__/blendWithPrior.test.ts`
Expected: 11 passed.

- [ ] **Step 5: Thread the optional clip argument through `buildStyleProfile`**

`lib/profile.ts` is written on long single lines. Replace the import line:

```ts
import { composeStyleVector } from '@/lib/vector';
```

with:

```ts
import { blendWithPrior, composeStyleVector, questionnaireToVector } from '@/lib/vector';
```

and add the type import for `StyleVector` to the existing `@/lib/types` import list.

Then replace the signature and the `vector` line inside `buildStyleProfile`. The current fragment:

```ts
export function buildStyleProfile({ attributes, questionnaire }: { attributes: ImageAttributes[]; questionnaire: Questionnaire }): StyleProfile { const colors = unique(attributes.flatMap((a) => a.colors)); const silhouettes = unique(attributes.flatMap((a) => a.fit)); const materials = unique(attributes.flatMap((a) => a.materials)); const influences = unique(attributes.flatMap((a) => a.style)); const vector = composeStyleVector(attributes, questionnaire);
```

becomes:

```ts
export function buildStyleProfile({ attributes, questionnaire, clip }: { attributes: ImageAttributes[]; questionnaire: Questionnaire; clip?: { vector: StyleVector; nRefs: number; nSwipes: number } }): StyleProfile { const colors = unique(attributes.flatMap((a) => a.colors)); const silhouettes = unique(attributes.flatMap((a) => a.fit)); const materials = unique(attributes.flatMap((a) => a.materials)); const influences = unique(attributes.flatMap((a) => a.style)); const vector = clip ? blendWithPrior(clip.vector, questionnaireToVector(questionnaire), clip.nRefs, clip.nSwipes) : composeStyleVector(attributes, questionnaire);
```

Note the deliberate asymmetry: when `clip` is present the prior is the **pure questionnaire vector**, not `composeStyleVector`'s image/questionnaire blend. Claude's `ImageAttributes` and the CLIP projection are two readings of the same photos; blending both in would double-count them. Claude keeps its own distinct responsibilities — `dominantColors`, `silhouettes`, `materials`, `influences`, and `deriveVibe`, which drives app-wide theming — all untouched below this line.

- [ ] **Step 6: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx jest`
Expected: clean, all PASS. `buildStyleProfile`'s existing callers pass no `clip` and are unaffected.

- [ ] **Step 7: Commit**

```bash
git add lib/vector.ts lib/profile.ts __tests__/blendWithPrior.test.ts
git commit -m "feat: decaying questionnaire prior for the profile vector

The questionnaire is a prior displaced by evidence, not a competitor. w =
n/(n+4) over references + swipes, so 3 photos gives w=0.43 (honest about how
noisy a 3-embedding mean is) and the backend-down path (n=0, w=0) is the
formula's natural endpoint rather than a special case."
```

---

## Task 10: Store catalog slice, `backendProfileId`, and persist v3

Implements spec §8 (store, D9).

**Files:**
- Modify: `lib/types.ts` (`ProfileRecord`)
- Modify: `lib/stateMigration.ts`
- Modify: `lib/profileRecords.ts`
- Modify: `store/useAppStore.ts`
- Modify: `store/selectors.ts`
- Test: `__tests__/stateMigrationV3.test.ts` (create)

**Interfaces:**
- Consumes: `activeProvider`, `FALLBACK_PRODUCTS` from `lib/catalog/index.ts` (Task 8); `getCatalogItem` from `lib/backend.ts`; `mapProfileItemToProduct` from `lib/catalog/backendMapper.ts`.
- Produces:
  - `ProfileRecord.backendProfileId: string | null`
  - `AppState.catalog: { feed: Product[]; byId: Record<string, Product>; status: 'idle' | 'loading' | 'ready' | 'degraded' }`
  - `AppActions.loadFeed(): Promise<void>`
  - `AppActions.resolveProducts(ids: string[]): Promise<void>`
  - `AppActions.setBackendProfileId(profileId: string, backendProfileId: string | null): void`
  - `migrateV2ToV3(state: PersistedStateV2): PersistedStateV3`
  - `selectCatalogById(s: AppState): Record<string, Product>`, `selectCatalogFeed(s: AppState): Product[]`, `selectBackendProfileId(s: AppState): string | null`

- [ ] **Step 1: Write the failing migration test**

Create `__tests__/stateMigrationV3.test.ts`:

```ts
import { migrateV2ToV3 } from '@/lib/stateMigration';
import type { PersistedStateV2 } from '@/lib/stateMigration';
import { DEMO_PROFILE } from '@/lib/fixtures';

function v2Blob(): PersistedStateV2 {
  return {
    profiles: [
      {
        id: 'profile-1',
        name: 'My style',
        profile: DEMO_PROFILE,
        questionnaire: DEMO_PROFILE.questionnaire!,
        referenceImages: [],
        wardrobeItems: [],
        wishlistIds: ['top-classic-black'],
        rejectedIds: [],
        savedOutfits: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    activeProfileId: 'profile-1',
    draft: null,
    themeMode: 'auto',
  } as PersistedStateV2;
}

describe('migrateV2ToV3', () => {
  it('defaults backendProfileId to null on every profile', () => {
    const out = migrateV2ToV3(v2Blob());
    expect(out.profiles).toHaveLength(1);
    expect(out.profiles[0].backendProfileId).toBeNull();
  });

  it('seeds an empty catalog slice', () => {
    const out = migrateV2ToV3(v2Blob());
    expect(out.catalog).toEqual({ byId: {} });
  });

  it('preserves everything else untouched', () => {
    const before = v2Blob();
    const out = migrateV2ToV3(before);
    expect(out.activeProfileId).toBe('profile-1');
    expect(out.themeMode).toBe('auto');
    expect(out.draft).toBeNull();
    expect(out.profiles[0].wishlistIds).toEqual(['top-classic-black']);
    expect(out.profiles[0].name).toBe('My style');
  });

  it('handles an empty profiles list', () => {
    const out = migrateV2ToV3({
      profiles: [], activeProfileId: null, draft: null, themeMode: 'auto',
    } as PersistedStateV2);
    expect(out.profiles).toEqual([]);
    expect(out.catalog).toEqual({ byId: {} });
  });

  it('is idempotent on a blob that already has backendProfileId', () => {
    const once = migrateV2ToV3(v2Blob());
    const twice = migrateV2ToV3(once as unknown as PersistedStateV2);
    expect(twice.profiles[0].backendProfileId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx jest __tests__/stateMigrationV3.test.ts`
Expected: FAIL — `migrateV2ToV3 is not a function`

- [ ] **Step 3: Add `backendProfileId` to `ProfileRecord`**

In `lib/types.ts`, inside `ProfileRecord`, after `savedOutfits`:

```ts
  /** `null` for profiles created before the backend existed, or while it was down. */
  backendProfileId: string | null;
```

In `lib/profileRecords.ts`, add `backendProfileId: null,` to the record built by `draftToRecord`.

In `store/useAppStore.ts`, add `backendProfileId: null,` to the `demo` record inside `loadDemoData`.

- [ ] **Step 4: Write `migrateV2ToV3`**

Append to `lib/stateMigration.ts`:

```ts
import type { Product } from '@/lib/types';

export interface PersistedStateV3 {
  profiles: ProfileRecord[];
  activeProfileId: string | null;
  draft: ProfileDraft | null;
  themeMode: unknown;
  catalog: { byId: Record<string, Product> };
}

/**
 * v2 -> v3. Existing profiles get `backendProfileId: null`, which is correct
 * rather than merely safe: they were never created on the backend, so they
 * legitimately continue on the seeded provider.
 *
 * Only `byId` is seeded, not `feed` or `status` — the feed is a live,
 * profile-specific slice that must be re-fetched, never restored.
 */
export function migrateV2ToV3(state: PersistedStateV2): PersistedStateV3 {
  return {
    profiles: (state.profiles ?? []).map((p) => ({
      ...p,
      backendProfileId: p.backendProfileId ?? null,
    })),
    activeProfileId: state.activeProfileId ?? null,
    draft: state.draft ?? null,
    themeMode: state.themeMode ?? 'auto',
    catalog: { byId: {} },
  };
}
```

- [ ] **Step 5: Run the migration test**

Run: `npx jest __tests__/stateMigrationV3.test.ts`
Expected: 5 passed.

- [ ] **Step 6: Add the catalog slice to the store**

In `store/useAppStore.ts`, add these imports:

```ts
import type { Product } from '@/lib/types';
import { activeProvider, FALLBACK_PRODUCTS } from '@/lib/catalog/index';
import { getCatalogItem } from '@/lib/backend';
import { mapProfileItemToProduct } from '@/lib/catalog/backendMapper';
import { migrateV1ToV2, migrateV2ToV3 } from '@/lib/stateMigration';
import type { PersistedStateV1, PersistedStateV2 } from '@/lib/stateMigration';
```

Extend `AppState`:

```ts
export interface CatalogSlice {
  /** Current ranked pool. NOT persisted — it is profile-specific and live. */
  feed:   Product[];
  /** Every product ever resolved. PERSISTED: ids alone are insufficient state
   *  against a remote catalog, so a cold start with the backend down would
   *  otherwise empty the user's closet. */
  byId:   Record<string, Product>;
  status: 'idle' | 'loading' | 'ready' | 'degraded';
}

export interface AppState {
  profiles:        ProfileRecord[];
  activeProfileId: string | null;
  draft:           ProfileDraft | null;
  themeMode:       ThemeMode;
  hydrated:        boolean;
  catalog:         CatalogSlice;
}
```

Extend `AppActions`:

```ts
  setBackendProfileId: (profileId: string, backendProfileId: string | null) => void;
  loadFeed:            () => Promise<void>;
  resolveProducts:     (ids: string[]) => Promise<void>;
```

Extend `initialState`:

```ts
const initialState: AppState = {
  profiles:        [],
  activeProfileId: null,
  draft:           null,
  themeMode:       'auto',
  hydrated:        false,
  catalog:         { feed: [], byId: {}, status: 'idle' },
};
```

Add a merge helper above `useAppStore`:

```ts
/** Adds products to `byId` without dropping anything already cached. */
function mergeById(
  byId: Record<string, Product>,
  products: Product[],
): Record<string, Product> {
  if (products.length === 0) return byId;
  const next = { ...byId };
  for (const p of products) next[p.id] = p;
  return next;
}
```

Add the three actions inside the store body, after `loadDemoData`:

```ts
      setBackendProfileId: (profileId, backendProfileId) =>
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === profileId ? { ...p, backendProfileId } : p,
          ),
        })),

      loadFeed: async () => {
        const state = get();
        const record = state.profiles.find((p) => p.id === state.activeProfileId);
        set((s) => ({ catalog: { ...s.catalog, status: 'loading' } }));

        const products = await activeProvider(record?.backendProfileId ?? null).all();

        // An empty pool is a degraded backend, not a real empty catalogue:
        // fall back so the deck keeps working rather than showing nothing.
        if (products.length === 0) {
          set((s) => ({
            catalog: {
              feed:   FALLBACK_PRODUCTS,
              byId:   mergeById(s.catalog.byId, FALLBACK_PRODUCTS),
              status: 'degraded',
            },
          }));
          return;
        }

        set((s) => ({
          catalog: {
            feed:   products,
            byId:   mergeById(s.catalog.byId, products),
            status: 'ready',
          },
        }));
      },

      resolveProducts: async (ids) => {
        const { catalog } = get();
        const missing = ids.filter((id) => !catalog.byId[id]);
        if (missing.length === 0) return;

        const resolved = await Promise.all(
          missing.map(async (id) => {
            const { item } = await getCatalogItem(id);
            return item ? mapProfileItemToProduct(item) : null;
          }),
        );

        const found = resolved.filter((p): p is Product => p !== null);
        if (found.length === 0) return;
        set((s) => ({ catalog: { ...s.catalog, byId: mergeById(s.catalog.byId, found) } }));
      },
```

Also add `catalog: { feed: [], byId: {}, status: 'idle' }` to the object `resetEverything` sets, so a reset clears the cache too.

- [ ] **Step 7: Bump persist to v3, with a custom `merge`**

Replace the whole persist options object at the bottom of `store/useAppStore.ts`:

```ts
    {
      name: 'fitlab-store',
      version: 3,
      migrate: (persisted, version) => {
        let state = persisted as unknown;
        if (version < 2) state = migrateV1ToV2(state as PersistedStateV1);
        if (version < 3) state = migrateV2ToV3(state as PersistedStateV2);
        return state as AppStore;
      },
      storage: createJSONStorage(buildStorage),
      partialize: (state) => ({
        profiles:        state.profiles,
        activeProfileId: state.activeProfileId,
        draft:           state.draft,
        themeMode:       state.themeMode,
        // Only `byId`. `feed` is a live ranked slice and `status` describes the
        // current session, so neither survives a restart.
        catalog:         { byId: state.catalog.byId },
      }),
      // Default merge is a shallow spread, which would replace the whole
      // `catalog` object with the partialized `{ byId }` and leave `feed` and
      // `status` undefined. Merge the slice explicitly.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppStore> & {
          catalog?: { byId?: Record<string, Product> };
        };
        return {
          ...current,
          ...p,
          catalog: {
            feed:   current.catalog.feed,
            status: current.catalog.status,
            byId:   p.catalog?.byId ?? current.catalog.byId,
          },
        } as AppStore;
      },
      onRehydrateStorage: () => (_state, _error) => {
        // Mark hydration complete once AsyncStorage rehydration finishes (or errors).
        useAppStore.setState({ hydrated: true });
      },
    },
```

- [ ] **Step 8: Add the selectors**

Append to `store/selectors.ts`:

```ts
import type { Product } from '@/lib/types';

const EMPTY_FEED = Object.freeze([]) as unknown as Product[];
const EMPTY_BY_ID = Object.freeze({}) as unknown as Record<string, Product>;

export function selectCatalogFeed(s: AppState): Product[] {
  return s.catalog?.feed ?? EMPTY_FEED;
}

export function selectCatalogById(s: AppState): Record<string, Product> {
  return s.catalog?.byId ?? EMPTY_BY_ID;
}

export function selectBackendProfileId(s: AppState): string | null {
  return selectActiveRecord(s)?.backendProfileId ?? null;
}
```

- [ ] **Step 9: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx jest`
Expected: clean, all PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/types.ts lib/stateMigration.ts lib/profileRecords.ts store/useAppStore.ts store/selectors.ts __tests__/stateMigrationV3.test.ts
git commit -m "feat: catalog store slice with a persisted byId cache

byId must persist: the store previously kept only wishlistIds and
savedOutfits.productIds, which resolved against an array shipped in the bundle.
Against a remote catalog, restarting while the backend is down would empty the
user's closet -- ids are no longer sufficient state.

feed is deliberately NOT persisted; a custom merge keeps rehydration from
clobbering it with the partialized slice."
```

---

## Task 11: Convert the four `ALL_PRODUCTS` call-sites to the store slice

Implements spec §8 (call-site conversion). **No component becomes async** — each reads store state that arrives when it arrives, the pattern the app already uses for `hydrated`.

**Files:**
- Modify: `components/panes/ExplorePane.tsx`
- Modify: `components/panes/ClosetPane.tsx`
- Modify: `components/panes/ProfilePane.tsx`
- Modify: `app/product/[id].tsx`

**Interfaces:**
- Consumes: `selectCatalogFeed`, `selectCatalogById` (Task 10); `loadFeed`, `resolveProducts` (Task 10).
- Produces: no new exports. After this task nothing outside `lib/catalog/` imports `seeded.ts`.

- [ ] **Step 1: `ExplorePane` — feed from the store, and kick off the fetch**

Replace the import:

```tsx
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';
```

with nothing, and add `selectCatalogFeed` to the existing `@/store/selectors` import.

Add below the existing store reads:

```tsx
  const feed = useAppStore(selectCatalogFeed);
  const catalogStatus = useAppStore((s) => s.catalog.status);
  const loadFeed = useAppStore((s) => s.loadFeed);
```

Add the fetch effect immediately after those reads:

```tsx
  // Fetch once per profile. `status` is the guard, so a re-render mid-flight
  // does not fire a second request.
  useEffect(() => {
    if (catalogStatus === 'idle') void loadFeed();
  }, [catalogStatus, loadFeed, activeProfileId]);
```

Replace `products: ALL_PRODUCTS,` in the `ctx` memo with:

```tsx
            products: feed,
```

and add `feed` to that memo's dependency array:

```tsx
    [profile, rejectedIds, feed],
```

Finally, rebuild the outfit when the feed arrives, not only when the profile changes. Replace the existing effect's dependency array:

```tsx
  }, [activeProfileId, isCommitting]);
```

with:

```tsx
  }, [activeProfileId, isCommitting, feed.length]);
```

Keying on `feed.length` rather than `feed` keeps the original intent — rejecting a product must not throw away the outfit the user is still judging — while still rebuilding once when an empty feed fills.

- [ ] **Step 2: `ClosetPane` — byId from the store**

Delete the import:

```tsx
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';
```

Delete the module-level map (line 36):

```tsx
const PRODUCT_BY_ID = new Map(ALL_PRODUCTS.map((p) => [p.id, p]));
```

Add `selectCatalogById, selectCatalogFeed` to the `@/store/selectors` import, and inside the component:

```tsx
  const productById = useAppStore(selectCatalogById);
  const feed = useAppStore(selectCatalogFeed);
  const resolveProducts = useAppStore((s) => s.resolveProducts);
```

Replace `products: ALL_PRODUCTS,` in the `gaps` memo with `products: feed,` and add `feed` to its dependency array:

```tsx
    [profile, wardrobeItems, feed],
```

Replace every `PRODUCT_BY_ID.get(id)` with `productById[id]`. There are two: the wishlist render and the saved-outfit render. For the saved-outfit one:

```tsx
            const pieces = saved.productIds.flatMap((id) => {
              const product = productById[id];
              return product ? [product] : [];
            });
```

Add an effect that resolves anything the persisted cache is missing:

```tsx
  // Wishlisted and saved-outfit ids can name products that are not in the
  // current ranked feed; resolve those individually.
  useEffect(() => {
    const ids = [...wishlistIds, ...savedOutfits.flatMap((o) => o.productIds)];
    if (ids.length) void resolveProducts(ids);
  }, [wishlistIds, savedOutfits, resolveProducts]);
```

Add `useEffect` to the `react` import at the top of the file.

- [ ] **Step 3: `ProfilePane` — byId from the store**

Delete the import on line 29:

```tsx
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';
```

Add `selectCatalogById` to the `@/store/selectors` import and, inside the component:

```tsx
  const productById = useAppStore(selectCatalogById);
  const resolveProducts = useAppStore((s) => s.resolveProducts);

  useEffect(() => {
    if (saved.length) void resolveProducts(saved);
  }, [saved, resolveProducts]);
```

Replace line 287:

```tsx
            {ALL_PRODUCTS.filter((p) => saved.includes(p.id)).map((p) => (
```

with:

```tsx
            {saved.flatMap((id) => productById[id] ?? []).map((p) => (
```

Add `useEffect` to the `react` import if it is not already there.

- [ ] **Step 4: `app/product/[id].tsx` — byId lookup with a resolve-on-miss**

This file is two long lines. Replace the import:

```tsx
import { ALL_PRODUCTS } from '@/lib/catalog/seeded';
```

with nothing, add `useEffect` to the `react` import, and add `selectCatalogById` to the `@/store/selectors` import.

Replace:

```tsx
const product = ALL_PRODUCTS.find((x) => x.id === id);
```

with:

```tsx
const productById = useAppStore(selectCatalogById); const resolveProducts = useAppStore((s) => s.resolveProducts); const product = productById[id]; useEffect(() => { if (id && !product) void resolveProducts([id]); }, [id, product, resolveProducts]);
```

The existing `!product` branch already renders the "That piece isn't available" empty state, so an unresolvable id degrades correctly with no further change.

- [ ] **Step 5: Verify nothing outside `lib/catalog/` imports the seeded module**

Run: `grep -rn "catalog/seeded" app components store lib --include=*.ts --include=*.tsx`
Expected: only `lib/catalog/index.ts`.

- [ ] **Step 6: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx jest`
Expected: clean, all PASS.

- [ ] **Step 7: Manual smoke test with the backend OFF**

```bash
npx expo start --web
```

With `EXPO_PUBLIC_BACKEND_URL` unset: onboard a profile, confirm the Explore deck builds an outfit from the seeded catalogue, swipe right on a piece, confirm it appears in Closet → Want and in Profile → Want, and confirm the product detail screen opens. Then reload the page and confirm the wanted piece is still rendered — that is the persisted `byId` doing its job.

- [ ] **Step 8: Commit**

```bash
git add components/panes app/product
git commit -m "refactor: read products from the catalog store slice

Converts the four ALL_PRODUCTS call-sites. No component becomes async: each
reads store state that arrives when it arrives, the same pattern the app
already uses for `hydrated`. Nothing outside lib/catalog/ imports seeded.ts now."
```

---

## Task 12: `analyzing.tsx` — create the backend profile alongside the Claude analysis

Implements spec §8 (`analyzing.tsx`) and §6.

**Files:**
- Modify: `store/useAppStore.ts`
- Modify: `app/onboarding/analyzing.tsx`

**Interfaces:**
- Consumes: `createProfile`, `getProfile` from `lib/backend.ts` (Task 8); `arrayToStyleVector` from `lib/catalog/backendMapper.ts` (Task 8); `buildStyleProfile`'s `clip` argument (Task 9); `setBackendProfileId` (Task 10).
- Produces: `AppActions.rewriteReferenceUris(profileId: string, uris: string[]): void`.

- [ ] **Step 1: Add `rewriteReferenceUris` to the store**

This is a store action, not a component concern. Add to `AppActions` in `store/useAppStore.ts`:

```ts
  rewriteReferenceUris: (profileId: string, uris: string[]) => void;
```

and the implementation, after `setBackendProfileId`:

```ts
      rewriteReferenceUris: (profileId, uris) =>
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === profileId
              ? {
                  ...p,
                  // Positional: the server returns one reference per uploaded
                  // photo, in upload order. A short response leaves the tail on
                  // its original local URI, which still renders.
                  referenceImages: p.referenceImages.map((img, i) =>
                    uris[i] ? { ...img, uri: uris[i] } : img,
                  ),
                }
              : p,
          ),
        })),
```

This lands first because the next step reads the action from the store; adding it the other way round leaves `analyzing.tsx` failing to typecheck in between.

- [ ] **Step 2: Add the imports**

```tsx
import { createProfile as createBackendProfile, getProfile } from '@/lib/backend';
import { arrayToStyleVector } from '@/lib/catalog/backendMapper';
```

`arrayToStyleVector` is the same helper the catalogue mapper uses (Task 8) — the backend sends the 9 axes as a bare array in `STYLE_DIMENSIONS` order in both places, so there is no second copy of that conversion.

Add `setBackendProfileId` and `rewriteReferenceUris` to the store reads:

```tsx
  const setBackendProfileId = useAppStore((s) => s.setBackendProfileId);
  const rewriteReferenceUris = useAppStore((s) => s.rewriteReferenceUris);
```

The backend profile should carry the name the user actually typed, not a
derived string, so extend the existing mount snapshot (lines 24-28) to capture
it. It must be snapshotted here for the same reason the other two are:
`commitDraft` clears the draft, so reading `draft.name` later returns
`undefined`.

```tsx
  const [input] = useState(() => ({
    questionnaire: selectQuestionnaire(useAppStore.getState()),
    images: selectReferenceImages(useAppStore.getState()),
    profileName: useAppStore.getState().draft?.name?.trim() || 'My style',
  }));
  const { questionnaire, images, profileName } = input;
```

- [ ] **Step 3: Run both analyses in parallel**

Replace the body of the `useEffect`'s async IIFE:

```tsx
      if (!reduceMotion) setStage(1);
      const dataUris = await Promise.all(
        images.map((image) => toDataUri(image.uri).catch(() => '')),
      );
      if (!active) return;
      if (!reduceMotion) setStage(2);
      else setStage(stages.length - 1);
      const result = await analyzeInspiration(dataUris.filter(Boolean));
      if (!active) return;
      setDegraded(result.degraded);
      const next = buildStyleProfile({
        attributes: result.attributes.length
          ? result.attributes
          : images.flatMap((x) => (x.attributes ? [x.attributes] : [])),
        questionnaire,
      });
      setLocalProfile(next);
      commitDraft(next);
      setDone(true);
```

with:

```tsx
      if (!reduceMotion) setStage(1);
      const dataUris = await Promise.all(
        images.map((image) => toDataUri(image.uri).catch(() => '')),
      );
      if (!active) return;
      if (!reduceMotion) setStage(2);
      else setStage(stages.length - 1);

      const usable = dataUris.filter(Boolean);
      // Parallel, not sequential: the two calls hit different services and
      // neither needs the other's answer. Serialising them would roughly double
      // the wait on the slowest screen in onboarding.
      const [claude, backend] = await Promise.all([
        analyzeInspiration(usable),
        createBackendProfile(profileName, usable),
      ]);
      if (!active) return;

      setDegraded(claude.degraded);

      // No `clip` argument here, deliberately. POST /profiles returns n_refs
      // but no vector, and refetching GET /profiles/{id} purely for it would
      // put a second round trip on the critical path of the slowest onboarding
      // screen. The vector arrives via the follow-up effect in Step 4.
      const next = buildStyleProfile({
        attributes: claude.attributes.length
          ? claude.attributes
          : images.flatMap((x) => (x.attributes ? [x.attributes] : [])),
        questionnaire,
      });
      setLocalProfile(next);
      const profileId = commitDraft(next);

      if (backend.profile) {
        setBackendProfileId(profileId, backend.profile.profile_id);
        setCommittedIds({ profileId, backendProfileId: backend.profile.profile_id });
        // Reference photos now live on the server. Swapping the data URIs for
        // URLs is the AsyncStorage bloat fix, and it falls out of work already
        // being done rather than needing a separate upload service.
        rewriteReferenceUris(profileId, backend.profile.references.map((r) => r.image_url));
      }
      setDone(true);
```

Declare the new piece of state alongside the component's existing `useState` calls:

```tsx
  const [committedIds, setCommittedIds] = useState<
    { profileId: string; backendProfileId: string } | null
  >(null);
```

- [ ] **Step 4: Fetch the CLIP vector in a follow-up effect**

Add this effect immediately after the main one. `getProfile` is already imported from Step 2.

```tsx
  // Fetch the CLIP projection after the reveal is already on screen. Blocking
  // the slowest onboarding screen on a second round trip is not worth it, and
  // `setStyleProfile` re-renders the radar chart when it lands.
  useEffect(() => {
    if (!committedIds) return;
    let active = true;
    (async () => {
      const { detail } = await getProfile(committedIds.backendProfileId);
      if (!active || !detail) return;
      const blended = buildStyleProfile({
        attributes: images.flatMap((x) => (x.attributes ? [x.attributes] : [])),
        questionnaire,
        clip: {
          vector: arrayToStyleVector(detail.vector),
          nRefs: detail.n_refs,
          nSwipes: detail.n_swipes,
        },
      });
      setLocalProfile(blended);
      useAppStore.getState().setStyleProfile(blended);
    })();
    return () => {
      active = false;
    };
  }, [committedIds, images, questionnaire]);
```

- [ ] **Step 5: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx jest`
Expected: clean, all PASS.

- [ ] **Step 6: Manual smoke test with the backend ON**

```bash
cd Backend && .venv/bin/python -m uvicorn api:app --port 8000 &
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000 npx expo start --web
```

Onboard with 3 photos. Expect: no "Analysed offline" banner; the radar chart visibly shifts a moment after the reveal appears (the CLIP vector landing); the Explore deck shows real H&M garments with photos rather than procedural art. Then check the store:

```bash
curl -s localhost:8000/profiles
```

Expected: one profile with the name you entered.

- [ ] **Step 7: Commit**

```bash
git add app/onboarding/analyzing.tsx store/useAppStore.ts
git commit -m "feat: create the backend profile during onboarding

Runs createProfile in parallel with the Claude analysis -- different services,
neither needs the other's answer. The CLIP vector is fetched in a second effect
after the reveal is already on screen, so the slowest onboarding screen is not
blocked on a round trip it does not need.

Reference photos are rewritten from data URIs to server URLs, which is also the
AsyncStorage bloat fix."
```

---

## Task 13: Swipe write-back and feed refill

Implements spec §8 (swipe write-back). Last task.

**Files:**
- Modify: `store/useAppStore.ts`
- Modify: `components/panes/ExplorePane.tsx`

**Interfaces:**
- Consumes: `swipe` from `lib/backend.ts` (Task 8); `loadFeed` and `backendProfileId` (Task 10).
- Produces: no new exports. `toggleWishlist` and `rejectProduct` keep their existing `(productId: string) => void` signatures.

- [ ] **Step 1: Fire-and-forget the swipe from the store actions**

In `store/useAppStore.ts`, add the import:

```ts
import { swipe as backendSwipe } from '@/lib/backend';
```

Add a helper above `useAppStore`:

```ts
/**
 * Fire-and-forget. A lost swipe costs a little ranking quality; a swipe that
 * blocks or throws costs the user their gesture, so the result is deliberately
 * dropped. `backendSwipe` already never rejects; the catch is belt-and-braces.
 */
function reportSwipe(
  state: AppState,
  productId: string,
  liked: boolean,
): void {
  const record = state.profiles.find((p) => p.id === state.activeProfileId);
  if (!record?.backendProfileId) return;
  void backendSwipe(record.backendProfileId, productId, liked).catch(() => undefined);
}
```

Replace the two actions:

```ts
      toggleWishlist: (productId) =>
        set((s) => {
          const record = s.profiles.find((p) => p.id === s.activeProfileId);
          // Only report the transition into the wishlist, not out of it — the
          // backend has no un-swipe, and re-reporting would double-count.
          if (record && !record.wishlistIds.includes(productId)) {
            reportSwipe(s, productId, true);
          }
          return mutateActive(s, (r) => withWishlistToggled(r, productId));
        }),

      rejectProduct: (productId) =>
        set((s) => {
          reportSwipe(s, productId, false);
          return mutateActive(s, (r) => withProductRejected(r, productId));
        }),
```

- [ ] **Step 2: Refill the feed as it drains**

In `components/panes/ExplorePane.tsx`, add a module-level constant beside the existing `MIN_ROW` constant — not inside the component, so it is not reallocated per render and does not need to be in any dependency array:

```tsx
/** Feed size below which Explore re-fetches. Enough runway to keep shuffling. */
const REFILL_THRESHOLD = 8;
```

Then add the effect after the existing `loadFeed` effect:

```tsx
  // The backend excludes already-swiped articles from /next, so the pool
  // genuinely shrinks as the user swipes. Refill before it runs dry.
  useEffect(() => {
    const remaining = feed.filter((p) => !rejectedIds.includes(p.id)).length;
    if (catalogStatus === 'ready' && remaining < REFILL_THRESHOLD) void loadFeed();
  }, [feed, rejectedIds, catalogStatus, loadFeed]);
```

- [ ] **Step 3: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx jest`
Expected: clean, all PASS.

- [ ] **Step 4: Manual smoke test — the loop closes**

With the backend running and `EXPO_PUBLIC_BACKEND_URL` set, onboard a profile and swipe through 15–20 pieces on Explore. Then:

```bash
curl -s localhost:8000/profiles
```

Expected: `n_swipes` matches roughly what you swiped.

```bash
curl -s "localhost:8000/profiles/<id>" | python3 -m json.tool
```

Expected: `n_swipes > 0`, and `vector` differs from what it was right after onboarding — the profile has moved toward what you picked.

Confirm the deck never shows a piece you already judged, and never empties while items remain.

- [ ] **Step 5: Smoke test the degraded path one last time**

Stop the backend mid-session and keep swiping. Expected: no crash, no error toast, the deck keeps working on whatever is already in `feed`, and rejected items still disappear (local `rejectedIds` still applies). Reload with the backend still down: the closet still renders from the persisted `byId`.

- [ ] **Step 6: Commit**

```bash
git add store/useAppStore.ts components/panes/ExplorePane.tsx
git commit -m "feat: write swipes back to the backend and refill the feed

Fire-and-forget: a lost swipe costs a little ranking quality, but a swipe that
blocks or throws costs the user their gesture. Only the transition INTO the
wishlist is reported -- the backend has no un-swipe."
```

---

## Verification checklist

After Task 13, confirm the whole thing end to end:

- [ ] `npx tsc --noEmit` — clean
- [ ] `npx jest` — all PASS
- [ ] `cd Backend && .venv/bin/python -m pytest tests/ -v` — all PASS
- [ ] `grep -rn "price\|budgetCenter\|outfitTotal" lib components app store __tests__ --include=*.ts --include=*.tsx` — no output
- [ ] `grep -rn "catalog/seeded" app components store --include=*.ts --include=*.tsx` — no output
- [ ] `cd Backend && grep -rn "/sessions\|SESSIONS" api.py tests/` — no output
- [ ] App works with `EXPO_PUBLIC_BACKEND_URL` unset (seeded catalogue, no fetch issued)
- [ ] App works with the backend running (real H&M garments, profile persists, swipes move the vector)
- [ ] App survives the backend dying mid-session and a cold restart while it is down

## Known follow-ups (out of scope, per spec §11)

- Wardrobe embedding + near-duplicate exclusion (`POST /wardrobe/embed`)
- Ops: CORS lock-down, shared `X-Api-Key`, Dockerfile, git-lfs for `embeddings.npy`
- A dress/full-body slot in the outfit graph, which would let the excluded `Garment Full body` group back in
- The saved-outfit total in `ClosetPane`, removed with price
