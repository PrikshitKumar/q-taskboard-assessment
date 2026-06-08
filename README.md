# TaskBoard — Project Management App

A Next.js 15 fullstack application for managing projects, tasks, and team members. TypeScript + Prisma + PostgreSQL on the server, React 19 + TanStack Query on the client.

## Submission

| Artifact | Path / Link |
|----------|-------------|
| Code Review | [`REVIEW.md`](./REVIEW.md) |
| Terminal Log | [`TERMINAL_LOG.md`](./TERMINAL_LOG.md) |
| Testing Guide | [`TESTING.md`](./TESTING.md) |
| Airtable Export Screenshots | [`screenshots/`](./screenshots/) |
| Comment Test Script | [`scripts/test-comments.sh`](./scripts/test-comments.sh) |
| Recording URL | https://drive.google.com/file/d/1l7pspD_fDTVbHguuYN9oj4_JrgwfaPoL/view?usp=sharing |

---

## Quick Setup (Docker — Recommended)

```bash
# Clone and enter the repo
git clone <repo-url> && cd taskboard

# Start the app and database
docker-compose up --build

# In a separate terminal, set up the database
docker-compose exec web npm run db:seed

# Run the test suite
docker-compose exec web npm test

# The app is now running at http://localhost:3000
```

## Manual Setup (without Docker)

Requires: Node.js 20+, PostgreSQL 15+

```bash
npm install
cp .env.example .env   # edit DATABASE_URL if your local Postgres differs
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm test
npm run dev
```

## Environment Variables

```
DATABASE_URL=postgresql://<user>@localhost:5432/<db>
JWT_SECRET=<any-secret-string>
AIRTABLE_API_KEY=<personal-access-token>   # needs data.records:read + data.records:write
AIRTABLE_BASE_ID=<appXXXXXXXXXXXXXX>
AIRTABLE_TABLE_NAME=Tasks
```

## AI Tool Conversation Tracking

**This repository is configured to automatically capture your AI coding tool conversation history with each git commit.** This includes conversations from Claude Code, Cursor, Aider, Continue.dev, Cody, Cline, and Windsurf.

This is part of the Ajackus evaluation process. We evaluate how you collaborate with AI tools — your prompting strategy, how you break down problems, and how you review AI suggestions. The captured conversations help us understand your workflow.

**How it works:**
- A pre-commit git hook runs automatically before each commit
- It copies conversation files from AI tool directories (e.g., `.claude/`, `.cursor/`) into `.ai-conversations/`
- These files are staged and included in your commit
- You don't need to do anything — it happens automatically

**What's captured:** Only AI tool conversation logs stored in the project directory. No system files, browsing history, or anything outside this repository.

**If you prefer a tool that doesn't store local conversations** (like browser-based ChatGPT), the screen recording will capture your interactions instead. No additional action needed from you.

## Seed Data

The seed file creates:
- 5 users across 3 projects with different roles (admin / member / viewer)
- 3 projects with realistic task distributions
- 12 tasks spanning all four statuses (`todo`, `in_progress`, `review`, `done`)

All user passwords are: `password123`

| Email | Role on which project |
|-------|----------------------|
| meera@taskboard.dev | admin on Q3 Launch & Internal Tools, member on Onboarding |
| arjun@taskboard.dev | admin on Onboarding, member on Q3 Launch |
| kavya@example.com | member on Q3 Launch |
| dev@example.com | viewer on Q3 Launch |
| lina@example.com | member on Onboarding |

## Authentication

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"meera@taskboard.dev","password":"password123"}'

# Use the returned token
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/projects
```

## API Endpoints

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Sign in, get JWT
- `GET /api/users/me` — Current user

### Projects
- `GET /api/projects` — List your projects
- `POST /api/projects` — Create a project (creator becomes admin)
- `GET /api/projects/:id` — Project detail with tasks and members
- `PATCH /api/projects/:id` — Update project (admin only)
- `DELETE /api/projects/:id` — Delete project (admin only)

### Tasks
- `GET /api/projects/:id/tasks` — List tasks (supports `?q=` search)
- `POST /api/projects/:id/tasks` — Create a task (admin/member)
- `PATCH /api/tasks/:id` — Update a task (admin/member)
- `DELETE /api/tasks/:id` — Delete a task (admin/member)

### Comments
- `GET /api/tasks/:id/comments` — List comments chronologically (all members)
- `POST /api/tasks/:id/comments` — Post a comment (admin/member only; append-only)

### Export
- `POST /api/projects/:id/export` — Bulk export tasks to Airtable (admin/member only)

## Tech Stack

- Node.js 20 (runtime)
- Next.js 15 (App Router) / React 19
- TypeScript 5 (strict mode)
- Prisma 6 + PostgreSQL 16
- TanStack Query 5 (client data)
- Zod 3 (schema validation)
- Tailwind CSS 3
- bcryptjs + jsonwebtoken
- Airtable 0.12 (export integration)
- Vitest 2 (testing)
