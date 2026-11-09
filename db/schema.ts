import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});
