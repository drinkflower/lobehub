/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';

import { styleReferencesForArtworkStyle } from './styleReferences';

describe('styleReferencesForArtworkStyle', () => {
  it('uses the current window origin for the line-art reference', () => {
    const references = styleReferencesForArtworkStyle('lineArt');
    const reference = references?.[0];

    expect(reference).toBe(
      `${window.location.origin}/app-images/agent-artwork-styles/line-art-reference.webp`,
    );
    expect(new URL(reference!).origin).toBe(window.location.origin);
  });
});
