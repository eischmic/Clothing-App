import { deriveVibe } from '@/lib/vibe';

describe('deriveVibe', () => {
  it('returns noir for an empty palette', () => {
    expect(deriveVibe([])).toBe('noir');
  });

  it('picks the majority vibe', () => {
    expect(deriveVibe(['olive', 'forest', 'khaki', 'black'])).toBe('sage');
    expect(deriveVibe(['tan', 'cream', 'camel'])).toBe('sand');
    expect(deriveVibe(['black', 'white', 'grey'])).toBe('noir');
  });

  it('is case and whitespace insensitive', () => {
    expect(deriveVibe([' Olive ', 'FOREST'])).toBe('sage');
  });

  it('ignores unknown colour names', () => {
    expect(deriveVibe(['chartreuse', 'olive', 'forest'])).toBe('sage');
  });

  it('returns noir when every colour is unknown', () => {
    expect(deriveVibe(['chartreuse', 'puce'])).toBe('noir');
  });

  it('breaks ties toward the earlier-listed colour', () => {
    expect(deriveVibe(['rust', 'olive'])).toBe('ember');
    expect(deriveVibe(['olive', 'rust'])).toBe('sage');
  });
});
