DO $$
BEGIN
  IF to_regclass('public."User"') IS NOT NULL AND to_regclass('public.users') IS NULL THEN
    ALTER TABLE "public"."User" RENAME TO "users";
  END IF;
END $$;
