import { sql } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  username: text("username").unique(),
  bio: text("bio").notNull().default(""),
  location: text("location").notNull().default(""),
  /** When the user last opened their activity feed; null until the first time. */
  feedSeenAt: integer("feed_seen_at", { mode: "timestamp_ms" }),
});
export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("account_user_idx").on(t.userId),
    uniqueIndex("account_provider_idx").on(t.providerId, t.accountId),
  ],
);
export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
export const rateLimit = sqliteTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});
export const project = sqliteTable("project", {
  id: text("id").primaryKey(),
  data: text("data", { mode: "json" })
    .$type<import("../data").Project>()
    .notNull(),
});
export const comment = sqliteTable(
  "comment",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    // Empty string means no update reference; preserves existing comments and votes.
    updateId: text("update_id").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    seedAuthor: text("seed_author"),
    parentId: text("parent_id"),
    text: text("text").notNull(),
    date: text("date").notNull(),
    seedVotes: integer("seed_votes").notNull().default(0),
  },
  (t) => [
    index("comment_project_idx").on(t.projectId),
    index("comment_user_idx").on(t.userId),
    index("comment_parent_idx").on(t.parentId),
  ],
);
/**
 * Projects a user follows. The table keeps its original name from when
 * following was called saving, so existing rows carry over unchanged.
 */
export const follow = sqliteTable(
  "bookmark",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    /**
     * Activity before this time never counts as unread. Set on insert; the
     * database default only exists so the column could be added to old rows.
     */
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`0`)
      .$defaultFn(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.projectId] }),
    index("bookmark_project_idx").on(t.projectId),
  ],
);
export const vote = sqliteTable(
  "vote",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    commentId: text("comment_id")
      .notNull()
      .references(() => comment.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.commentId] }),
    index("vote_comment_idx").on(t.commentId),
  ],
);
/** Images moderators upload; served from /api/uploads/[id]. */
export const upload = sqliteTable("upload", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  data: blob("data", { mode: "buffer" }).notNull(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
