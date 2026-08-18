import { describe, expect, it } from 'vitest';

import { styleReferencesForArtworkStyle } from './styleReferences';

describe('styleReferencesForArtworkStyle', () => {
  it('returns a publicly reachable absolute URL for the line-art reference', () => {
    const references = styleReferencesForArtworkStyle('lineArt');
    const reference = references?.[0];

    expect(reference).toBe(
      'https://app.lobehub.com/app-images/agent-artwork-styles/line-art-reference.webp',
    );
    expect(() => new URL(reference!)).not.toThrow();
  });
});
