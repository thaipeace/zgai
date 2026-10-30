import { createClient, type Client, type InValue } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { config } from "./config";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    avatar TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    sender_id TEXT,
    sender_name TEXT NOT NULL DEFAULT '',
    ts INTEGER NOT NULL,
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    quote_sender TEXT,
    quote_text TEXT,
    recalled INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'zalo'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_group_ts ON messages(group_id, ts)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_group_day ON messages(group_id, day)`,
  `CREATE TABLE IF NOT EXISTS summaries (
    group_id TEXT NOT NULL,
    period TEXT NOT NULL,
    key TEXT NOT NULL,
    message_count INTEGER NOT NULL,
    content TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, period, key)
  )`,
  `CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    instruction TEXT NOT NULL,
    output TEXT NOT NULL,
    builtin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    template_id TEXT,
    question TEXT,
    range_from TEXT NOT NULL,
    range_to TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analyses_group ON analyses(group_id, created_at)`,
];

type DbState = { client: Client; ready: Promise<void> };
const g = globalThis as unknown as { __zaloAiDb?: DbState };

function init(): DbState {
  const url = config.dbUrl;
  if (url.startsWith("file:")) mkdirSync("./data", { recursive: true });
  const client = createClient({ url, authToken: config.dbAuthToken });
  const ready = (async () => {
    for (const sql of SCHEMA) await client.execute(sql);
  })();
  return { client, ready };
}

/** Client dùng chung cho cả custom server lẫn route handler của Next. */
export async function db(): Promise<Client> {
  g.__zaloAiDb ??= init();
  await g.__zaloAiDb.ready;
  return g.__zaloAiDb.client;
}

export async function query<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T[]> {
  const res = await (await db()).execute({ sql, args });
  return res.rows as unknown as T[];
}

export async function run(sql: string, args: InValue[] = []): Promise<number> {
  const res = await (await db()).execute({ sql, args });
  return res.rowsAffected;
}

export async function kvGet(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>("SELECT value FROM kv WHERE key = ?", [key]);
  return rows[0]?.value ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  await run(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, Date.now()],
  );
}

export async function kvDelete(key: string): Promise<void> {
  await run("DELETE FROM kv WHERE key = ?", [key]);
}

