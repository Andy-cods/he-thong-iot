-- V4.0 đợt 2 — Phase A: TẠO BẢNG phân hệ Tài chính (6 bảng fin_*).
--
-- Trích từ `drizzle-kit generate` rồi CHỈNH TAY 2 điểm quan trọng:
--   1. Enum tạo trong schema `app` (KHÔNG phải `public`). drizzle-kit sinh ra
--      `public.fin_*` — đúng cái bẫy DRIFT-NOTES.md mục 1 cảnh báo (enum tồn
--      tại ở cả 2 schema với giá trị lệch nhau → lỗi rất khó lần).
--   2. Idempotent: DO block bắt duplicate_object cho enum + FK.
--
-- Chạy file NÀY trước, rồi mới `0055_finance_core.sql` (trigger + seed + ALTER
-- enum import_kind), vì trigger tham chiếu bảng do file này tạo.
--
-- KHÔNG dùng `drizzle-kit push` trên prod: push so sánh TOÀN BỘ schema và có
-- thể sinh ALTER/DROP ngoài ý muốn lên 23 bảng baseline (xem DRIFT-NOTES mục 4).

SET search_path TO app, public;

DO $$ BEGIN
  CREATE TYPE app.fin_account_type AS ENUM('BANK', 'CASH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.fin_counterparty_type AS ENUM('SUPPLIER', 'CUSTOMER', 'EMPLOYEE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.fin_direction AS ENUM('IN', 'OUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.fin_invoice_status AS ENUM('DRAFT', 'UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.fin_payment_method AS ENUM('BANK_TRANSFER', 'CASH', 'CHECK', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app.fin_transaction_status AS ENUM('DRAFT', 'POSTED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "app"."fin_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" app.fin_account_type NOT NULL,
	"bank_name" varchar(255),
	"account_number" varchar(64),
	"opening_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"opening_balance_date" date,
	"current_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);

CREATE TABLE IF NOT EXISTS "app"."fin_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"direction" app.fin_direction NOT NULL,
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "app"."fin_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_no" varchar(64) NOT NULL,
	"direction" app.fin_direction NOT NULL,
	"supplier_id" uuid,
	"purchase_order_id" uuid,
	"sales_order_id" uuid,
	"issue_date" date NOT NULL,
	"due_date" date,
	"subtotal_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '8' NOT NULL,
	"vat_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" app.fin_invoice_status DEFAULT 'UNPAID' NOT NULL,
	"notes" text,
	"attachment_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);

CREATE TABLE IF NOT EXISTS "app"."fin_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"direction" app.fin_direction NOT NULL,
	"account_id" uuid NOT NULL,
	"supplier_id" uuid,
	"payment_date" date NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"method" app.fin_payment_method DEFAULT 'BANK_TRANSFER' NOT NULL,
	"reference_no" varchar(128),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);

CREATE TABLE IF NOT EXISTS "app"."fin_payment_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "app"."fin_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"direction" app.fin_direction NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"amount" numeric(18, 2) NOT NULL,
	"transaction_date" date NOT NULL,
	"description" text,
	"counterparty_type" app.fin_counterparty_type,
	"supplier_id" uuid,
	"purchase_order_id" uuid,
	"sales_order_id" uuid,
	"invoice_id" uuid,
	"payment_id" uuid,
	"attachment_url" text,
	"import_batch_id" uuid,
	"external_ref" varchar(128),
	"dedupe_hash" varchar(64),
	"status" app.fin_transaction_status DEFAULT 'POSTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);

DO $$ BEGIN
 ALTER TABLE "app"."fin_account" ADD CONSTRAINT "fin_account_created_by_user_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."user_account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_category" ADD CONSTRAINT "fin_category_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "app"."fin_category"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_invoice" ADD CONSTRAINT "fin_invoice_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "app"."supplier"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_invoice" ADD CONSTRAINT "fin_invoice_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "app"."purchase_order"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_invoice" ADD CONSTRAINT "fin_invoice_sales_order_id_sales_order_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "app"."sales_order"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_invoice" ADD CONSTRAINT "fin_invoice_created_by_user_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."user_account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_payment" ADD CONSTRAINT "fin_payment_account_id_fin_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "app"."fin_account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_payment" ADD CONSTRAINT "fin_payment_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "app"."supplier"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_payment" ADD CONSTRAINT "fin_payment_created_by_user_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."user_account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_payment_allocation" ADD CONSTRAINT "fin_payment_allocation_payment_id_fin_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "app"."fin_payment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_payment_allocation" ADD CONSTRAINT "fin_payment_allocation_invoice_id_fin_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "app"."fin_invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_transaction" ADD CONSTRAINT "fin_transaction_account_id_fin_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "app"."fin_account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_transaction" ADD CONSTRAINT "fin_transaction_category_id_fin_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "app"."fin_category"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_transaction" ADD CONSTRAINT "fin_transaction_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "app"."supplier"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_transaction" ADD CONSTRAINT "fin_transaction_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "app"."purchase_order"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_transaction" ADD CONSTRAINT "fin_transaction_sales_order_id_sales_order_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "app"."sales_order"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_transaction" ADD CONSTRAINT "fin_transaction_invoice_id_fin_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "app"."fin_invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_transaction" ADD CONSTRAINT "fin_transaction_payment_id_fin_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "app"."fin_payment"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_transaction" ADD CONSTRAINT "fin_transaction_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "app"."import_batch"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "app"."fin_transaction" ADD CONSTRAINT "fin_transaction_created_by_user_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."user_account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "fin_account_code_uk" ON "app"."fin_account" USING btree ("code");

CREATE INDEX IF NOT EXISTS "fin_account_active_idx" ON "app"."fin_account" USING btree ("is_active");

CREATE UNIQUE INDEX IF NOT EXISTS "fin_category_code_uk" ON "app"."fin_category" USING btree ("code");

CREATE INDEX IF NOT EXISTS "fin_category_parent_idx" ON "app"."fin_category" USING btree ("parent_id");

CREATE UNIQUE INDEX IF NOT EXISTS "fin_invoice_no_supplier_uk" ON "app"."fin_invoice" USING btree ("direction","invoice_no","supplier_id");

CREATE INDEX IF NOT EXISTS "fin_invoice_status_idx" ON "app"."fin_invoice" USING btree ("direction","status");

CREATE INDEX IF NOT EXISTS "fin_invoice_supplier_idx" ON "app"."fin_invoice" USING btree ("supplier_id");

CREATE INDEX IF NOT EXISTS "fin_invoice_po_idx" ON "app"."fin_invoice" USING btree ("purchase_order_id");

CREATE INDEX IF NOT EXISTS "fin_invoice_due_date_idx" ON "app"."fin_invoice" USING btree ("due_date");

CREATE UNIQUE INDEX IF NOT EXISTS "fin_payment_code_uk" ON "app"."fin_payment" USING btree ("code");

CREATE INDEX IF NOT EXISTS "fin_payment_account_idx" ON "app"."fin_payment" USING btree ("account_id");

CREATE INDEX IF NOT EXISTS "fin_payment_date_idx" ON "app"."fin_payment" USING btree ("payment_date");

CREATE UNIQUE INDEX IF NOT EXISTS "fin_payment_allocation_uk" ON "app"."fin_payment_allocation" USING btree ("payment_id","invoice_id");

CREATE INDEX IF NOT EXISTS "fin_payment_allocation_payment_idx" ON "app"."fin_payment_allocation" USING btree ("payment_id");

CREATE INDEX IF NOT EXISTS "fin_payment_allocation_invoice_idx" ON "app"."fin_payment_allocation" USING btree ("invoice_id");

CREATE UNIQUE INDEX IF NOT EXISTS "fin_transaction_code_uk" ON "app"."fin_transaction" USING btree ("code");

CREATE UNIQUE INDEX IF NOT EXISTS "fin_transaction_dedupe_uk" ON "app"."fin_transaction" USING btree ("dedupe_hash");

CREATE INDEX IF NOT EXISTS "fin_transaction_account_date_idx" ON "app"."fin_transaction" USING btree ("account_id","transaction_date");

CREATE INDEX IF NOT EXISTS "fin_transaction_po_idx" ON "app"."fin_transaction" USING btree ("purchase_order_id");

CREATE INDEX IF NOT EXISTS "fin_transaction_supplier_idx" ON "app"."fin_transaction" USING btree ("supplier_id");

CREATE INDEX IF NOT EXISTS "fin_transaction_invoice_idx" ON "app"."fin_transaction" USING btree ("invoice_id");

CREATE INDEX IF NOT EXISTS "fin_transaction_payment_idx" ON "app"."fin_transaction" USING btree ("payment_id");

CREATE INDEX IF NOT EXISTS "fin_transaction_import_batch_idx" ON "app"."fin_transaction" USING btree ("import_batch_id");
