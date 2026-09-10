-- +goose Up
-- The public landing page joins generate and presentations as a place a
-- signed-in user can choose to land on.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_landing_page_check";

ALTER TABLE "users"
	ADD CONSTRAINT "users_landing_page_check"
		CHECK ("landing_page" IN ('generate', 'presentations', 'landing'));

-- +goose Down
UPDATE "users" SET "landing_page" = 'generate' WHERE "landing_page" = 'landing';

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_landing_page_check";

ALTER TABLE "users"
	ADD CONSTRAINT "users_landing_page_check"
		CHECK ("landing_page" IN ('generate', 'presentations'));
