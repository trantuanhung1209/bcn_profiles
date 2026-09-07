-- Align users + timeline + 2FA schema that historically landed via db push.
-- Safe/idempotent so existing environments that already have these objects can apply it.

DO $$ BEGIN
  CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EventType" AS ENUM (
    'JOIN_BCN',
    'COURSE_COMPLETE',
    'QUIZ_COMPLETE',
    'PROJECT_COMPLETE',
    'SEMESTER_COMPLETE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;

ALTER TABLE "users" DROP COLUMN IF EXISTS "bio";
ALTER TABLE "users" DROP COLUMN IF EXISTS "isOnline";
ALTER TABLE "users" DROP COLUMN IF EXISTS "lastSeen";

CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone");

CREATE TABLE IF NOT EXISTS "two_factor_recovery_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "two_factor_recovery_codes_userId_idx"
ON "two_factor_recovery_codes"("userId");

DO $$ BEGIN
  ALTER TABLE "two_factor_recovery_codes"
    ADD CONSTRAINT "two_factor_recovery_codes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "timeline_events" (
    "id" SERIAL NOT NULL,
    "user_uuid" TEXT NOT NULL,
    "event_type" "EventType" NOT NULL,
    "title" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "timeline_events_user_uuid_idx"
ON "timeline_events"("user_uuid");

DO $$ BEGIN
  ALTER TABLE "timeline_events"
    ADD CONSTRAINT "timeline_events_user_uuid_fkey"
    FOREIGN KEY ("user_uuid") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
