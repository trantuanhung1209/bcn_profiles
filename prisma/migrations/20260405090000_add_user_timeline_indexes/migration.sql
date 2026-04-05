-- Speed up user listing/filtering by status and created date ordering
CREATE INDEX IF NOT EXISTS "users_status_createdAt_idx"
ON "users" ("status", "createdAt" DESC);

-- Speed up loading latest timeline events for each user
CREATE INDEX IF NOT EXISTS "timeline_events_user_uuid_created_at_idx"
ON "timeline_events" ("user_uuid", "created_at" DESC);
