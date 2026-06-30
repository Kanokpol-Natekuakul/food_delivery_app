CREATE TABLE "disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"customer" text NOT NULL,
	"merchant" text NOT NULL,
	"rider" text NOT NULL,
	"category" text NOT NULL,
	"has_photo" boolean NOT NULL,
	"status" text NOT NULL,
	"refund" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"amount" integer NOT NULL,
	"kind" text NOT NULL,
	"order_id" text NOT NULL,
	"memo" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"dish_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"base_price" integer NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"choice" jsonb,
	"extras" jsonb
);
--> statement-breakpoint
CREATE TABLE "moderation" (
	"account" text PRIMARY KEY NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"downranked" boolean DEFAULT false NOT NULL,
	"notified" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text,
	"rider_id" text,
	"customer_id" text,
	"placed" jsonb NOT NULL,
	"amounts" jsonb NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_overrides" (
	"merchant_id" text PRIMARY KEY NOT NULL,
	"commission_rate" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"current_rate" real NOT NULL,
	"proposed_rate" real NOT NULL,
	"counter_rate" real,
	"reason" text DEFAULT '' NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"g" text NOT NULL,
	"rating" text NOT NULL,
	"cat" text NOT NULL,
	"blurb" text NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"zone" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	CONSTRAINT "users_actor_id_unique" UNIQUE("actor_id")
);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;