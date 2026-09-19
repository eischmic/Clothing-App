import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('lib purity', () => {
  it('never imports React, React Native, or Expo', () => {
    const offenders = walk('lib').filter((file) =>
      /from\s+['"](react|react-native|expo[-/]?[^'"]*)['"]/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
