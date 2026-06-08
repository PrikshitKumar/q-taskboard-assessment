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
