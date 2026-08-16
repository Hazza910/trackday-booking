CREATE TYPE "public"."purchase_state" AS ENUM('held', 'paid', 'expired', 'orphaned');--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_id" text NOT NULL,
	"state" "purchase_state" DEFAULT 'held' NOT NULL,
	"asking_price_in_pence" integer NOT NULL,
	"buyer_fee_in_pence" integer NOT NULL,
	"total_in_pence" integer NOT NULL,
	"amount_paid_in_pence" integer,
	"stripe_session_id" text,
	"buyer_details" jsonb,
	"buyer_details_version" text,
	"final_sale_accepted_at" timestamp with time zone,
	"risk_warning_required" boolean NOT NULL,
	"risk_accepted_at" timestamp with time zone,
	"consent_version" text,
	"hold_expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"orphaned_at" timestamp with time zone,
	"transfer_deadline_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "current_purchase_id" uuid;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchases_listing_id_idx" ON "purchases" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "purchases_buyer_id_idx" ON "purchases" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "purchases_state_idx" ON "purchases" USING btree ("state");