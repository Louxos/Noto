import { describe, expect, it } from 'vitest';
import { findAdjacentImageNames } from './imageNavigation';

describe('findAdjacentImageNames', () => {
  it('moves naturally through sibling images while skipping non-images', () => {
    const siblings = ['image-10.png', 'notes.txt', 'image-2.PNG', 'cover.jpg', 'preview.pdf'];
    expect(findAdjacentImageNames('image-2.png', siblings)).toEqual({ previousName: 'cover.jpg', nextName: 'image-10.png' });
    expect(findAdjacentImageNames('cover.jpg', siblings)).toEqual({ previousName: null, nextName: 'image-2.PNG' });
    expect(findAdjacentImageNames('image-10.png', siblings)).toEqual({ previousName: 'image-2.PNG', nextName: null });
  });

  it('returns no neighbor when the current path is not a sibling image', () => {
    expect(findAdjacentImageNames('missing.png', ['first.png', 'second.jpg'])).toEqual({ previousName: null, nextName: null });
  });
});
