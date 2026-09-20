import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useAppStore } from '@/store/useAppStore';
import { PANES } from '@/lib/pager';
import { Surface } from '@/components/primitives';
import { useTheme } from '@/theme/useTheme';

export function StylePill({ onNavigateToPane }: { onNavigateToPane?: (index: number) => void }) {
  const { base, accent, type, spacing, radii, reduceMotion } = useTheme();
  const profiles = useAppStore((s) => s.profiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);
  const [open, setOpen] = useState(false);

  const activeName = profiles.find((p) => p.id === activeProfileId)?.name ?? 'Your style';

  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Style: ${activeName}. Switch style.`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          borderRadius: radii.chip,
          borderWidth: 1,
          borderColor: base.hairline,
          backgroundColor: base.elev1,
        }}
      >
        <Text style={[type.body, { color: base.textHi }]}>{activeName}</Text>
        <Text style={[type.caption, { color: base.textMid }]}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close style switcher"
          style={{
            flex: 1,
            backgroundColor: '#0008',
            justifyContent: 'center',
            padding: spacing.lg,
          }}
        >
          <Surface level={2} style={{ gap: spacing.xs }}>
            {profiles.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  setActiveProfile(p.id);
                  setOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: p.id === activeProfileId }}
                accessibilityLabel={p.name}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  paddingVertical: spacing.sm,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: p.id === activeProfileId ? accent.base : base.hairline,
                  }}
                />
                <Text style={[type.body, { color: base.textHi }]}>{p.name}</Text>
              </Pressable>
            ))}
            <View
              style={{ height: 1, backgroundColor: base.hairline, marginVertical: spacing.xs }}
            />
            <Text
              onPress={() => {
                setOpen(false);
                // The panes are siblings inside the pager, not routes, so this
                // cannot go through the router.
                onNavigateToPane?.(PANES.findIndex((p) => p.id === 'profile'));
              }}
              accessibilityRole="button"
              accessibilityLabel="Manage profiles"
              style={[type.body, { color: accent.bright, paddingVertical: spacing.sm }]}
            >
              Manage profiles
            </Text>
          </Surface>
        </Pressable>
      </Modal>
    </View>
  );
}
