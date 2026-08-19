import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// 1. User-owned career data lives in platform storage, not in the browser.
export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const savedJobs = sqliteTable("saved_jobs", {
  userId: text("user_id").notNull(),
  jobId: text("job_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.userId, table.jobId] }),
  index("idx_saved_jobs_user_id").on(table.userId),
]);

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  jobId: text("job_id").notNull(),
  status: text("status").notNull().default("Applied"),
  note: text("note").notNull().default(""),
  appliedAt: text("applied_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_applications_user_job").on(table.userId, table.jobId),
  index("idx_applications_user_id").on(table.userId),
]);

export const resumes = sqliteTable("resumes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  objectKey: text("object_key").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  score: integer("score").notNull(),
  skills: text("skills").notNull().default("[]"),
  uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_resumes_user_id").on(table.userId)]);
