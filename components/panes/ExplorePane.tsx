import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';
import { selectActiveProfile, selectCatalogFeed, selectRejectedIds } from '@/store/selectors';
import {
  DECK_SLOT_ORDER,
  buildOutfit,
  outfitProducts,
  refillSlot,
  shouldRefill,
  type DeckContext,
  type DeckOutfit,
  type RefillState,
  type Slot,
} from '@/lib/deck';
import { EmptyState, PrimaryButton } from '@/components/primitives';
import { GarmentSwipeCard } from '@/components/GarmentSwipeCard';
import { StylePill } from '@/components/StylePill';

const MIN_ROW = 96;
/** Feed size below which Explore re-fetches. Enough runway to keep shuffling. */
const REFILL_THRESHOLD = 8;
const MAX_ROW = 140;
/** Dropped from display first when the rows cannot all fit. */
const DROPPABLE: readonly Slot[] = ['knitwear', 'outerwear'];
const SAVED_FLASH_MS = 1200;

export function ExplorePane({ onNavigateToPane }: { onNavigateToPane?: (index: number) => void }) {
  const { base, accent, type, spacing, reduceMotion } = useTheme();
  const profile = useAppStore(selectActiveProfile);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const rejectedIds = useAppStore(selectRejectedIds);
  const feed = useAppStore(selectCatalogFeed);
  const catalogStatus = useAppStore((s) => s.catalog.status);
  const loadFeed = useAppStore((s) => s.loadFeed);
  const toggleWishlist = useAppStore((s) => s.toggleWishlist);
  const rejectProduct = useAppStore((s) => s.rejectProduct);
  const clearRejections = useAppStore((s) => s.clearRejections);
  const saveOutfit = useAppStore((s) => s.saveOutfit);

  // Fetch once per profile. `status` is the guard, so a re-render mid-flight
  // does not fire a second request.
  useEffect(() => {
    if (catalogStatus === 'idle') void loadFeed();
  }, [catalogStatus, loadFeed, activeProfileId]);

  // The backend excludes already-swiped articles from /next, so the pool
  // genuinely shrinks as the user swipes. Refill before it runs dry.
  // Uses shouldRefill (a pure function) to avoid infinite small-pool requests:
  // one refill is allowed per profile-and-swipe state, not per feed response.
  const lastRefillStateRef = useRef<RefillState | null>(null);
  useEffect(() => {
    const refillState = { profileId: activeProfileId, rejectedIds };
    if (shouldRefill(feed, lastRefillStateRef.current, refillState, catalogStatus, REFILL_THRESHOLD)) {
      lastRefillStateRef.current = refillState;
      void loadFeed();
    }
  }, [feed, activeProfileId, rejectedIds, catalogStatus, loadFeed]);

  const isCommitting = useSharedValue(false);
  const [deckHeight, setDeckHeight] = useState(0);
  const [outfit, setOutfit] = useState<DeckOutfit | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const ctx = useMemo<DeckContext | null>(
    () =>
      profile
        ? {
            products: feed,
            userVector: profile.vector,
            rejectedIds,
          }
        : null,
    [profile, rejectedIds, feed],
  );

  // Deliberately keyed on the profile id, not `ctx`: rejecting a product
  // changes `ctx` and rebuilding there would throw away the rest of the outfit
  // the user is still judging.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  useEffect(() => {
    setOutfit(ctxRef.current ? buildOutfit(ctxRef.current) : null);
    isCommitting.value = false;
  }, [activeProfileId, isCommitting, feed.length]);

  const visibleSlots = useMemo(() => {
    if (!outfit) return [];
    let slots = DECK_SLOT_ORDER.filter((s) => outfit.slots[s]);
    if (deckHeight > 0) {
      const fits = () => deckHeight / slots.length >= MIN_ROW;
      for (const droppable of DROPPABLE) {
        if (fits()) break;
        slots = slots.filter((s) => s !== droppable);
      }
    }
    return slots;
  }, [outfit, deckHeight]);

  const rowHeight = visibleSlots.length
    ? Math.min(MAX_ROW, Math.max(MIN_ROW, deckHeight / visibleSlots.length - spacing.sm))
    : MIN_ROW;

  const judge = (slot: Slot, direction: 'yes' | 'no') => {
    if (!ctx || !outfit) return;
    const product = outfit.slots[slot];
    if (!product) return;
    if (direction === 'yes') toggleWishlist(product.id);
    else rejectProduct(product.id);
    // A right swipe does not reject, but the slot still refills so the piece
    // does not immediately reappear.
    setOutfit(refillSlot({ ...ctx, rejectedIds: [...ctx.rejectedIds, product.id] }, outfit, slot));
    isCommitting.value = false;
  };

  const shuffle = () => {
    if (!ctx) return;
    setOutfit(buildOutfit(ctx));
    isCommitting.value = false;
  };

  const save = () => {
    if (!outfit) return;
    saveOutfit(outfitProducts(outfit).map((p) => p.id));
    setJustSaved(true);
  };

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), SAVED_FLASH_MS);
    return () => clearTimeout(timer);
  }, [justSaved]);

  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}>
        <EmptyState
          title="No style profile yet"
          body="Finish onboarding so we can build outfits for you."
          action="Start onboarding"
          onAction={() => router.replace('/onboarding' as never)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}>
      <StylePill onNavigateToPane={onNavigateToPane} />

      {outfit && visibleSlots.length ? (
        <>
          <View
            onLayout={(e) => setDeckHeight(e.nativeEvent.layout.height)}
            style={{ flex: 1, paddingHorizontal: spacing.md, gap: spacing.sm }}
          >
            {visibleSlots.map((slot) => (
              <GarmentSwipeCard
                key={outfit.slots[slot]!.id}
                product={outfit.slots[slot]!}
                height={rowHeight}
                isCommitting={isCommitting}
                reduceMotion={reduceMotion}
                onSwipe={(direction) => judge(slot, direction)}
                onPress={() => router.push(`/product/${outfit.slots[slot]!.id}` as never)}
              />
            ))}
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              padding: spacing.md,
            }}
          >
            <PrimaryButton
              label={justSaved ? 'Saved' : 'Save outfit'}
              onPress={save}
              style={{ flex: 1 }}
            />
            <PrimaryButton label="Shuffle" variant="ghost" onPress={shuffle} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <EmptyState
          title="You’ve seen everything for this style"
          body="Bring back the pieces you passed on to keep going."
          action="Reset passes"
          onAction={() => {
            clearRejections();
            // Rebuild from an explicitly cleared context: `ctx` still carries
            // this render's rejections.
            if (ctx) setOutfit(buildOutfit({ ...ctx, rejectedIds: [] }));
            isCommitting.value = false;
          }}
        />
      )}
    </SafeAreaView>
  );
}
