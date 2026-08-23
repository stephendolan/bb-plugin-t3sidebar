import { useState } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginSidebarThread,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";
import { cn } from "./lib/utils";
import { Disc } from "./Disc";
import { StatusGlyph } from "./StatusGlyph";
import { childrenOf, threadDisplayTitle } from "./inbox";

const MAX_DISCS = 3;

/**
 * A thread-header shortcut that opens the complete list of this thread's
 * children, including children parked on another lifecycle shelf.
 *
 * These are bb CHILD THREADS — forks, side chats, and plugin-spawned threads.
 * bb's in-turn subagents are activity counters on the parent, not threads, so
 * the label deliberately says "children".
 */
export function SubagentsChip({
  threadId,
  isCompactViewport,
}: PluginThreadHeaderActionProps) {
  const { threads } = useSidebarThreads();
  const actions = useSidebarThreadActions();
  const [open, setOpen] = useState(false);

  const children = childrenOf(threads, threadId);
  if (children.length === 0) return null;

  return (
    <span className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${children.length} child threads`}
        onClick={() => setOpen((value) => !value)}
        className={childrenPillClassName(open)}
      >
        <ChildrenPillContents
          threads={children}
          hideLabel={isCompactViewport}
        />
      </button>
      {open ? (
        <>
          {/* Click-away. The header is a short row, so the list itself is
              absolutely positioned rather than inline. */}
          <span
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            aria-label="Child threads"
            className="absolute right-0 top-9 z-50 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
          >
            <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
              <span className="text-xs font-semibold">Children</span>
              <span className="ml-auto text-2xs text-muted-foreground">
                {children.length}
              </span>
            </div>
            <ul className="flex flex-col gap-px p-1.5 pt-0.5">
              {children.map((child) => (
                <li key={child.id} className="list-none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      actions.open(child.id);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                  >
                    <Disc thread={child} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-xs">
                        {threadDisplayTitle(child)}
                      </span>
                      <span className="truncate text-2xs text-muted-foreground">
                        {child.originKind ?? "thread"}
                      </span>
                    </span>
                    <StatusGlyph
                      indicator={child.indicator}
                      label={child.indicatorLabel}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </span>
  );
}

export function ChildrenPillContents({
  threads,
  hideLabel = false,
}: {
  threads: readonly PluginSidebarThread[];
  hideLabel?: boolean;
}) {
  const needsYou = threads.some((thread) => thread.hasPendingInteraction);
  const isRunning = threads.some((thread) => thread.indicator === "runtime");
  const label = needsYou ? "Needs you" : `${threads.length} children`;
  const shown = threads.slice(0, MAX_DISCS);
  return (
    <>
      <span className="flex shrink-0 items-center" aria-hidden>
        {shown.map((thread, index) => (
          <span key={thread.id} className={cn(index > 0 && "-ml-1.5")}>
            <Disc thread={thread} />
          </span>
        ))}
        {threads.length > MAX_DISCS ? (
          <span className="-ml-1.5">
            <Disc thread={null} />
          </span>
        ) : null}
      </span>
      {hideLabel ? null : <span className="truncate">{label}</span>}
      {isRunning ? (
        <StatusGlyph
          indicator="runtime"
          label="A child thread is running"
          className="size-3"
        />
      ) : null}
    </>
  );
}

export function childrenPillClassName(active = false) {
  return cn(
    "flex h-7 items-center gap-1.5 rounded-full border border-border px-2 text-2xs text-muted-foreground",
    "hover:bg-accent hover:text-foreground",
    active && "bg-accent text-foreground",
  );
}
