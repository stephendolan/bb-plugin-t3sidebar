# T3 Sidebar

An inbox-style replacement for bb's sidebar thread list, and the reference
example for `app.slots.experimental_threadList`.

This plugin started as an example in the BB repository. Install its public
release from GitHub:

```sh
bb plugin install git:https://github.com/SawyerHood/bb-plugin-t3sidebar.git@^0.1.0
```

Turn it on in **Settings → Appearance → Sidebar**. bb's own list stays the
default, and comes back the moment you switch away or disable this plugin.

The plugin replaces the scrolling list only. bb's New-thread button, search
field, plugin nav rows, and footer stay exactly where they are — this list
filters by the host's search and adds just one control of its own, a project
scope picker.

## The idea

The list never re-orders itself. Threads sort by creation time, newest first,
and hold that place until you park them. Status lives inside each card instead
of in its position, so the sidebar only moves when you act — no row slides
away under your cursor because an agent finished something.

Three shelves:

- **Inbox** — compact two-line cards: project, activity counts, and one
  fixed-width status slot on the first line; title, pull-request number, and
  agent glyph on the second. Pinned threads sit above.

  One slot, one marker, one width, so the whole column lines up. The slot
  shows the status glyph while a thread has something to say, and the age
  ("now", "7m") once it does not. The glyphs are bb's own: the red circle-x
  for a failure, the circle-question for a raised hand, the spinner for live
  work, and a blue notification dot for a thread that finished while you were
  not looking. Both lists sit in the same window, so they speak one language.

- **Snoozed** — hidden until a wake time you chose. A snoozed thread comes
  back early if it starts working or asks you something.
- **Settled** — work you are done with, collapsed to one line each.

Settled threads can optionally be auto-archived after 3, 7, or 14 quiet days.
The default is Never. Auto-archive re-checks that the thread is idle, has no
pending interaction or background work, and has received no new attention
since it was settled before using BB's native archive action.

## Child threads stay reachable

Child threads follow the same lifecycle rules as roots. Children on the active
shelf sit directly below their parent in the inbox; snoozed and settled
children move to their matching shelves. Working children and children that
need input return to the inbox through the same wake rules. Two header chips
keep the complete relationship close at hand:

Child groups start collapsed into the same children pill used in the thread
header. The pill shows a spinner while any child is running. Click it to expand
the children in place, then click the connector rail to collapse them again.

- On a parent: a chip with one coloured disc per child. It opens the list of
  children.
- On a child: a chip that names the parent and opens it.

The parent chip sits on the left of the children chip, so the header reads up
then down. A child that has children of its own shows both. Each disc takes
its colour from the thread id, so the same thread keeps one colour in the list
and in both chips.

An orphan — a child whose parent is deleted — stays in the list, and its
header shows no parent chip.

## What it demonstrates

| Plugin API                                         | Used for                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `experimental_threadList`                          | the sidebar's scrolling list (bb keeps the New-thread button, search, nav rows, and footer) |
| `experimental_threadHeaderAction`                  | the two header chips: children on a parent, and the way back on a child                     |
| `experimental_useSidebarThreads`                   | live threads and projects, from the host's own cache                                        |
| `experimental_useSidebarThreadActions`             | open, open-in-split, new thread                                                             |
| `experimental_useSidebarThreadSplit`               | dragging a card out to a split pane                                                         |
| `experimental_useSidebarThreadPullRequest`         | the `#412` badge, coloured by bb's attention state                                          |
| `@radix-ui/react-context-menu` (shimmed)           | this plugin's own right-click menu, built on the action hook                                |
| `bb.storage.database()` + `bb.rpc` + `bb.realtime` | the settled/snoozed store                                                                   |

The plugin API ships **no components**. Status glyphs and the right-click menu
are both this plugin's own: `indicator` arrives as data, and every menu item is
one call on `experimental_useSidebarThreadActions`. Choosing them is the point
of a replaced sidebar. Deletion still routes through `requestDelete`, so BB
shows its confirmation dialog rather than a plugin deleting a subtree silently.
The small icon and select components also live in this example. The example
does not import BB's private shared UI package.

## Where the lifecycle lives

Settled and snoozed state is in **this plugin's** SQLite database, never on
bb's thread. Putting it on the thread would mean a schema change, a wire
change, and a `HOST_DAEMON_PROTOCOL_VERSION` bump for a concept only this
sidebar understands. Uninstalling the plugin takes its state with it.

One rule matters more than the rest: **a thread that is working can never be
parked.** bb has more kinds of live work than a session status — workflows,
background agents, background commands, plan mode, goals — and every one of
them blocks parking and wakes a parked thread. Hiding running work is the one
failure this feature cannot afford. See `canPark` in `src/lifecycle.ts`.
