import { pgTable, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { projects } from "./projects";

export interface JobResult {
  ref: string;
  status: string;
  error?: string;
}

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "generate" | "translate"
  status: text("status").notNull().default("running"), // "running" | "completed" | "failed"
  total: integer("total").notNull().default(0),
  completed: integer("completed").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  results: jsonb("results").$type<JobResult[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
