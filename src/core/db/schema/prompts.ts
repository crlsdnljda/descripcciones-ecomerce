import {
  pgTable,
  text,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const prompts = pgTable("prompts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
