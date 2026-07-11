ALTER TABLE "sessions" ADD COLUMN "refresh_token_jti" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_refresh_token_jti_idx" ON "sessions" USING btree ("refresh_token_jti");--> statement-breakpoint
CREATE INDEX "sessions_organization_id_idx" ON "sessions" USING btree ("organization_id");