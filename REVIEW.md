# Security & Quality Review

**Scope:** Backend / API layer  
**Stack:** Next.js App Router · TypeScript · Prisma · PostgreSQL  
**Issues ranked by business impact (highest → lowest)**

---

## Issue 1 — SQL Injection in Task Search

| | |
|---|---|
| **File** | `src/app/api/projects/[id]/tasks/route.ts` |
| **Lines** | 27–34 |
| **Category** | Security |

### Description

The `GET /api/projects/[id]/tasks?q=` endpoint builds a raw SQL string through direct string interpolation and executes it with `prisma.$queryRawUnsafe()`. Neither `projectId` (drawn from the URL parameter) nor `q` (a raw query-string value) are sanitised before being embedded in the SQL. An attacker who is a member of one project can craft a `q` value that breaks out of the `ILIKE` clause, removes the `project_id` filter, and reads tasks (or any other table rows) that belong to completely different projects — or runs subqueries to exfiltrate users, password hashes, or membership data.

```ts
// src/app/api/projects/[id]/tasks/route.ts  lines 27-34
const sql = `
  SELECT id, project_id, title, description, status, assignee_id, created_by_id, position, created_at, updated_at
  FROM tasks
  WHERE project_id = '${projectId}'
    AND (title ILIKE '%${q}%' OR description ILIKE '%${q}%')
  ORDER BY position ASC
`;
const tasks = await prisma.$queryRawUnsafe(sql);
```

### Bug in Action

```bash
# Attacker is a legitimate member of project "proj_aaa".
# They craft a q value that removes the project filter entirely,
# returning every task in the database.

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."   # valid token for any user

curl -s "http://localhost:3000/api/projects/proj_aaa/tasks?q=%27%20OR%201%3D1--" \
  -H "Authorization: Bearer $TOKEN"
```

The injected string `' OR 1=1--` turns the WHERE clause into:

```sql
WHERE project_id = 'proj_aaa'
  AND (title ILIKE '%' OR 1=1-- %' OR description ILIKE '%%')
```

Because `OR 1=1` is always true and `--` comments out the remainder, the database returns **all rows in the `tasks` table** regardless of project ownership:

```json
{
  "tasks": [
    { "id": "task_111", "project_id": "proj_aaa", "title": "Q3 roadmap", ... },
    { "id": "task_222", "project_id": "proj_bbb", "title": "Secret feature X", ... },
    { "id": "task_333", "project_id": "proj_ccc", "title": "Security audit notes", ... }
  ]
}
```

### Recommended Fix

Drop `$queryRawUnsafe` entirely. Prisma's `findMany` already supports case-insensitive `OR` search with automatic parameterisation:

```ts
const tasks = await prisma.task.findMany({
  where: {
    projectId,
    OR: [
      { title:       { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ],
  },
  include: { assignee: { select: { id: true, name: true, email: true } } },
  orderBy: { position: "asc" },
});
```

---

## Issue 2 — IDOR: Missing Authorisation on Task PATCH

| | |
|---|---|
| **File** | `src/app/api/tasks/[id]/route.ts` |
| **Lines** | 16–38 |
| **Category** | Security |

### Description

`PATCH /api/tasks/[id]` verifies the caller is authenticated but never checks whether they are a member of the project that owns the task. Any user who holds a valid JWT — regardless of their project membership — can update the title, description, status, position, or assignee of any task in the system. The same gap exists for re-assigning tasks to arbitrary user IDs (see Issue 3). The sibling `DELETE` handler (lines 40–57) does perform the membership check correctly, making the asymmetry especially easy to miss.

```ts
// src/app/api/tasks/[id]/route.ts  lines 16-38
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();               // ← only check: is caller logged in?

  const { id } = await params;
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return notFound("task not found");

  // ← no getProjectMembership() call, no role check
  const task = await prisma.task.update({ where: { id }, data: parsed.data, ... });
  return NextResponse.json({ task });
}
```

### Recommended Fix

Mirror the pattern already used in the `DELETE` handler directly above it:

```ts
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return notFound("task not found");

  // Add these two lines ↓
  const membership = await getProjectMembership(user.id, existing.projectId);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canEditTasks(membership.role)) return forbidden("viewers cannot edit tasks");

  const task = await prisma.task.update({ where: { id }, data: parsed.data, ... });
  return NextResponse.json({ task });
}
```

---

## Issue 3 — No Database-Level Uniqueness on User Email

| | |
|---|---|
| **File** | `prisma/schema.prisma` |
| **Lines** | 23–37 |
| **Category** | Data Integrity |

### Description

The `User` model stores `email` as a plain `String` with no `@unique` attribute and no `@@unique` table constraint. The registration handler does perform an application-level duplicate check, but that check is not atomic: two concurrent `POST /api/auth/register` requests with the same email can both pass the lookup, both find zero existing users, and both call `prisma.user.create()` — resulting in two accounts sharing one email address. Once duplicated, login becomes unpredictable (whichever record Prisma returns first wins), password-reset flows break, and invitation emails reach the wrong user.

```prisma
// prisma/schema.prisma  lines 23-37
model User {
  id           String   @id @default(cuid())
  email        String                          // ← no @unique
  name         String
  passwordHash String   @map("password_hash")
  ...
  @@map("users")
}
```

### Recommended Fix

Add a unique constraint at the schema level so the database enforces it atomically regardless of concurrency:

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique                // ← enforce at DB level
  name         String
  passwordHash String   @map("password_hash")
  ...
  @@map("users")
}
```

Then handle the unique-violation error in the registration handler to return a clean `409 Conflict` instead of a 500.

---

## Issue 4 — Full Task Rows Fetched to Compute a Count (N+1 Over-fetch)

| | |
|---|---|
| **File** | `src/app/api/projects/route.ts` |
| **Lines** | 11–21 |
| **Category** | Performance |

### Description

`GET /api/projects` loads every `Task` row for every project the user belongs to, purely to derive `taskCount: m.project.tasks.length` in the mapping step. A user with 10 projects, each containing 500 tasks, causes Prisma to hydrate 5,000 full task objects — transferring `title`, `description`, `status`, `assigneeId`, and timestamps for each — only to discard all of that data immediately after counting the array length. This amplifies both database I/O and application memory linearly with project size, causing the project list to slow down significantly at scale and making it the first endpoint to time out under load.

```ts
// src/app/api/projects/route.ts  lines 11-21
const memberships = await prisma.membership.findMany({
  where: { userId: user.id },
  include: {
    project: {
      include: {
        owner: { select: { id: true, name: true, email: true } },
        tasks: true,    // ← fetches every task column for every task
      },
    },
  },
});

const projects = memberships.map((m) => ({
  ...
  taskCount: m.project.tasks.length,  // ← only the count is ever used
}));
```

### Recommended Fix

Use Prisma's `_count` relation aggregation, which issues a single `COUNT(*)` subquery instead of materialising all rows:

```ts
const memberships = await prisma.membership.findMany({
  where: { userId: user.id },
  include: {
    project: {
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { tasks: true } },  // ← one COUNT(*), no row transfer
      },
    },
  },
  orderBy: { createdAt: "desc" },
});

const projects = memberships.map((m) => ({
  ...
  taskCount: m.project._count.tasks,
}));
```
