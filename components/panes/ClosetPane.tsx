import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { useAppStore } from '@/store/useAppStore';
import {
  selectActiveProfile,
  selectCatalogById,
  selectCatalogFeed,
  selectSavedOutfits,
  selectWardrobe,
  selectWishlistIds,
} from '@/store/selectors';
import { analyzeGaps, categoryCoverage, colorBalance, formalitySpread } from '@/lib/gaps';
import { buildEdges, countOutfits, enumerateOutfits } from '@/lib/outfits';
import { COLOR_FAMILIES, type ColorFamily } from '@/lib/types';
import { wardrobeItemsFromAnalysis } from '@/lib/wardrobeImport';
import { CoverageBars } from '@/components/CoverageBars';
import { GapCard } from '@/components/GapCard';
import { GarmentArt } from '@/components/GarmentArt';
import { ImagePickerGrid } from '@/components/ImagePickerGrid';
import { OutfitGraph } from '@/components/OutfitGraph';
import { Chip, EmptyState, SectionHeader, Surface } from '@/components/primitives';
import { WardrobeItemCard } from '@/components/WardrobeItemCard';

const FAMILY_HEX: Record<ColorFamily, string> = {
  neutral: '#8C8A86',
  warm: '#D87834',
  cool: '#52759B',
  earth: '#697A46',
  bold: '#B04383',
};

const FORMALITY_LABELS = ['Athleisure', 'Casual', 'Smart', 'Dressy', 'Formal'] as const;

export function ClosetPane() {
  const { base, accent, type, spacing, radii } = useTheme();
  const wardrobeItems = useAppStore(selectWardrobe);
  const profile = useAppStore(selectActiveProfile);
  const remove = useAppStore((s) => s.removeWardrobeItem);
  const addWardrobeItems = useAppStore((s) => s.addWardrobeItems);
  const wishlistIds = useAppStore(selectWishlistIds);
  const savedOutfits = useAppStore(selectSavedOutfits);
  const productById = useAppStore(selectCatalogById);
  const feed = useAppStore(selectCatalogFeed);
  const resolveProducts = useAppStore((s) => s.resolveProducts);
  const toggleWishlist = useAppStore((s) => s.toggleWishlist);
  const removeSavedOutfit = useAppStore((s) => s.removeSavedOutfit);
  // Wishlisted and saved-outfit ids can name products that are not in the
  // current ranked feed; resolve those individually.
  useEffect(() => {
    const ids = [...wishlistIds, ...savedOutfits.flatMap((o) => o.productIds)];
    if (ids.length) void resolveProducts(ids);
  }, [wishlistIds, savedOutfits, resolveProducts]);

  const [adding, setAdding] = useState(false);
  const [draftUris, setDraftUris] = useState<string[]>([]);
  const [highlightId, setHighlightId] = useState<string>();

  const gaps = useMemo(
    () =>
      profile
        ? analyzeGaps({
            wardrobe: wardrobeItems,
            userVector: profile.vector,
            products: feed,
          })
        : [],
    [profile, wardrobeItems, feed],
  );
  const coverage = useMemo(() => categoryCoverage(wardrobeItems), [wardrobeItems]);
  const balance = useMemo(() => colorBalance(wardrobeItems), [wardrobeItems]);
  const spread = useMemo(() => formalitySpread(wardrobeItems), [wardrobeItems]);
  const presentLevels = useMemo(
    () => new Set(wardrobeItems.map((item) => item.formality)),
    [wardrobeItems],
  );
  const outfitCount = useMemo(() => countOutfits(wardrobeItems), [wardrobeItems]);
  const edges = useMemo(() => buildEdges(wardrobeItems), [wardrobeItems]);
  const outfits = useMemo(() => enumerateOutfits(wardrobeItems).slice(0, 12), [wardrobeItems]);

  const commitPhotos = () => {
    if (!draftUris.length) return;
    addWardrobeItems(wardrobeItemsFromAnalysis(draftUris, []));
    setDraftUris([]);
    setAdding(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: base.canvas }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}
        >
          <View>
            <Text style={[type.display, { color: accent.bright }]}>{outfitCount}</Text>
            <Text style={[type.body, { color: base.textMid }]}>
              possible outfits · {wardrobeItems.length} pieces
            </Text>
          </View>
          <Text
            onPress={() => setAdding((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={adding ? 'Hide photo importer' : 'Add wardrobe photos'}
            style={[type.caption, { color: accent.bright, padding: spacing.sm }]}
          >
            {adding ? 'Done' : 'Add'}
          </Text>
        </View>

        {adding ? (
          <Surface level={2} style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Text style={[type.body, { color: base.textHi }]}>Import photos</Text>
            <ImagePickerGrid
              max={8}
              uris={draftUris}
              onAdd={(uris) => setDraftUris((current) => [...current, ...uris].slice(0, 8))}
              onRemove={(uri) => setDraftUris((current) => current.filter((item) => item !== uri))}
            />
            <Text
              onPress={commitPhotos}
              accessibilityRole="button"
              accessibilityLabel="Save imported photos to wardrobe"
              style={[type.caption, { color: draftUris.length ? accent.bright : base.textLow }]}
            >
              Save {draftUris.length || ''} {draftUris.length === 1 ? 'piece' : 'pieces'}
            </Text>
          </Surface>
        ) : null}

        {wardrobeItems.length === 0 ? (
          <EmptyState
            title="Your wardrobe is empty"
            body="Add pieces during onboarding or import photos to see how they work together."
            action="Start onboarding"
            onAction={() => router.replace('/onboarding' as never)}
          />
        ) : (
          <>
            <SectionHeader title="Coverage" />
            <CoverageBars coverage={coverage} />

            <SectionHeader title="Colour balance" />
            <View
              style={{
                height: 12,
                borderRadius: 6,
                overflow: 'hidden',
                flexDirection: 'row',
                backgroundColor: base.hairline,
              }}
            >
              {COLOR_FAMILIES.map((family) =>
                balance[family] > 0 ? (
                  <View
                    key={family}
                    style={{
                      width: `${balance[family] * 100}%`,
                      backgroundColor: FAMILY_HEX[family],
                    }}
                  />
                ) : null,
              )}
            </View>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: spacing.sm,
                marginTop: spacing.sm,
              }}
            >
              {COLOR_FAMILIES.map((family) => (
                <View key={family} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: FAMILY_HEX[family],
                    }}
                  />
                  <Text style={[type.caption, { color: base.textMid }]}>
                    {family} {Math.round(balance[family] * 100)}%
                  </Text>
                </View>
              ))}
            </View>

            <SectionHeader title="Formality" />
            <Text style={[type.caption, { color: base.textLow, marginBottom: spacing.sm }]}>
              Span {spread.min || '—'}–{spread.max || '—'} · {spread.levels} levels
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {FORMALITY_LABELS.map((label, index) => {
                const level = (index + 1) as 1 | 2 | 3 | 4 | 5;
                const active = presentLevels.has(level);
                return (
                  <View
                    key={label}
                    style={{
                      flex: 1,
                      minHeight: 54,
                      borderRadius: radii.tile,
                      borderWidth: 1,
                      borderColor: active ? accent.base : base.hairline,
                      backgroundColor: active ? accent.glow : base.elev2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 2,
                    }}
                  >
                    <Text
                      style={[
                        type.caption,
                        { color: active ? accent.bright : base.textLow, textAlign: 'center' },
                      ]}
                    >
                      {label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <SectionHeader title="Gaps in your wardrobe" />
            {gaps.length ? (
              gaps
                .slice(0, 4)
                .map((gap) => (
                  <GapCard
                    key={gap.id}
                    gap={gap}
                    onPressSuggestion={
                      gap.suggestion
                        ? () => router.push(`/product/${gap.suggestion!.product.id}` as never)
                        : undefined
                    }
                  />
                ))
            ) : (
              <Text style={[type.body, { color: base.textMid }]}>No major gaps right now.</Text>
            )}

            <SectionHeader title="Your pieces" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {wardrobeItems.map((item) => (
                <WardrobeItemCard key={item.id} item={item} onRemove={() => remove(item.id)} />
              ))}
            </View>

            {wardrobeItems.length < 3 ? (
              <EmptyState
                title="Add a few pieces first"
                body="Fits appear once we can combine a top, bottom, and footwear."
              />
            ) : (
              <>
                <SectionHeader title="Connections" />
                <Surface level={2}>
                  <OutfitGraph items={wardrobeItems} edges={edges} highlightId={highlightId} />
                </Surface>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: spacing.sm,
                    marginTop: spacing.sm,
                  }}
                >
                  {wardrobeItems.map((item) => (
                    <Chip
                      key={item.id}
                      label={item.name}
                      selected={highlightId === item.id}
                      onPress={() => setHighlightId(highlightId === item.id ? undefined : item.id)}
                    />
                  ))}
                </View>

                <SectionHeader title="Your outfits" />
                {outfits.map((outfit, index) => (
                  <Surface
                    key={index}
                    level={2}
                    style={{
                      flexDirection: 'row',
                      gap: spacing.sm,
                      marginBottom: spacing.sm,
                      padding: spacing.sm,
                    }}
                  >
                    {outfit.map((item) => (
                      <View key={item.id} style={{ flex: 1, alignItems: 'center' }}>
                        <GarmentArt category={item.category} color={item.color} size={54} />
                        <Text numberOfLines={1} style={[type.caption, { color: base.textMid }]}>
                          {item.name}
                        </Text>
                      </View>
                    ))}
                  </Surface>
                ))}
              </>
            )}
          </>
        )}

        {/* Outside the empty-wardrobe branch: you can want pieces before you
            own any. */}
        <SectionHeader title={`Want · ${wishlistIds.length}`} />
        {wishlistIds.length ? (
          wishlistIds.map((id) => {
            // A stale persisted id must not crash the pane.
            const product = productById[id];
            if (!product) return null;
            return (
              <Surface
                key={id}
                level={2}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  marginBottom: spacing.sm,
                  padding: spacing.sm,
                }}
              >
                <GarmentArt category={product.category} color={product.color} size={64} />
                <View style={{ flex: 1 }}>
                  <Text
                    onPress={() => router.push(`/product/${product.id}` as never)}
                    numberOfLines={2}
                    accessibilityRole="button"
                    accessibilityLabel={`${product.name}, open details`}
                    style={[type.body, { color: base.textHi, fontWeight: '700' }]}
                  >
                    {product.name}
                  </Text>
                  <Text style={[type.caption, { color: base.textMid }]}>
                    {product.brand}
                  </Text>
                </View>
                <Text
                  onPress={() => toggleWishlist(product.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${product.name} from Want`}
                  style={[type.caption, { color: base.textLow, padding: spacing.xs }]}
                >
                  Remove
                </Text>
              </Surface>
            );
          })
        ) : (
          <Text style={[type.body, { color: base.textLow }]}>
            Swipe a piece right on Explore to want it.
          </Text>
        )}

        <SectionHeader title={`Saved outfits · ${savedOutfits.length}`} />
        {savedOutfits.length ? (
          savedOutfits.map((saved) => {
            const pieces = saved.productIds.flatMap((id) => {
              const product = productById[id];
              return product ? [product] : [];
            });
            return (
              <Surface
                key={saved.id}
                level={2}
                style={{ gap: spacing.sm, marginBottom: spacing.sm, padding: spacing.sm }}
              >
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {pieces.map((product) => (
                    <View key={product.id} style={{ flex: 1, alignItems: 'center' }}>
                      <GarmentArt category={product.category} color={product.color} size={54} />
                      <Text numberOfLines={1} style={[type.caption, { color: base.textMid }]}>
                        {product.name}
                      </Text>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text
                    onPress={() => removeSavedOutfit(saved.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove saved outfit"
                    style={[type.caption, { color: base.textLow, padding: spacing.xs }]}
                  >
                    Remove
                  </Text>
                </View>
              </Surface>
            );
          })
        ) : (
          <Text style={[type.body, { color: base.textLow }]}>
            Save an outfit on Explore to keep it here.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
