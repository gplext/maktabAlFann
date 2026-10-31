-- ============================================================================
-- migration-05-phases.sql — Maktaba Al-Fann phases 1–4
--   Phase 1: unified secure accounts (encrypted), artwork base type + material
--   Phase 2: staff titles, permissions, task engine
--   Phase 3: checkout (region, channel, payments, Stripe events)
--   Phase 4: museums + buyer layouts
--
-- ADDITIVE ONLY: creates new tables/columns/indexes, drops nothing, rewrites no
-- existing data. Runs in one transaction — any error rolls everything back.
--
-- Run it INSTEAD of `drizzle-kit push` on the existing database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/migration-05-phases.sql
--
-- Why not push: migration-01 added constraints, triggers and indexes that the
-- drizzle schema doesn't declare, so push would DROP them (24 indexes and
-- several CHECK/UNIQUE constraints). Lookup rows (base types, materials, staff
-- titles, task rules, museums) are inserted by the API on first start.
-- ============================================================================
BEGIN;

DO $$ BEGIN
  IF to_regclass('public.auth_accounts') IS NOT NULL THEN
    RAISE EXCEPTION 'migration-05 already applied (auth_accounts exists) — nothing to do';
  END IF;
END $$;

CREATE TABLE "base_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "base_types_name_unique" UNIQUE("name")
);
CREATE TABLE "paint_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'paint' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "paint_materials_name_unique" UNIQUE("name")
);
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"amount" numeric(12, 2) NOT NULL,
	"currency" char(3) DEFAULT 'PKR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"recorded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	CONSTRAINT "payments_provider_ref_unique" UNIQUE("provider_ref")
);
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"full_name_enc" text NOT NULL,
	"email_enc" text,
	"email_hash" text,
	"phone_enc" text,
	"phone_hash" text,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp,
	"phone_verified_at" timestamp,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"last_login_at" timestamp,
	"totp_secret_enc" text,
	"mfa_enabled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_accounts_email_hash_unique" UNIQUE("email_hash"),
	CONSTRAINT "auth_accounts_phone_hash_unique" UNIQUE("phone_hash")
);
CREATE TABLE "auth_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "auth_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text,
	"event" text NOT NULL,
	"ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "auth_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"role" text NOT NULL,
	"note" text,
	"invited_by" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"used_by_account_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_invites_token_hash_unique" UNIQUE("token_hash")
);
CREATE TABLE "user_sessions" (
	"sid" text PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp (6) NOT NULL
);
CREATE TABLE "staff_member_titles" (
	"account_id" text NOT NULL,
	"title_id" integer NOT NULL,
	CONSTRAINT "staff_member_titles_account_id_title_id_pk" PRIMARY KEY("account_id","title_id")
);
CREATE TABLE "staff_title_permissions" (
	"title_id" integer NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "staff_title_permissions_title_id_permission_pk" PRIMARY KEY("title_id","permission")
);
CREATE TABLE "staff_titles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_titles_name_unique" UNIQUE("name")
);
CREATE TABLE "task_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"actor_id" text DEFAULT 'system' NOT NULL,
	"kind" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "task_types" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"trigger" text NOT NULL,
	"required_role" text NOT NULL,
	"required_title_id" integer,
	"sla_hours" integer DEFAULT 48 NOT NULL,
	"auto_assign" text DEFAULT 'least_busy' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"type_code" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"assignee_id" text,
	"required_role" text NOT NULL,
	"required_title_id" integer,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"due_at" timestamp,
	"escalated_at" timestamp,
	"completed_at" timestamp,
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "buyer_museum_layouts" (
	"account_id" text PRIMARY KEY NOT NULL,
	"museum_code" text NOT NULL,
	"wall_color" text,
	"slots" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "museums" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"preset" jsonb NOT NULL,
	"model_url" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
ALTER TABLE "artworks" ADD COLUMN "base_type_id" integer;
ALTER TABLE "artworks" ADD COLUMN "paint_material_id" integer;
ALTER TABLE "artworks" ADD COLUMN "depth_cm" integer;
ALTER TABLE "artworks" ADD COLUMN "weight_grams" integer;
ALTER TABLE "orders" ADD COLUMN "region" text DEFAULT 'local' NOT NULL;
ALTER TABLE "orders" ADD COLUMN "channel" text DEFAULT 'web' NOT NULL;
ALTER TABLE "orders" ADD COLUMN "payment_method" text DEFAULT 'cod' NOT NULL;
ALTER TABLE "orders" ADD COLUMN "payment_status" text DEFAULT 'unpaid' NOT NULL;
ALTER TABLE "orders" ADD COLUMN "shipping_address" text;
ALTER TABLE "orders" ADD COLUMN "shipping_city" text;
ALTER TABLE "orders" ADD COLUMN "shipping_country" text;
ALTER TABLE "orders" ADD COLUMN "whatsapp_ref" text;
ALTER TABLE "orders" ADD COLUMN "confirmed_at" timestamp;
ALTER TABLE "orders" ADD COLUMN "shipped_at" timestamp;
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp;
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp;
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "auth_codes" ADD CONSTRAINT "auth_codes_account_id_auth_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "staff_member_titles" ADD CONSTRAINT "staff_member_titles_account_id_auth_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "staff_member_titles" ADD CONSTRAINT "staff_member_titles_title_id_staff_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."staff_titles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "staff_title_permissions" ADD CONSTRAINT "staff_title_permissions_title_id_staff_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."staff_titles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "task_types" ADD CONSTRAINT "task_types_required_title_id_staff_titles_id_fk" FOREIGN KEY ("required_title_id") REFERENCES "public"."staff_titles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_type_code_task_types_code_fk" FOREIGN KEY ("type_code") REFERENCES "public"."task_types"("code") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_auth_accounts_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."auth_accounts"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_required_title_id_staff_titles_id_fk" FOREIGN KEY ("required_title_id") REFERENCES "public"."staff_titles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "buyer_museum_layouts" ADD CONSTRAINT "buyer_museum_layouts_account_id_auth_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "buyer_museum_layouts" ADD CONSTRAINT "buyer_museum_layouts_museum_code_museums_code_fk" FOREIGN KEY ("museum_code") REFERENCES "public"."museums"("code") ON DELETE no action ON UPDATE no action;
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");
CREATE INDEX "auth_codes_account_idx" ON "auth_codes" USING btree ("account_id","purpose");
CREATE INDEX "auth_events_account_idx" ON "auth_events" USING btree ("account_id");
CREATE INDEX "user_sessions_expire_idx" ON "user_sessions" USING btree ("expire");
CREATE INDEX "task_events_task_idx" ON "task_events" USING btree ("task_id");
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id");
CREATE INDEX "tasks_entity_idx" ON "tasks" USING btree ("entity_type","entity_id");
ALTER TABLE "artworks" ADD CONSTRAINT "artworks_base_type_id_base_types_id_fk" FOREIGN KEY ("base_type_id") REFERENCES "public"."base_types"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "artworks" ADD CONSTRAINT "artworks_paint_material_id_paint_materials_id_fk" FOREIGN KEY ("paint_material_id") REFERENCES "public"."paint_materials"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "orders_contact_phone_idx" ON "orders" USING btree ("contact_phone");
CREATE INDEX "order_lines_artwork_idx" ON "order_line_items" USING btree ("artwork_id");
ALTER TABLE "orders" ADD CONSTRAINT "orders_whatsapp_ref_unique" UNIQUE("whatsapp_ref");

-- ── CHECK constraints from migration-01 that the new code would violate ──────
-- Order lifecycle gained confirmed / in_preparation / completed / refunded.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_status_check";
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_check" CHECK (status IN
  ('pending_purchase','confirmed','in_preparation','paid','shipped','delivered','completed','cancelled','refunded'));
-- Artist sign-up marks high-risk accounts 'flagged' for review.
ALTER TABLE "artists" DROP CONSTRAINT IF EXISTS "artists_is_verified_check";
ALTER TABLE "artists" ADD CONSTRAINT "artists_is_verified_check" CHECK (is_verified IN ('pending','approved','rejected','flagged'));

-- ── Guard rails for the new checkout columns ─────────────────────────────────
ALTER TABLE "orders" ADD CONSTRAINT "orders_region_check" CHECK (region IN ('local','international'));
ALTER TABLE "orders" ADD CONSTRAINT "orders_channel_check" CHECK (channel IN ('web','whatsapp'));
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_check" CHECK (payment_method IN ('cod','bank_transfer','card'));
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_status_check" CHECK (payment_status IN ('unpaid','pending','paid','refunded'));
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_check" CHECK (status IN ('pending','paid','expired','failed','refunded'));
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK (amount >= 0);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check" CHECK (status IN ('open','assigned','in_progress','needs_info','done','rejected'));
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_status_check" CHECK (status IN ('active','suspended'));
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_identifier_check" CHECK (email_hash IS NOT NULL OR phone_hash IS NOT NULL);
ALTER TABLE "artworks" ADD CONSTRAINT "artworks_physical_dims_check" CHECK ((depth_cm IS NULL OR depth_cm >= 0) AND (weight_grams IS NULL OR weight_grams >= 0));

COMMIT;
