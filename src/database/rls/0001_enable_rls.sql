-- Enable Row-Level Security on tenant-scoped tables.
-- Apply with: psql $DATABASE_URL -f src/database/rls/0001_enable_rls.sql
--
-- This SQL runs OUTSIDE Drizzle migrations (DDL, not schema).
-- Run once per environment after the initial Drizzle migration.
--
-- RLS adds a second layer of protection (belt-and-suspenders).
-- Application-level WHERE organization_id = ? is the primary guard.

-- ─── webhook_endpoints ───────────────────────────────────────────────────────

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

-- Allow rows only when current_tenant session variable matches organization_id.
-- current_setting(name, missing_ok) returns '' when not set — never matches a UUID.
CREATE POLICY tenant_isolation ON webhook_endpoints
  USING (organization_id::text = current_setting('app.current_tenant', true));

-- ─── webhook_deliveries ──────────────────────────────────────────────────────

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON webhook_deliveries
  USING (organization_id::text = current_setting('app.current_tenant', true));
