import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  feedUrl: text("feed_url"),
  feedType: varchar("feed_type", { length: 20 }).default("json"),
  columnMapping: jsonb("column_mapping").$type<Record<string, string>>(),
  idColumn: varchar("id_column", { length: 255 }),
  imageColumn: varchar("image_column", { length: 255 }),
  openaiApiKey: text("openai_api_key"),
  openaiModelGeneration: varchar("openai_model_generation", { length: 100 }).default("gpt-4o"),
  openaiModelTranslation: varchar("openai_model_translation", { length: 100 }).default("gpt-4o-mini"),
  systemPrompt: text("system_prompt"),
  languages: jsonb("languages").$type<string[]>().default(["fr", "pt", "de", "it"]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
