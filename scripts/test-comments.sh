#!/bin/bash
# Run all Task Comments test cases against the local dev server.
# Usage: bash scripts/test-comments.sh

BASE="http://localhost:3000"
TASK_ID="cmq5korgw000vgs3175rdi83y"

KAVYA_TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"kavya@example.com","password":"password123"}' | jq -r '.token')
DEV_TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"password123"}' | jq -r '.token')
ARJUN_TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"arjun@taskboard.dev","password":"password123"}' | jq -r '.token')
LINA_TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"lina@example.com","password":"password123"}' | jq -r '.token')

echo "--- no token → 401 ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" "$BASE/api/tasks/$TASK_ID/comments"

echo "--- GET thread (member) ---"
curl -s "$BASE/api/tasks/$TASK_ID/comments" -H "Authorization: Bearer $KAVYA_TOKEN" | jq .

echo "--- non-member POST → 403 ---"
curl -s -X POST "$BASE/api/tasks/$TASK_ID/comments" -H "Authorization: Bearer $LINA_TOKEN" -H "Content-Type: application/json" -d '{"body":"should not work"}' | jq .

echo "--- viewer POST → 403 ---"
curl -s -X POST "$BASE/api/tasks/$TASK_ID/comments" -H "Authorization: Bearer $DEV_TOKEN" -H "Content-Type: application/json" -d '{"body":"viewer comment"}' | jq .

echo "--- empty body → 400 ---"
curl -s -X POST "$BASE/api/tasks/$TASK_ID/comments" -H "Authorization: Bearer $KAVYA_TOKEN" -H "Content-Type: application/json" -d '{"body":""}' | jq .

echo "--- member posts → 201 ---"
curl -s -X POST "$BASE/api/tasks/$TASK_ID/comments" -H "Authorization: Bearer $KAVYA_TOKEN" -H "Content-Type: application/json" -d '{"body":"Started working on this, blocked on design assets."}' | jq .

echo "--- admin posts → 201 ---"
curl -s -X POST "$BASE/api/tasks/$TASK_ID/comments" -H "Authorization: Bearer $ARJUN_TOKEN" -H "Content-Type: application/json" -d '{"body":"Design assets are ready, synced with Kavya offline."}' | jq .

echo "--- viewer reads thread (chronological) ---"
curl -s "$BASE/api/tasks/$TASK_ID/comments" -H "Authorization: Bearer $DEV_TOKEN" | jq '.comments[] | {body, author: .author.name, createdAt}'

echo "--- PATCH → 404 (append-only) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X PATCH "$BASE/api/tasks/$TASK_ID/comments/any-id" -H "Authorization: Bearer $KAVYA_TOKEN"

echo "--- DELETE → 404 (append-only) ---"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X DELETE "$BASE/api/tasks/$TASK_ID/comments/any-id" -H "Authorization: Bearer $KAVYA_TOKEN"
