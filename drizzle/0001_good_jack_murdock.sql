ALTER TABLE "sessions" ADD COLUMN "access_token_jti" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_used_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "sessions_access_token_jti_idx" ON "sessions" USING btree ("access_token_jti");--> statement-breakpoint
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions" USING btree ("user_id","revoked_at");