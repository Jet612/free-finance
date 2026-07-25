import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

let database: Database | undefined;
let sqlClient: ReturnType<typeof postgres> | undefined;

export function getDb(): Database {
  if (database) return database;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  // Supabase's port 6543 transaction pooler cannot retain prepared statements.
  sqlClient = postgres(connectionString, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
  });
  database = drizzle(sqlClient, { schema });
  return database;
}
