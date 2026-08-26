export const AUTO_ARCHIVE_OPTIONS = [
  "Never",
  "3 days",
  "7 days",
  "14 days",
] as const;

export type AutoArchiveDelay = (typeof AUTO_ARCHIVE_OPTIONS)[number];

const DAY_MS = 24 * 60 * 60 * 1_000;

export function autoArchiveDelayMs(value: string): number | null {
  switch (value) {
    case "3 days":
      return 3 * DAY_MS;
    case "7 days":
      return 7 * DAY_MS;
    case "14 days":
      return 14 * DAY_MS;
    default:
      return null;
  }
}

export interface AutoArchiveSignals {
  archivedAt: number | null;
  status: "error" | "stopping" | "idle" | "starting" | "active";
  hasPendingInteraction: boolean;
  latestAttentionAt: number;
  activity: {
    activeWorkflowCount: number;
    activeBackgroundAgentCount: number;
    activeBackgroundCommandCount: number;
    activePlanModeCount: number;
    activeGoalCount: number;
  };
}

export function shouldAutoArchive(
  settledAt: number,
  delayMs: number,
  now: number,
  thread: AutoArchiveSignals,
): boolean {
  if (settledAt + delayMs > now) return false;
  if (
    thread.archivedAt !== null ||
    (thread.status !== "idle" && thread.status !== "error")
  ) {
    return false;
  }
  if (thread.hasPendingInteraction) return false;
  if (thread.latestAttentionAt > settledAt) return false;

  return Object.values(thread.activity).every((count) => count === 0);
}

export interface ArchiveFamilyMember {
  id: string;
  parentThreadId: string | null;
}

export function safeArchiveRoots(
  threads: readonly ArchiveFamilyMember[],
  eligibleIds: ReadonlySet<string>,
): string[] {
  const children = new Map<string, string[]>();
  for (const thread of threads) {
    if (thread.parentThreadId === null) continue;
    const siblings = children.get(thread.parentThreadId) ?? [];
    siblings.push(thread.id);
    children.set(thread.parentThreadId, siblings);
  }

  const hasIneligibleDescendant = (threadId: string): boolean =>
    (children.get(threadId) ?? []).some(
      (childId) =>
        !eligibleIds.has(childId) || hasIneligibleDescendant(childId),
    );

  const safeIds = new Set(
    threads
      .filter(
        ({ id }) =>
          eligibleIds.has(id) && !hasIneligibleDescendant(id),
      )
      .map(({ id }) => id),
  );

  return threads
    .filter(
      ({ id, parentThreadId }) =>
        safeIds.has(id) &&
        (parentThreadId === null || !safeIds.has(parentThreadId)),
    )
    .map(({ id }) => id);
}
