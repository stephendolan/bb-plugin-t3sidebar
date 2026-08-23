import type { PluginSidebarThread } from "@get-bb/plugin-sdk";

/**
 * The sort that defines this sidebar: newest thread on top, and NOTHING moves
 * it afterwards. Activity never re-orders the list, so a row holds its place
 * from creation until you park it and the screen only changes when you act.
 * Status is carried by the card, not by position.
 *
 * Ties break on id so the order is total and stable across renders.
 */
export function sortByCreatedAtDescending<
  T extends { readonly id: string; readonly createdAt: number },
>(threads: readonly T[]): T[] {
  return [...threads].sort(
    (left, right) =>
      right.createdAt - left.createdAt || left.id.localeCompare(right.id),
  );
}

export function threadDisplayTitle(thread: PluginSidebarThread): string {
  const title = thread.title?.trim();
  if (title) return title;
  const fallback = thread.titleFallback?.trim();
  return fallback ? fallback : "Untitled thread";
}

/** Substring match on the visible title only, preserving the incoming order. */
export function searchThreadsByTitle(
  threads: readonly PluginSidebarThread[],
  query: string,
): PluginSidebarThread[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [...threads];
  return threads.filter((thread) =>
    threadDisplayTitle(thread).toLowerCase().includes(normalized),
  );
}

export interface ProjectScope {
  /** Project id, or null for "all projects". */
  id: string | null;
  name: string;
}

/** Threads in the chosen scope; every thread when the scope is null. */
export function filterByProject(
  threads: readonly PluginSidebarThread[],
  projectId: string | null,
): PluginSidebarThread[] {
  if (projectId === null) return [...threads];
  return threads.filter((thread) => thread.projectId === projectId);
}

/** Archived threads never belong in the inbox. */
export function visibleInboxThreads(
  threads: readonly PluginSidebarThread[],
): PluginSidebarThread[] {
  return threads.filter((thread) => !thread.isArchived);
}

/** Pinned first (they are the user's own ordering), then the static sort. */
export function partitionPinned(threads: readonly PluginSidebarThread[]): {
  pinned: PluginSidebarThread[];
  inbox: PluginSidebarThread[];
} {
  const pinned: PluginSidebarThread[] = [];
  const inbox: PluginSidebarThread[] = [];
  for (const thread of threads) {
    (thread.isPinned ? pinned : inbox).push(thread);
  }
  return { pinned, inbox };
}

export interface NestedThread {
  thread: PluginSidebarThread;
  isNested: boolean;
  isLastSibling: boolean;
}

/** Parents keep the static sort; included children sit directly below them. */
export function nestChildrenUnderParents(
  threads: readonly PluginSidebarThread[],
): NestedThread[] {
  const includedIds = new Set(threads.map((thread) => thread.id));
  const childrenByParent = new Map<string, PluginSidebarThread[]>();
  const roots: PluginSidebarThread[] = [];

  for (const thread of threads) {
    if (
      thread.parentThreadId === null ||
      !includedIds.has(thread.parentThreadId)
    ) {
      roots.push(thread);
      continue;
    }
    const siblings = childrenByParent.get(thread.parentThreadId) ?? [];
    siblings.push(thread);
    childrenByParent.set(thread.parentThreadId, siblings);
  }

  const nested: NestedThread[] = [];
  const visited = new Set<string>();
  const append = (
    thread: PluginSidebarThread,
    isNested: boolean,
    isLastSibling: boolean,
  ) => {
    if (visited.has(thread.id)) return;
    visited.add(thread.id);
    nested.push({ thread, isNested, isLastSibling });
    const children = childrenByParent.get(thread.id) ?? [];
    const sortedChildren = [...children].sort(
      (left, right) => left.createdAt - right.createdAt,
    );
    for (const [index, child] of sortedChildren.entries()) {
      append(child, true, index === sortedChildren.length - 1);
    }
  };

  for (const root of sortByCreatedAtDescending(roots)) {
    append(root, false, false);
  }
  for (const thread of sortByCreatedAtDescending(threads)) {
    append(thread, false, false);
  }
  return nested;
}

/**
 * The parent of one thread, or null when the thread is a root, when the id is
 * unknown, or when the parent row is gone (deleted). The parent may be
 * archived or in another project: the current scope may omit those, but the
 * child still needs a way back to them.
 */
export function parentOf(
  threads: readonly PluginSidebarThread[],
  threadId: string,
): PluginSidebarThread | null {
  const thread = threads.find((candidate) => candidate.id === threadId);
  const parentThreadId = thread?.parentThreadId;
  if (!parentThreadId) return null;
  return threads.find((candidate) => candidate.id === parentThreadId) ?? null;
}

/** The children of one thread, oldest first (the order they were spawned). */
export function childrenOf(
  threads: readonly PluginSidebarThread[],
  parentThreadId: string,
): PluginSidebarThread[] {
  return threads
    .filter((thread) => thread.parentThreadId === parentThreadId)
    .sort((left, right) => left.createdAt - right.createdAt);
}

/** Every descendant of one thread, breadth-first and oldest sibling first. */
export function descendantsOf(
  threads: readonly PluginSidebarThread[],
  parentThreadId: string,
): PluginSidebarThread[] {
  const descendants: PluginSidebarThread[] = [];
  const queue = childrenOf(threads, parentThreadId);
  const visited = new Set([parentThreadId]);
  while (queue.length > 0) {
    const thread = queue.shift()!;
    if (visited.has(thread.id)) continue;
    visited.add(thread.id);
    descendants.push(thread);
    queue.push(...childrenOf(threads, thread.id));
  }
  return descendants;
}

export function familyOf(
  threads: readonly PluginSidebarThread[],
  parent: PluginSidebarThread,
): PluginSidebarThread[] {
  return [parent, ...descendantsOf(threads, parent.id)];
}
