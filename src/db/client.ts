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
    // App Router renders and prefetches routes concurrently. Keeping this at one
    // lets an abandoned dev render block every later query behind one socket.
    max: 4,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
    max_lifetime: 60 * 5,
    keep_alive: 30,
    connection: {
      application_name: "free-finance",
      statement_timeout: 15_000,
      lock_timeout: 5_000,
      idle_in_transaction_session_timeout: 15_000,
    },
  });
  database = drizzle(sqlClient, { schema });
  return database;
}
