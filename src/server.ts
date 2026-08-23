// bb-plugin-t3sidebar backend — the settled / snoozed store.
//
// This state lives in the plugin's own SQLite database, never on bb's thread.
// Putting it on the thread would mean a schema change, a wire change, and a
// HOST_DAEMON_PROTOCOL_VERSION bump for something only this sidebar
// understands. Here, uninstalling the plugin removes its state with it.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  AUTO_ARCHIVE_OPTIONS,
  autoArchiveDelayMs,
  safeArchiveRoots,
  shouldAutoArchive,
} from "./auto-archive";

const migrations = [
  `CREATE TABLE IF NOT EXISTS thread_lifecycle (
     thread_id      TEXT PRIMARY KEY,
     settled_at     INTEGER,
     snoozed_until  INTEGER,
     snoozed_at     INTEGER
   )`,
];

export interface StoredLifecycleRow {
  threadId: string;
  settledAt: number | null;
  snoozedUntil: number | null;
  snoozedAt: number | null;
}

interface LifecycleDbRow {
  thread_id: string;
  settled_at: number | null;
  snoozed_until: number | null;
  snoozed_at: number | null;
}

const threadIdSchema = z.object({ threadId: z.string().trim().min(1) });
const threadIdsSchema = z.object({
  threadIds: z.array(z.string().trim().min(1)).min(1),
});

export const t3sidebarRpcContract = defineRpcContract({
  listLifecycle: {
    input: z.object({}),
    output: z.object({
      rows: z.array(
        z.object({
          threadId: z.string(),
          settledAt: z.number().nullable(),
          snoozedUntil: z.number().nullable(),
          snoozedAt: z.number().nullable(),
        }),
      ),
    }),
  },
  settleMany: { input: threadIdsSchema, output: z.object({ ok: z.boolean() }) },
  unsettleMany: { input: threadIdsSchema, output: z.object({ ok: z.boolean() }) },
  snooze: {
    input: z.object({
      threadId: z.string().trim().min(1),
      // Absolute wake time, so a snooze means the same thing on every device.
      snoozedUntil: z.number().int().positive(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  unsnooze: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
});

/** Channel the frontend re-reads on. */
export const LIFECYCLE_CHANNEL = "lifecycle";

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    autoArchiveSettledAfter: {
      type: "select",
      label: "Auto-archive settled threads after",
      description: "Uses BB's native archive after a thread stays settled and inactive for this long.",
      options: [...AUTO_ARCHIVE_OPTIONS],
      default: "Never",
    },
  });
  const db = bb.storage.database();
  bb.storage.migrate(db, migrations);

  const readAll = (): StoredLifecycleRow[] =>
    (
      db
        .prepare(
          `SELECT thread_id, settled_at, snoozed_until, snoozed_at
             FROM thread_lifecycle`,
        )
        .all() as LifecycleDbRow[]
    ).map((row) => ({
      threadId: row.thread_id,
      settledAt: row.settled_at,
      snoozedUntil: row.snoozed_until,
      snoozedAt: row.snoozed_at,
    }));

  const write = (row: StoredLifecycleRow): void => {
    db.prepare(
      `INSERT INTO thread_lifecycle
         (thread_id, settled_at, snoozed_until, snoozed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET
         settled_at = excluded.settled_at,
         snoozed_until = excluded.snoozed_until,
         snoozed_at = excluded.snoozed_at`,
    ).run(row.threadId, row.settledAt, row.snoozedUntil, row.snoozedAt);
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId: row.threadId });
  };

  const clear = (threadId: string): void => {
    db.prepare(`DELETE FROM thread_lifecycle WHERE thread_id = ?`).run(
      threadId,
    );
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId });
  };

  const settleMany = db.transaction((threadIds: readonly string[]) => {
    const settledAt = Date.now();
    for (const threadId of new Set(threadIds)) {
      db.prepare(
        `INSERT INTO thread_lifecycle
           (thread_id, settled_at, snoozed_until, snoozed_at)
         VALUES (?, ?, NULL, NULL)
         ON CONFLICT(thread_id) DO UPDATE SET
           settled_at = excluded.settled_at,
           snoozed_until = NULL,
           snoozed_at = NULL`,
      ).run(threadId, settledAt);
    }
  });
  const unsettleMany = db.transaction((threadIds: readonly string[]) => {
    const statement = db.prepare(
      `DELETE FROM thread_lifecycle WHERE thread_id = ?`,
    );
    for (const threadId of new Set(threadIds)) statement.run(threadId);
  });

  bb.rpc.register(t3sidebarRpcContract, {
    async listLifecycle() {
      return { rows: readAll() };
    },
    async settleMany({ threadIds }) {
      settleMany(threadIds);
      bb.realtime.publish(LIFECYCLE_CHANNEL, { threadIds });
      return { ok: true };
    },
    async unsettleMany({ threadIds }) {
      unsettleMany(threadIds);
      bb.realtime.publish(LIFECYCLE_CHANNEL, { threadIds });
      return { ok: true };
    },
    async snooze({ threadId, snoozedUntil }) {
      const now = Date.now();
      write({
        threadId,
        settledAt: null,
        snoozedUntil,
        snoozedAt: now,
      });
      return { ok: true };
    },
    async unsnooze({ threadId }) {
      clear(threadId);
      return { ok: true };
    },
  });

  bb.background.schedule("auto-archive-settled", "17 * * * *", async () => {
    const delayMs = autoArchiveDelayMs(
      (await settings.get()).autoArchiveSettledAfter,
    );
    if (delayMs === null) return;

    const now = Date.now();
    const candidates = readAll().filter(
      (row): row is StoredLifecycleRow & { settledAt: number } =>
        row.settledAt !== null && row.settledAt + delayMs <= now,
    );
    if (candidates.length === 0) return;

    const liveThreads = new Map<
      string,
      Awaited<ReturnType<typeof bb.sdk.threads.list>>[number]
    >();
    const pageSize = 200;
    for (let offset = 0; ; offset += pageSize) {
      const page = await bb.sdk.threads.list({
        archived: false,
        includeHidden: true,
        limit: pageSize,
        offset,
      });
      for (const thread of page) {
        liveThreads.set(thread.id, thread);
      }
      if (page.length < pageSize) break;
    }

    const eligibleIds = new Set<string>();
    for (const row of candidates) {
      const thread = liveThreads.get(row.threadId);
      if (thread === undefined) continue;
      if (shouldAutoArchive(row.settledAt, delayMs, now, thread)) {
        eligibleIds.add(row.threadId);
      }
    }

    for (const threadId of safeArchiveRoots(
      [...liveThreads.values()],
      eligibleIds,
    )) {
      await bb.sdk.threads.archive({ threadId });
    }
  });

  bb.events.on("thread.archived", ({ thread }) => {
    clear(thread.id);
  });
  bb.events.on("thread.deleted", ({ thread }) => {
    clear(thread.id);
  });
}
