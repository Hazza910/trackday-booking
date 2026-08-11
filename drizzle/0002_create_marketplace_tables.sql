CREATE TYPE "public"."group_level" AS ENUM('novice', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('active', 'pending', 'paid', 'transferred', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('msv', 'nolimits');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "provider" NOT NULL,
	"circuit" text NOT NULL,
	"event_date" date NOT NULL,
	"source_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"seller_id" text NOT NULL,
	"group_level" "group_level" NOT NULL,
	"asking_price_in_pence" integer NOT NULL,
	"original_price_in_pence" integer NOT NULL,
	"notes" text,
	"status" "listing_status" DEFAULT 'active' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"buyer_id" text,
	"stripe_session_id" text,
	"amount_paid_in_pence" integer,
	"transferred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listings_status_idx" ON "listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "listings_event_id_idx" ON "listings" USING btree ("event_id");