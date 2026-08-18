ALTER TABLE "acceptances" ADD COLUMN IF NOT EXISTS "project_id" text;--> statement-breakpoint
ALTER TABLE "acceptances" DROP CONSTRAINT IF EXISTS "acceptances_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acceptances_project_id_idx" ON "acceptances" USING btree ("project_id");
