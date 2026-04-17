import { pgSchema } from "drizzle-orm/pg-core";

/**
 * Single schema namespace `app` cho toàn bộ V1 (theo quyết định plan Section 5.1).
 * Có thể split schema sau bằng ALTER TABLE SET SCHEMA khi thực sự cần.
 */
export const appSchema = pgSchema("app");
