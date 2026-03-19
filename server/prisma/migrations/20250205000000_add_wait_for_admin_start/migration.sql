-- AlterTable (idempotent: skip if columns exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Quiz' AND column_name = 'waitForAdminStart') THEN
    ALTER TABLE "Quiz" ADD COLUMN "waitForAdminStart" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Quiz' AND column_name = 'startedByAdminAt') THEN
    ALTER TABLE "Quiz" ADD COLUMN "startedByAdminAt" TIMESTAMP(3);
  END IF;
END $$;
