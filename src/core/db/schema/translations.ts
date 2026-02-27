import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { descriptions, type DescriptionOutput } from "./descriptions";

export const translations = pgTable("translations", {
  id: text("id").primaryKey(),
  descriptionId: text("description_id")
    .notNull()
    .references(() => descriptions.id, { onDelete: "cascade" }),
  language: varchar("language", { length: 10 }).notNull(),
  outputJson: jsonb("output_json").$type<DescriptionOutput>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
