export interface PinnedTab {
  id: string;
  pinned?: boolean;
}

export function reorderTabs<T extends PinnedTab>(tabs: T[], sourceId: string, targetId: string): T[] {
  const sourceIndex = tabs.findIndex((tab) => tab.id === sourceId);
  const targetIndex = tabs.findIndex((tab) => tab.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return tabs;
  const reordered = [...tabs];
  const [moving] = reordered.splice(sourceIndex, 1);
  reordered.splice(reordered.findIndex((tab) => tab.id === targetId), 0, moving);
  return [...reordered.filter((tab) => tab.pinned), ...reordered.filter((tab) => !tab.pinned)];
}

export function togglePinnedTab<T extends PinnedTab>(tabs: T[], id: string): T[] {
  const target = tabs.find((tab) => tab.id === id);
  if (!target) return tabs;
  if (target.pinned) {
    const remaining = tabs.filter((tab) => tab.id !== id);
    const pinned = remaining.filter((tab) => tab.pinned);
    const unpinned = remaining.filter((tab) => !tab.pinned);
    return [...pinned, ...unpinned, { ...target, pinned: false }];
  }
  const updated = tabs.map((tab) => tab.id === id ? { ...tab, pinned: true } : tab);
  return [...updated.filter((tab) => tab.pinned), ...updated.filter((tab) => !tab.pinned)];
}

export function tabsWithoutOthers<T extends PinnedTab>(tabs: T[], keepId: string): T[] {
  const keep = tabs.find((tab) => tab.id === keepId);
  return keep ? [keep] : tabs;
}
