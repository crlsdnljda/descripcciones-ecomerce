import {
  pgTable,
  text,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { products } from "./products";

export const descriptionStatusEnum = pgEnum("description_status", [
  "pending",
  "generated",
  "reviewed",
]);

export interface DescriptionOutput {
  descripcion: string;
  materiales: Record<string, string[]>;
}

export const descriptions = pgTable("descriptions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  promptUsed: text("prompt_used"),
  outputJson: jsonb("output_json").$type<DescriptionOutput>(),
  status: descriptionStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
