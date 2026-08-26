-- +goose Up
-- Signed-in users land on the generate page unless they pick the presentation
-- library as their default page in settings.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "landing_page" text NOT NULL DEFAULT 'generate' CHECK ("landing_page" IN ('generate', 'presentations'));

-- +goose Down
ALTER TABLE "users" DROP COLUMN IF EXISTS "landing_page";
