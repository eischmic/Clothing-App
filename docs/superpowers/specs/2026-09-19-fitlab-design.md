# FitLab — Design Spec

**Date:** 2026-09-19
**Deadline:** hackathon demo, ~48 hours
**Platform:** Expo (React Native), primary target web via `npx expo start` → `w`

## One-sentence product

An AI stylist that learns your style from images and your wardrobe, then finds clothes that expand what you own rather than duplicating it.

## Demo beat we are optimising for

Upload inspiration → style profile appears and the entire app reskins to your palette → upload what you own → "your wardrobe is missing a versatile mid-layer" → three recommendations, each explaining itself → "+14 possible outfits".

Every decision below serves that sequence. Anything that does not is cut.

---

## 1. Scope

### In

- Onboarding funnel: inspiration upload → personality questionnaire → wardrobe upload → analysis reveal
- Style profile: tags, palette, silhouettes, materials, influences, 9-dimension style vector
- Wardrobe: item grid, category coverage, colour balance, formality curve, AI gap analysis
- Fits: outfit compatibility graph, valid-combination count, wardrobe-impact simulation
- Explore: search bar, intent picker, ranked recommendations
- Product detail: "Why this?" explanation built from structured data
- Profile: questionnaire retune, saved pieces, style vector
- Adaptive theming driven by the user's extracted colour palette
- `eas.json`

### Out

Authentication, payments, checkout, social feed, followers/following, multi-retailer scraping, trained models, virtual try-on, push notifications, onboarding skip-resume analytics.

### Deferred (seam built, implementation later)

AI web search for real products. The product catalogue sits behind a `ProductProvider` interface; v1 ships a `SeededProductProvider`. A future `WebSearchProductProvider` implements the same interface. No UI changes required to swap.

---

## 2. Navigation

```
app/
  _layout.tsx                  theme provider, store hydration, onboarding gate
  onboarding/
    _layout.tsx                progress header, step transitions
    index.tsx                  "Show us your style" — 3–8 inspiration images
    personality.tsx            5 sliders + pick 3 of 9 words
    wardrobe.tsx               "What do you already own?"
    analyzing.tsx              staged progress → reveal, triggers reskin
  (tabs)/
    _layout.tsx                bottom tab bar
    index.tsx                  Home    — style profile
    explore.tsx                Explore — search + recommendations
    fits.tsx                   Fits    — outfit graph + impact
    wardrobe.tsx               Wardrobe— items + gaps
    profile.tsx                Profile — retune + saved
  product/[id].tsx             "Why this?" detail
  api/
    analyze+api.ts             images → Claude vision → structured JSON
    explain+api.ts             recommendation → prose rationale
```

The onboarding gate reads `styleProfile !== null` from the persisted store. Completed onboarding is reachable again from Profile → Retune.

### Tab contents

| Tab | Purpose | Key elements |
|---|---|---|
| Home | Who you are, stylistically | Style tags, palette swatches, vector radar chart, silhouettes/materials/influences, intent picker entry to Explore |
| Explore | Find pieces | Search bar, 6 intent chips (jacket, pants, shoes, everyday, event, surprise me), ranked recommendation cards with match %, price filter |
| Fits | Combination value | Outfit graph visualisation, current valid-outfit count, per-candidate wardrobe impact, generated outfit grid |
| Wardrobe | What you own and what's missing | Item grid, category coverage bars, colour balance, formality curve, ranked gap cards with reasoning and confidence |
| Profile | Control | Slider retune, 3-word reselect, style vector readout, saved pieces, theme mode (auto / pinned vibe) |

---

## 3. Adaptive theming

The dark base is constant. Only the accent ramp varies.

```
Base        #0A0A0B   canvas
Elevation 1 #101012
Elevation 2 #17171A
Elevation 3 #1F1F23
Hairline    #2A2A2F
Text hi     #F5F4F2
Text mid    #A3A09C
Text low    #6B6862
```

Six accent vibes, each a 3-stop ramp (`base`, `bright`, `dim`) plus a `glow` alpha:

| Vibe | Accent | Derived from palette containing |
|---|---|---|
| Noir | `#E8E6E3` | black, white, grey, monochrome |
| Ember | `#FF7A45` | rust, terracotta, orange, burgundy |
| Sage | `#7FB77E` | olive, forest, khaki, technical greens |
| Cobalt | `#4D7CFE` | navy, indigo, denim blues |
| Orchid | `#B57EDC` | purple, lilac, magenta, pink |
| Sand | `#D9B382` | tan, cream, beige, camel, brown |

**Derivation:** each extracted colour name maps to a vibe via a lookup table. The vibe with the highest weighted count across the style profile's palette wins; ties break toward the earlier-listed colour. Empty palette → Noir.

**Application:** accent drives active tab tint, primary buttons, match-score rings, chart strokes, focus states, glow shadows, and slider tracks. Transition animates over 320 ms (`Easing.bezier(0.22, 1, 0.36, 1)`) on a shared Reanimated value, so the reveal screen visibly reskins the app.

**Modes:** `auto` (follows style profile, default) or a pinned vibe chosen in Profile. Contrast is guaranteed because accents are pre-vetted against the fixed dark base — no runtime contrast computation needed.

---

## 4. Data model

```ts
type StyleDimension =
  | 'minimalism' | 'streetwear' | 'workwear' | 'outdoor' | 'vintage'
  | 'formal' | 'colorfulness' | 'pattern' | 'relaxedFit';

type StyleVector = Record<StyleDimension, number>;   // each 0..1

interface InspoImage {
  id: string;
  uri: string;
  attributes: ImageAttributes | null;   // null until analysed
}

interface ImageAttributes {
  style: string[];
  colors: string[];
  fit: string[];
  patterns: string[];
  materials: string[];
  items: { category: Category; color: string; style: string }[];
}

interface StyleProfile {
  tags: string[];            // 3 headline descriptors, e.g. Relaxed · Minimal · Outdoorsy
  colors: string[];
  silhouettes: string[];
  materials: string[];
  influences: string[];
  vector: StyleVector;
  vibe: VibeName;
  createdAt: number;
}

type Category = 'top' | 'bottom' | 'outerwear' | 'footwear' | 'knitwear' | 'accessory';
type Formality = 1 | 2 | 3 | 4 | 5;   // 1 athleisure … 5 formal
type Season = 'spring' | 'summer' | 'fall' | 'winter';
type ColorFamily = 'neutral' | 'warm' | 'cool' | 'earth' | 'bold';
type VibeName = 'noir' | 'ember' | 'sage' | 'cobalt' | 'orchid' | 'sand';

/** The subset of a garment the vision model is asked to produce. */
type GarmentAttributes = Pick<
  WardrobeItem,
  'name' | 'category' | 'color' | 'colorFamily' | 'formality' | 'seasons'
>;

interface WardrobeItem {
  id: string;
  uri: string | null;        // null for seeded demo items
  name: string;
  category: Category;
  color: string;
  colorFamily: ColorFamily;  // neutral | warm | cool | earth | bold
  formality: Formality;
  seasons: Season[];
  vector: StyleVector;
}

interface Product {
  id: string;
  name: string;
  brand: string;
  category: Category;
  price: number;
  url: string;
  imageUri: string | null;   // null → procedural SVG fallback
  description: string;
  color: string;
  colorFamily: ColorFamily;
  formality: Formality;
  seasons: Season[];
  vector: StyleVector;
}

interface Recommendation {
  product: Product;
  scores: { style: number; wardrobe: number; price: number; occasion: number };
  total: number;             // 0..1
  pairsWith: WardrobeItem[];
  similarInspo: InspoImage[];
  newOutfits: number;
  reasons: string[];
}
```

### Questionnaire

Five sliders, each normalised to `v ∈ [0,1]`:

1. Minimal ↔ Expressive
2. Classic ↔ Trendy
3. Formal ↔ Casual
4. Practical ↔ Fashion-forward
5. Neutral ↔ Colourful

Three words chosen from: Outdoorsy, Creative, Professional, Laid-back, Bold, Minimalist, Vintage, Athletic, Experimental.

**Slider → vector:**

```
minimalism   = 1 - v(minimalExpressive)
colorfulness = v(neutralColorful)
pattern      = 0.2 + 0.6 · v(minimalExpressive)
streetwear   = 0.5 · v(classicTrendy) + 0.5 · v(practicalFashion)
vintage      = 0.7 · (1 - v(classicTrendy))
formal       = 1 - v(formalCasual)
relaxedFit   = v(formalCasual)
workwear     = 0.6 · (1 - v(practicalFashion))
outdoor      = 0.5 · (1 - v(practicalFashion))
```

**Words → vector:** each selected word adds `+0.15` to its mapped dimensions, clamped to `[0,1]`. Mapping lives in a single table (e.g. Outdoorsy → outdoor, workwear; Bold → colorfulness, pattern; Minimalist → minimalism, and `−0.15` to pattern).

**Blend:** `final = 0.6 · imageVector + 0.4 · questionnaireVector`. Weights are named constants (`IMAGE_WEIGHT`, `QUESTIONNAIRE_WEIGHT`) so they are tunable in one place. If image analysis fails or is skipped, the questionnaire vector is used alone.

---

## 5. AI layer

### `POST /api/analyze`

Request: `{ images: string[] }` (base64 data URIs), `{ kind: 'inspiration' | 'wardrobe' }`.

Server calls Claude with a vision message and a tool definition whose `input_schema` is exactly `ImageAttributes` (for inspiration) or a wardrobe-item schema. Forcing tool use guarantees structured JSON rather than prose. Model: `claude-sonnet-4-6`.

Response: `{ attributes: ImageAttributes[] }` or `{ items: GarmentAttributes[] }`.

The model only ever produces `GarmentAttributes` — the fields it can actually observe. The client owns `id`, `uri`, and `vector`: `id` is generated, `uri` is the local image the user picked, and `vector` is derived from the returned category, colour, and formality via the same table the seeded catalogue uses. This keeps the model's output surface small and prevents it from inventing vector values.

Key handling: `ANTHROPIC_API_KEY` is read server-side inside the API route. It is never referenced with an `EXPO_PUBLIC_` prefix, so it cannot reach the client bundle. Requires `web.output: "server"` in `app.json`.

Failure handling: the route returns a typed error; the client shows an inline retry and, if declined, proceeds with the questionnaire-only vector. The demo never dead-ends on a network failure.

### `POST /api/explain`

Request: a `Recommendation` minus `reasons`. Response: `{ reasons: string[] }` — three short rationale lines. Deterministic fallback strings exist for every reason category, so this call is an enhancement, never a dependency.

---

## 6. Scoring engine (pure, deterministic, unit-testable)

All of the following live in `lib/` with no React imports.

**Style similarity:** cosine similarity between user and product `StyleVector`, mapped from `[-1,1]` to `[0,1]`.

**Wardrobe compatibility:** fraction of wardrobe items that form a valid edge with the product, scaled so that 6+ pairings saturates to 1. The edge rules in §7 are defined over the fields `category`, `colorFamily`, `formality`, and `seasons`, which `Product` and `WardrobeItem` both carry — so `areCompatible()` takes that shared shape (`Garment`) and works for either type without special-casing.

**Price match:** Gaussian around the user's inferred budget centre (median price of a chosen band, default $120), `exp(-((p-c)/c)² / 0.5)`.

**Occasion match:** `1 - |productFormality - targetFormality| / 4`, where target comes from the selected intent (event → 4, everyday → 2, etc.).

**Total:**

```
score = 0.50 · style + 0.20 · wardrobe + 0.15 · price + 0.15 · occasion
```

Weights exported as a single `SCORE_WEIGHTS` constant.

**Pipeline:** intent + search text → filters (category, price ceiling) → candidate set → score all → sort → top 5.

---

## 7. Outfit graph

Nodes are wardrobe items. An undirected edge exists between two items when all hold:

1. **Slot compatibility** — different categories, and not two of the same non-layerable slot. `outerwear` + `knitwear` is allowed (layering); `bottom` + `bottom` is not.
2. **Colour harmony** — at least one item is in the `neutral` family, OR both share a family, OR the pair is in an allowed cross-family set (`earth`+`neutral`, `earth`+`warm`, `cool`+`neutral`). Two `bold` items never pair.
3. **Formality proximity** — `|a.formality − b.formality| ≤ 1`.
4. **Season overlap** — non-empty intersection of `seasons`.

A **valid outfit** is one `top` + one `bottom` + one `footwear`, optionally plus one `outerwear` and/or one `knitwear`, where every pair in the set has an edge.

`countOutfits(items)` enumerates these. **Wardrobe impact** of a candidate product is `countOutfits([...wardrobe, product]) − countOutfits(wardrobe)`.

Complexity is acceptable: the demo wardrobe is ~12–25 items, so the enumeration is small. A hard cap of 40 items guards against pathological input.

---

## 8. Gap analysis

Four analysers run over the real wardrobe and each emit zero or more `Gap` objects with a `confidence` and human-readable reasoning:

| Analyser | Fires when |
|---|---|
| Category coverage | a category has fewer items than its target minimum (top 4, bottom 3, footwear 3, outerwear 2, knitwear 2) |
| Colour balance | one colour family exceeds 70% of the wardrobe, or no neutral anchor exists |
| Formality curve | the formality range spans fewer than 3 levels |
| Pairability | items exist with zero edges (orphans) |

Each gap resolves to a concrete recommendation by running the scoring pipeline filtered to the gap's category, and reports the resulting outfit impact. This is what produces "add a tan mid-layer: unlocks 7 new fits from pieces you already own."

---

## 9. Product catalogue

`SeededProductProvider` ships ~150 products across the 6 categories, spread across price bands ($35–$320), colour families, formality levels, and seasons, with hand-authored `StyleVector`s. Coverage is deliberately shaped so that every gap analyser has good candidates to surface.

```ts
interface ProductProvider {
  all(): Promise<Product[]>;
  search(query: ProductQuery): Promise<Product[]>;
}
```

`imageUri` is `null` for all seeded products, so they render via `GarmentArt` — a `react-native-svg` component drawing a flat editorial silhouette per category, tinted with the product's colour over a subtle gradient. Deterministic and offline. When a future provider supplies a real `imageUri`, the card renders the photo instead; no other change needed.

---

## 10. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Expo SDK 54+, Expo Router | Requested; file-based routing; API routes keep the API key server-side |
| Language | TypeScript, strict | Catches vector/enum mistakes at the boundary |
| State | Zustand + AsyncStorage persist | Minimal ceremony, easy selective persistence |
| Animation | react-native-reanimated | Theme crossfade, reveal choreography, tab transitions |
| Styling | Typed design tokens + `useTheme()` | No NativeWind config risk under deadline; tokens are what adaptive theming needs |
| Graphics | react-native-svg, expo-linear-gradient | Radar chart, garment art, outfit graph, glows |
| Images | expo-image-picker | Multi-select on web and native |
| AI | `@anthropic-ai/sdk` in API routes only | Server-side key |

Persisted: `styleProfile`, `inspoImages`, `wardrobeItems`, `savedProductIds`, `questionnaire`, `themeMode`. Not persisted: recommendation results (recomputed, cheap).

---

## 11. Build order

Each phase ends with something runnable and demoable.

1. **Skeleton** — scaffold, tokens, theme provider, 5 tabs, seeded profile + wardrobe, every screen rendering with fixture data. *A complete fake demo exists here.*
2. **Engine** — `lib/` vectors, scoring, outfit graph, gap analysis, product catalogue, unit tests. Screens switch from fixtures to computed values.
3. **Onboarding** — funnel screens, image picker, persistence, gate, reveal choreography and reskin.
4. **Real AI** — `analyze+api.ts` and `explain+api.ts`, loading and error states, questionnaire-only fallback.
5. **Polish** — `impeccable` pass, then `/polish`. Empty states, a11y labels, reduced-motion, focus rings, `eas.json` verification.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Expo API routes require `output: "server"`, which some hosts and native builds treat differently | Web is the demo target; native falls back to the deterministic path when no origin is configured |
| Claude returns attributes outside our enums | Validate and coerce against enum tables server-side; unknown values drop rather than propagate |
| Live demo has no network | Questionnaire-only path plus seeded wardrobe means the full funnel still completes |
| Outfit enumeration blows up | 40-item cap; wardrobe of 25 is the realistic demo size |
| Scope creep back toward social | Cut list in §1 is binding |
