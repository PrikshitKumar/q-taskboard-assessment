# Task Comments — Testing Guide

## Endpoints

| Method | Path | Who can call |
|--------|------|--------------|
| `GET` | `/api/tasks/:taskId/comments` | Any project member (including viewers) |
| `POST` | `/api/tasks/:taskId/comments` | Members and admins only (not viewers) |

Comments are **append-only** — there are no `PATCH` or `DELETE` routes.

---

## Seed users (password: `password123` for all)

| Email | Role on Q3 Launch | Role on Customer Onboarding |
|-------|-------------------|-----------------------------|
| `meera@taskboard.dev` | admin | member |
| `arjun@taskboard.dev` | member | admin |
| `kavya@example.com` | member | — (not a member) |
| `dev@example.com` | viewer | — (not a member) |
| `lina@example.com` | — (not a member) | member |

---

## Setup

```bash
# Obtain tokens
KAVYA=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"kavya@example.com","password":"password123"}' | jq -r '.token')

DEV=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"password123"}' | jq -r '.token')

LINA=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lina@example.com","password":"password123"}' | jq -r '.token')

ARJUN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"arjun@taskboard.dev","password":"password123"}' | jq -r '.token')

# Pick any task ID from Q3 Launch
PROJECT_ID=$(curl -s http://localhost:3000/api/projects \
  -H "Authorization: Bearer $KAVYA" | jq -r '.projects[0].id')

TASK_ID=$(curl -s "http://localhost:3000/api/projects/$PROJECT_ID/tasks" \
  -H "Authorization: Bearer $KAVYA" | jq -r '.tasks[0].id')
```

---

## Test Cases

### TC-01 — No token → 401

```bash
curl -s -w "\nHTTP %{http_code}" "http://localhost:3000/api/tasks/$TASK_ID/comments"
```

```
{"error":"unauthorized"}
HTTP 401
```

---

### TC-02 — GET comments as member (empty thread)

```bash
curl -s "http://localhost:3000/api/tasks/$TASK_ID/comments" \
  -H "Authorization: Bearer $KAVYA" | jq .
```

```json
{
  "comments": []
}
```

---

### TC-03 — POST as non-member → 403

`lina` belongs to Customer Onboarding, not Q3 Launch.

```bash
curl -s -X POST "http://localhost:3000/api/tasks/$TASK_ID/comments" \
  -H "Authorization: Bearer $LINA" \
  -H "Content-Type: application/json" \
  -d '{"body":"I should not be able to post this"}' | jq .
```

```json
{
  "error": "you are not a member of this project"
}
```

---

### TC-04 — POST as viewer → 403

`dev` is a viewer on Q3 Launch — can read, cannot post.

```bash
curl -s -X POST "http://localhost:3000/api/tasks/$TASK_ID/comments" \
  -H "Authorization: Bearer $DEV" \
  -H "Content-Type: application/json" \
  -d '{"body":"Viewer trying to comment"}' | jq .
```

```json
{
  "error": "viewers cannot post comments"
}
```

---

### TC-05 — POST with empty body → 400

```bash
curl -s -X POST "http://localhost:3000/api/tasks/$TASK_ID/comments" \
  -H "Authorization: Bearer $KAVYA" \
  -H "Content-Type: application/json" \
  -d '{"body":""}' | jq .
```

```json
{
  "error": "invalid input",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "body": ["comment cannot be empty"]
    }
  }
}
```

---

### TC-06 — POST as member (kavya) → 201

```bash
curl -s -X POST "http://localhost:3000/api/tasks/$TASK_ID/comments" \
  -H "Authorization: Bearer $KAVYA" \
  -H "Content-Type: application/json" \
  -d '{"body":"Started working on this — blocked on design assets."}' | jq .
```

```json
{
  "comment": {
    "id": "cmq5lrtmp0001gs8tyyc7vohn",
    "taskId": "cmq5korgw000vgs3175rdi83y",
    "authorId": "cmq5korgk0002gs31mk01y1dw",
    "body": "Started working on this — blocked on design assets.",
    "createdAt": "2026-06-08T19:27:31.777Z",
    "author": {
      "id": "cmq5korgk0002gs31mk01y1dw",
      "name": "Kavya Reddy",
      "email": "kavya@example.com"
    }
  }
}
```

---

### TC-07 — POST as admin (arjun) → 201

```bash
curl -s -X POST "http://localhost:3000/api/tasks/$TASK_ID/comments" \
  -H "Authorization: Bearer $ARJUN" \
  -H "Content-Type: application/json" \
  -d '{"body":"Design assets are ready, synced with Kavya offline."}' | jq .
```

```json
{
  "comment": {
    "id": "cmq5lrttf0003gs8tu386hglj",
    "taskId": "cmq5korgw000vgs3175rdi83y",
    "authorId": "cmq5korgj0001gs31memnzath",
    "body": "Design assets are ready, synced with Kavya offline.",
    "createdAt": "2026-06-08T19:27:32.019Z",
    "author": {
      "id": "cmq5korgj0001gs31memnzath",
      "name": "Arjun Rao",
      "email": "arjun@taskboard.dev"
    }
  }
}
```

---

### TC-08 — GET populated thread — chronological order

After TC-06 and TC-07, the thread should list both comments oldest-first.

```bash
curl -s "http://localhost:3000/api/tasks/$TASK_ID/comments" \
  -H "Authorization: Bearer $KAVYA" \
  | jq '.comments[] | {body, author: .author.name, createdAt}'
```

```json
{
  "body": "Started working on this — blocked on design assets.",
  "author": "Kavya Reddy",
  "createdAt": "2026-06-08T19:27:31.777Z"
}
{
  "body": "Design assets are ready, synced with Kavya offline.",
  "author": "Arjun Rao",
  "createdAt": "2026-06-08T19:27:32.019Z"
}
```

---

### TC-09 — Viewer can GET comments

`dev` is a viewer — read access is allowed.

```bash
curl -s "http://localhost:3000/api/tasks/$TASK_ID/comments" \
  -H "Authorization: Bearer $DEV" | jq '.comments | length'
```

```
2
```

---

### TC-10 — PATCH on a comment → 404 (no route)

```bash
curl -s -o /dev/null -w "HTTP %{http_code}" \
  -X PATCH "http://localhost:3000/api/tasks/$TASK_ID/comments/some-comment-id" \
  -H "Authorization: Bearer $KAVYA" \
  -H "Content-Type: application/json" \
  -d '{"body":"edited"}'
```

```
HTTP 404
```

---

### TC-11 — DELETE on a comment → 404 (no route)

```bash
curl -s -o /dev/null -w "HTTP %{http_code}" \
  -X DELETE "http://localhost:3000/api/tasks/$TASK_ID/comments/some-comment-id" \
  -H "Authorization: Bearer $KAVYA"
```

```
HTTP 404
```

---

### TC-12 — GET/POST on nonexistent task → 404

```bash
curl -s "http://localhost:3000/api/tasks/nonexistent-id/comments" \
  -H "Authorization: Bearer $KAVYA" | jq .

curl -s -X POST "http://localhost:3000/api/tasks/nonexistent-id/comments" \
  -H "Authorization: Bearer $KAVYA" \
  -H "Content-Type: application/json" \
  -d '{"body":"hello"}' | jq .
```

```json
{ "error": "task not found" }
{ "error": "task not found" }
```

---

## Summary Matrix

| TC | Scenario | Expected | Actual |
|----|----------|----------|--------|
| 01 | No token | 401 | ✅ 401 |
| 02 | GET empty thread (member) | 200 `[]` | ✅ 200 |
| 03 | POST as non-member | 403 | ✅ 403 |
| 04 | POST as viewer | 403 | ✅ 403 |
| 05 | POST with empty body | 400 | ✅ 400 |
| 06 | POST as member | 201 | ✅ 201 |
| 07 | POST as admin | 201 | ✅ 201 |
| 08 | GET thread in order | 200, oldest first | ✅ 200 |
| 09 | GET as viewer | 200 | ✅ 200 |
| 10 | PATCH (edit) comment | 404 | ✅ 404 |
| 11 | DELETE comment | 404 | ✅ 404 |
| 12 | GET/POST nonexistent task | 404 | ✅ 404 |

---

# Bulk Export to Airtable — Testing Guide

## Endpoint

| Method | Path | Who can call |
|--------|------|--------------|
| `POST` | `/api/projects/:projectId/export` | Members and admins only (not viewers) |

The endpoint fetches every task for the project and pushes them to your Airtable base.
Running it more than once is safe — existing records are **updated**, new ones are **created**.

---

## Files added

| File | Purpose |
|------|---------|
| `src/lib/airtable.ts` | Real Airtable client — retry logic, batch create/update, per-record failure isolation |
| `src/app/api/projects/[id]/export/route.ts` | POST endpoint — auth, DB fetch, calls `exportTasksToAirtable()` |
| `src/app/projects/[id]/page.tsx` | "export to Airtable" button added to project header (admin/member only) |
| `src/lib/airtable-mock.ts` | Test double for unit tests — **do not use in production** |

---

## Step 1 — Get Airtable credentials (one-time setup)

### 1a. Create a free Airtable account
Go to [airtable.com](https://airtable.com) → sign up → create a **new Base**.

### 1b. Create a table named "Tasks"
Inside the new base, rename the default table to **Tasks** (or keep the name and set
`AIRTABLE_TABLE_NAME` in `.env` to match). The table needs at least one row to activate
the API — the seed data will fill it on first export.

### 1c. Create a Personal Access Token
Go to **airtable.com/create/tokens** → "Create new token":

| Setting | Value |
|---------|-------|
| Name | `taskboard-export` (any name) |
| Scopes | `data.records:read` + `data.records:write` |
| Access | Select the specific base you just created |

Copy the token — it starts with `pat…` and is shown only once.

### 1d. Find your Base ID
Open the base in the browser. The URL looks like:

```
https://airtable.com/appXXXXXXXXXXXXXX/tblYYYYYYYY/...
                      ^^^^^^^^^^^^^^^^
                      this is your Base ID
```

### 1e. Add to `.env`

```bash
AIRTABLE_API_KEY="patXXXXXXXXXXXXXX.YYYYYYYY"
AIRTABLE_BASE_ID="appXXXXXXXXXXXXXX"
AIRTABLE_TABLE_NAME="Tasks"
```

Restart the dev server after editing `.env`.

---

## Step 2 — Token and project ID

```bash
# Login (member on Q3 Launch — kavya or arjun work equally well)
KAVYA=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"kavya@example.com","password":"password123"}' | jq -r '.token')

DEV=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"password123"}' | jq -r '.token')

LINA=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lina@example.com","password":"password123"}' | jq -r '.token')

PROJECT_ID=$(curl -s http://localhost:3000/api/projects \
  -H "Authorization: Bearer $KAVYA" | jq -r '.projects[0].id')
```

---

## Test Cases

### TC-E01 — No token → 401 ✅ verified

```bash
curl -s -o /dev/null -w "HTTP %{http_code}" \
  -X POST "http://localhost:3000/api/projects/$PROJECT_ID/export"
```

```
HTTP 401
```

---

### TC-E02 — Non-member triggers export → 403 ✅ verified

`lina` belongs to Customer Onboarding, not Q3 Launch.

```bash
curl -s -X POST "http://localhost:3000/api/projects/$PROJECT_ID/export" \
  -H "Authorization: Bearer $LINA" | jq .
```

```json
{ "error": "you are not a member of this project" }
```

---

### TC-E03 — Viewer triggers export → 403 ✅ verified

`dev` is a viewer on Q3 Launch — read-only.

```bash
curl -s -X POST "http://localhost:3000/api/projects/$PROJECT_ID/export" \
  -H "Authorization: Bearer $DEV" | jq .
```

```json
{ "error": "viewers cannot trigger exports" }
```

---

### TC-E04 — Credentials not configured → 502 ✅ verified

Before filling in `.env`:

```bash
curl -s -X POST "http://localhost:3000/api/projects/$PROJECT_ID/export" \
  -H "Authorization: Bearer $KAVYA" | jq .
```

```json
{ "error": "AIRTABLE_API_KEY and AIRTABLE_BASE_ID must be set in environment variables" }
```

---

### TC-E05 — First export: all tasks created → 200

> Requires `.env` credentials (Step 1). Q3 Launch has 7 seed tasks.

```bash
curl -s -X POST "http://localhost:3000/api/projects/$PROJECT_ID/export" \
  -H "Authorization: Bearer $KAVYA" | jq .
```

Expected response:

```json
{
  "exported": 7,
  "created": 7,
  "updated": 0,
  "failed": 0,
  "failures": []
}
```

Open your Airtable base — all 7 Q3 Launch tasks should be visible with their title,
status, description, assignee, project name, and creation date.

---

### TC-E06 — Second export: all tasks updated (idempotent) → 200

Run the exact same command again without any changes:

```bash
curl -s -X POST "http://localhost:3000/api/projects/$PROJECT_ID/export" \
  -H "Authorization: Bearer $KAVYA" | jq .
```

Expected response (no duplicates created):

```json
{
  "exported": 7,
  "created": 0,
  "updated": 7,
  "failed": 0,
  "failures": []
}
```

Airtable still shows 7 records — same count, no duplicates.

---

### TC-E07 — Export after adding a new task → partial create + updates

```bash
# Create one more task
curl -s -X POST "http://localhost:3000/api/projects/$PROJECT_ID/tasks" \
  -H "Authorization: Bearer $KAVYA" \
  -H "Content-Type: application/json" \
  -d '{"title":"New task added after first export","status":"todo"}' | jq .task.id

# Re-export
curl -s -X POST "http://localhost:3000/api/projects/$PROJECT_ID/export" \
  -H "Authorization: Bearer $KAVYA" | jq .
```

Expected response:

```json
{
  "exported": 8,
  "created": 1,
  "updated": 7,
  "failed": 0,
  "failures": []
}
```

---

## Airtable field schema (auto-created on first export)

| Airtable field | Source | Type |
|----------------|--------|------|
| `Name` | `task.title` | Text (primary field) |
| `Task ID` | `task.id` | Text — used for idempotency |
| `Project ID` | `project.id` | Text — used to scope the idempotency lookup |
| `Project` | `project.name` | Text |
| `Status` | `task.status` | Text (`todo` / `in_progress` / `review` / `done`) |
| `Description` | `task.description` | Text (omitted if null) |
| `Assignee` | `task.assignee.name` | Text (omitted if unassigned) |
| `Created At` | `task.createdAt` | Text (ISO 8601) |

---

## Error handling behaviour

| Error type | Retry? | Behaviour |
|------------|--------|-----------|
| Network failure (no status code) | Yes — up to 3×, exponential backoff | Retried automatically |
| `429 Too Many Requests` | Yes — up to 3× | Retried automatically |
| `5xx Server Error` | Yes — up to 3× | Retried automatically |
| `4xx` (except 429) | No | Recorded in `failures[]`, export continues |
| Batch failure (one bad record in 10) | Falls back to per-record | Other 9 records still pushed |
| All records fail | Endpoint returns 200 with `failed: N` | Caller can inspect `failures[]` |

---

## Summary Matrix

| TC | Scenario | Expected | Status |
|----|----------|----------|--------|
| E01 | No token | 401 | ✅ verified live |
| E02 | Non-member triggers export | 403 | ✅ verified live |
| E03 | Viewer triggers export | 403 | ✅ verified live |
| E04 | Credentials not set | 502 with clear message | ✅ verified live |
| E05 | First export | 200, all created | Verify after Step 1 |
| E06 | Second export (idempotent) | 200, all updated, 0 duplicates | Verify after E05 |
| E07 | Export after adding a task | 200, 1 created + N updated | Verify after E06 |
