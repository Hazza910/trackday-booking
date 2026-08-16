ALTER TABLE "listings" DROP CONSTRAINT "listings_stripe_session_id_unique";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN "buyer_id";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN "stripe_session_id";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN "amount_paid_in_pence";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN "transferred_at";