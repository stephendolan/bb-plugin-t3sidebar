import { describe, expect, it } from "vitest";
import {
  autoArchiveDelayMs,
  safeArchiveRoots,
  shouldAutoArchive,
} from "./auto-archive";

const quiet = {
  archivedAt: null,
  status: "idle" as const,
  hasPendingInteraction: false,
  latestAttentionAt: 100,
  activity: {
    activeWorkflowCount: 0,
    activeBackgroundAgentCount: 0,
    activeBackgroundCommandCount: 0,
    activePlanModeCount: 0,
    activeGoalCount: 0,
  },
};

describe("autoArchiveDelayMs", () => {
  it("maps supported settings and disables unknown values", () => {
    expect(autoArchiveDelayMs("Never")).toBeNull();
    expect(autoArchiveDelayMs("7 days")).toBe(7 * 24 * 60 * 60 * 1_000);
    expect(autoArchiveDelayMs("surprise")).toBeNull();
  });
});

describe("shouldAutoArchive", () => {
  it("archives a quiet thread once its delay has elapsed", () => {
    expect(shouldAutoArchive(100, 50, 150, quiet)).toBe(true);
  });

  it("archives a quiet errored thread once its delay has elapsed", () => {
    expect(
      shouldAutoArchive(100, 50, 150, { ...quiet, status: "error" }),
    ).toBe(true);
  });

  it("keeps a thread that received attention after settling", () => {
    expect(
      shouldAutoArchive(100, 50, 150, { ...quiet, latestAttentionAt: 101 }),
    ).toBe(false);
  });

  it.each([
    { status: "active" as const },
    { status: "starting" as const },
    { status: "stopping" as const },
    { hasPendingInteraction: true },
    { activity: { ...quiet.activity, activeBackgroundAgentCount: 1 } },
    { archivedAt: 140 },
  ])("keeps live or already archived work: %o", (override) => {
    expect(
      shouldAutoArchive(100, 50, 150, { ...quiet, ...override }),
    ).toBe(false);
  });
});

describe("safeArchiveRoots", () => {
  const family = [
    { id: "parent", parentThreadId: null },
    { id: "child", parentThreadId: "parent" },
    { id: "grandchild", parentThreadId: "child" },
  ];

  it("archives an eligible family once at its root", () => {
    expect(
      safeArchiveRoots(family, new Set(["parent", "child", "grandchild"])),
    ).toEqual(["parent"]);
  });

  it("does not cascade over an ineligible descendant", () => {
    expect(safeArchiveRoots(family, new Set(["parent", "child"]))).toEqual([]);
  });

  it("can archive an independently eligible child", () => {
    expect(safeArchiveRoots(family, new Set(["grandchild"]))).toEqual([
      "grandchild",
    ]);
  });

  it("archives a safe child when its eligible parent has an active sibling", () => {
    const withSibling = [
      ...family,
      { id: "active-sibling", parentThreadId: "parent" },
    ];
    expect(
      safeArchiveRoots(
        withSibling,
        new Set(["parent", "child", "grandchild"]),
      ),
    ).toEqual(["child"]);
  });
});
