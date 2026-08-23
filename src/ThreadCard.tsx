import {
  experimental_useSidebarThreadPullRequest as useSidebarThreadPullRequest,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon, type IconName } from "./components/Icon";
import { cn } from "./lib/utils";
import { RowContextMenu } from "./RowContextMenu";
import { ProviderGlyph } from "./ProviderGlyph";
import { STATUS_SLOT_CLASS, StatusOrTime } from "./StatusSlot";
import { threadDisplayTitle } from "./inbox";
import { resolveSnoozePresets } from "./lifecycle";
import {
  ChildrenPillContents,
  childrenPillClassName,
} from "./SubagentsChip";

/**
 * One thread as a two-line card: project, activity, and status first; then
 * title, pull request, and provider. Status lives in the row instead of in its
 * position, which is what lets the list stay still.
 *
 * The row is a positioned container with a full-bleed anchor UNDER the
 * controls, the way bb's own thread row does it: a `<button>` inside an `<a>`
 * is invalid interactive nesting and breaks keyboard behaviour.
 */
export function ThreadCard({
  thread,
  projectName,
  isActive,
  canPark,
  onNavigate,
  onSettle,
  onSnooze,
  now,
  isNested = false,
  isLastSibling = false,
  childThreads = [],
  childrenCollapsed = false,
  onToggleChildren,
}: {
  thread: PluginSidebarThread;
  projectName: string | null;
  isActive: boolean;
  /** False while the thread is working or blocked on the user. */
  canPark: boolean;
  onNavigate: () => void;
  onSettle: () => void;
  onSnooze: (snoozedUntil: number) => void;
  /** Quantized clock, so every card in one render agrees on "now". */
  now: number;
  /** A visible child rendered immediately after its parent. */
  isNested?: boolean;
  /** Ends the child group's vertical connector at this row. */
  isLastSibling?: boolean;
  childThreads?: readonly PluginSidebarThread[];
  childrenCollapsed?: boolean;
  onToggleChildren?: () => void;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  // Opt-in per row: this costs a git-host lookup, and threads sharing a
  // worktree share one.
  const { pullRequest } = useSidebarThreadPullRequest(thread.id);

  return (
    <RowContextMenu thread={thread}>
      <li
        className={cn(
          "list-none",
          isNested && [
            "relative ml-4 pl-2",
            "before:absolute before:-left-px before:top-0 before:border-l before:border-sidebar-border",
            "after:absolute after:-left-px after:top-1/2 after:w-2 after:border-t after:border-sidebar-border",
            isLastSibling ? "before:h-1/2" : "before:h-full",
          ],
        )}
      >
        {isNested && onToggleChildren ? (
          <button
            type="button"
            aria-label="Collapse children"
            onClick={onToggleChildren}
            className="absolute -left-1 top-0 z-10 h-full w-3 cursor-pointer rounded hover:bg-sidebar-accent/60"
          />
        ) : null}
        <div
          className={cn(
            "group/card relative rounded-md px-2.5 py-1.5 transition-colors",
            isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
            // A thread open in another pane gets a weaker tint than the active
            // row, so the two states stay distinguishable.
            !isActive && layout !== null && "bg-sidebar-accent/30",
          )}
        >
          <a
            // Both attributes, or bb's nine thread shortcuts stop finding rows.
            data-sidebar-thread-shortcut-target=""
            data-sidebar-thread-id={thread.id}
            href="#"
            aria-label={threadDisplayTitle(thread)}
            {...splitProps}
            onClick={(event) => {
              event.preventDefault();
              actions.open(thread.id, {
                split: event.metaKey || event.ctrlKey,
              });
              onNavigate();
            }}
            className="absolute inset-0 cursor-pointer rounded-md"
          />
          <div className="pointer-events-none relative flex h-5 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-2xs font-medium text-muted-foreground">
              {projectName ?? " "}
            </span>
            {thread.activity.workflows > 0 ? (
              <ActivityCount
                label="workflows"
                count={thread.activity.workflows}
              />
            ) : null}
            {thread.activity.backgroundAgents > 0 ? (
              <ActivityCount
                label="background agents"
                count={thread.activity.backgroundAgents}
              />
            ) : null}
            {/* Status at rest, park actions on hover. Only the status yields,
                so the project name never shifts. */}
            {canPark ? (
              <span className="pointer-events-auto hidden items-center gap-0.5 group-hover/card:flex">
                <ParkButton
                  label="Snooze until tomorrow"
                  icon="Clock"
                  onActivate={() =>
                    onSnooze(resolveSnoozePresets(new Date())[2]!.snoozedUntil)
                  }
                />
                <ParkButton
                  label="Settle thread"
                  icon="Check"
                  onActivate={onSettle}
                />
              </span>
            ) : null}
            <span
              className={cn(
                STATUS_SLOT_CLASS,
                canPark && "group-hover/card:hidden",
              )}
            >
              <StatusOrTime thread={thread} now={now} />
            </span>
          </div>
          <div
            className={cn(
              // Weight alone carries unread. Fading the title — or the whole
              // card — makes a thread at rest read as disabled, and at rest is
              // what most of the list is most of the time.
              "pointer-events-none relative mt-0.5 flex h-5 min-w-0 items-center gap-1.5 text-foreground",
              thread.isUnread && "font-medium",
            )}
          >
            <span className="min-w-0 flex-1 truncate text-sm">
              {threadDisplayTitle(thread)}
            </span>
            {pullRequest ? (
              <a
                href={pullRequest.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                title={pullRequest.title}
                className={cn(
                  "pointer-events-auto relative shrink-0 font-mono text-2xs hover:underline",
                  pullRequest.state === "merged"
                    ? "text-[color:var(--pr-merged)]"
                    : pullRequest.attention === "checks_failed" ||
                        pullRequest.attention === "conflicts"
                      ? "text-destructive-text"
                      : pullRequest.attention === "ready_to_merge"
                        ? "text-success-foreground"
                        : "text-muted-foreground",
                )}
              >
                #{pullRequest.number}
              </a>
            ) : null}
            <ProviderGlyph providerId={thread.providerId} />
          </div>
          {childrenCollapsed && childThreads.length > 0 && onToggleChildren ? (
            <div className="pointer-events-auto relative mt-1 flex">
              <button
                type="button"
                aria-expanded={false}
                aria-label={`${childThreads.length} child threads; expand`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleChildren();
                }}
                className={childrenPillClassName()}
              >
                <ChildrenPillContents threads={childThreads} />
              </button>
            </div>
          ) : null}
        </div>
      </li>
    </RowContextMenu>
  );
}

function ParkButton({
  label,
  icon,
  onActivate,
}: {
  label: string;
  icon: Extract<IconName, "Clock" | "Check">;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate();
      }}
      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
    >
      <Icon name={icon} className="size-3.5" />
    </button>
  );
}

function ActivityCount({ label, count }: { label: string; count: number }) {
  return (
    <span
      aria-label={`${count} ${label}`}
      className="shrink-0 rounded bg-muted px-1 font-mono text-2xs text-muted-foreground"
    >
      {count}
    </span>
  );
}
