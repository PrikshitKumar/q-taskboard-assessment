import Airtable from "airtable";
import type { FieldSet } from "airtable";

const BATCH_SIZE = 10;   // Airtable max records per create/update call
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

// AirtableError doesn't extend Error — extract message from either shape
function errMsg(err: unknown): string {
  if (!err) return "unknown error";
  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    // AirtableError has .message and optionally .error (the code string)
    const msg = e.message ?? e.error;
    if (msg) return `${msg}${e.statusCode ? ` (HTTP ${e.statusCode})` : ""}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// 429 and 5xx are transient; anything else (4xx) is permanent
function isTransient(err: unknown): boolean {
  const code = (err as { statusCode?: number }).statusCode;
  if (code === undefined) return true;          // network error — retry
  return code === 429 || code >= 500;
}

async function withRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (attempt < MAX_RETRIES && isTransient(err)) {
      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 200;
      await new Promise((r) => setTimeout(r, delay));
      return withRetry(fn, attempt + 1);
    }
    throw err;
  }
}

function getTable() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME ?? "Tasks";
  if (!apiKey || !baseId) {
    throw new Error(
      "AIRTABLE_API_KEY and AIRTABLE_BASE_ID must be set in environment variables"
    );
  }
  // noRetryIfRateLimited: true so our withRetry is the sole retry layer
  return new Airtable({ apiKey, noRetryIfRateLimited: true }).base(baseId)<FieldSet>(tableName);
}

export type TaskExportRecord = {
  taskId: string;
  projectId: string;
  projectName: string;
  title: string;
  status: string;
  description: string | null;
  assignee: string | null;
  createdAt: string;
};

export type ExportSummary = {
  exported: number;
  created: number;
  updated: number;
  failed: number;
  failures: Array<{ taskId: string; title: string; error: string }>;
};

const STATUS_LABELS: Record<string, string> = {
  todo:        "Todo",
  in_progress: "In Progress",
  review:      "In Review",
  done:        "Done",
};

function toFields(r: TaskExportRecord): FieldSet {
  const fields: FieldSet = {
    Name:          r.title,
    "Task ID":     r.taskId,
    "Project ID":  r.projectId,
    Project:       r.projectName,
    Status:        STATUS_LABELS[r.status] ?? r.status,
    "Created At":  r.createdAt,
  };
  if (r.description) fields["Description"] = r.description;
  if (r.assignee)    fields["Assignee"]    = r.assignee;
  return fields;
}

export async function exportTasksToAirtable(tasks: TaskExportRecord[]): Promise<ExportSummary> {
  if (tasks.length === 0) {
    return { exported: 0, created: 0, updated: 0, failed: 0, failures: [] };
  }

  const table = getTable();
  const summary: ExportSummary = { exported: 0, created: 0, updated: 0, failed: 0, failures: [] };

  // --- 1. Build idempotency map: taskId → airtable record id ---
  const existingMap = new Map<string, string>();
  try {
    const projectId = tasks[0].projectId;
    const existing = await withRetry(() =>
      table
        .select({ filterByFormula: `{Project ID} = "${projectId}"`, fields: ["Task ID"] })
        .all()
    );
    for (const rec of existing) {
      const taskId = rec.fields["Task ID"] as string | undefined;
      if (taskId) existingMap.set(taskId, rec.id);
    }
  } catch {
    // On first export the table is empty — all tasks will be created fresh
  }

  // --- 2. Partition into creates and updates ---
  const toCreate: TaskExportRecord[] = [];
  const toUpdate: Array<{ record: TaskExportRecord; airtableId: string }> = [];
  for (const task of tasks) {
    const airtableId = existingMap.get(task.taskId);
    airtableId
      ? toUpdate.push({ record: task, airtableId })
      : toCreate.push(task);
  }

  // --- 3. Process creates in batches ---
  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const batch = toCreate.slice(i, i + BATCH_SIZE);
    try {
      await withRetry(() => table.create(batch.map((r) => ({ fields: toFields(r) })), { typecast: true }));
      summary.created  += batch.length;
      summary.exported += batch.length;
    } catch (batchErr) {
      // Batch failed — fall back to individual records so one bad record doesn't lose the rest
      console.error("[airtable] batch create failed:", batchErr);
      for (const record of batch) {
        try {
          await withRetry(() => table.create([{ fields: toFields(record) }], { typecast: true }));
          summary.created  += 1;
          summary.exported += 1;
        } catch (err) {
          console.error("[airtable] record create failed:", err);
          summary.failed += 1;
          summary.failures.push({ taskId: record.taskId, title: record.title, error: errMsg(err) });
        }
      }
    }
  }

  // --- 4. Process updates in batches ---
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + BATCH_SIZE);
    try {
      await withRetry(() =>
        table.update(batch.map(({ airtableId, record }) => ({ id: airtableId, fields: toFields(record) })), { typecast: true })
      );
      summary.updated  += batch.length;
      summary.exported += batch.length;
    } catch (batchErr) {
      console.error("[airtable] batch update failed:", batchErr);
      for (const { airtableId, record } of batch) {
        try {
          await withRetry(() => table.update([{ id: airtableId, fields: toFields(record) }], { typecast: true }));
          summary.updated  += 1;
          summary.exported += 1;
        } catch (err) {
          console.error("[airtable] record update failed:", err);
          summary.failed += 1;
          summary.failures.push({ taskId: record.taskId, title: record.title, error: errMsg(err) });
        }
      }
    }
  }

  return summary;
}
