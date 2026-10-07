import { describe, expect, it } from 'vitest';
import { reorderTabs, tabsWithoutOthers, togglePinnedTab } from './tabs';

const tabs = [
  { id: 'a', pinned: true },
  { id: 'b', pinned: false },
  { id: 'c', pinned: false },
];

describe('open tab operations', () => {
  it('reorders tabs by drop target while keeping pinned tabs first', () => {
    const reordered = reorderTabs(tabs, 'c', 'b');
    expect(reordered.map((tab) => tab.id)).toEqual(['a', 'c', 'b']);
    expect(reorderTabs(tabs, 'missing', 'b')).toBe(tabs);
  });

  it('pins and unpins tabs without losing their other data', () => {
    expect(togglePinnedTab(tabs, 'c').map((tab) => [tab.id, tab.pinned])).toEqual([
      ['a', true], ['c', true], ['b', false],
    ]);
    const pinned = togglePinnedTab(tabs, 'a');
    expect(pinned.map((tab) => tab.id)).toEqual(['b', 'c', 'a']);
    expect(pinned[2].pinned).toBe(false);
  });

  it('can keep one tab and discard the rest from the open list', () => {
    expect(tabsWithoutOthers(tabs, 'b')).toEqual([tabs[1]]);
    expect(tabsWithoutOthers(tabs, 'missing')).toBe(tabs);
  });
});
