import {
  pgTable,
  text,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  id: text("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
