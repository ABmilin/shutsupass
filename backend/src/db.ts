import { Pool } from "pg";

// DATABASE_URLはdocker-compose.ymlで注入される
// 例: postgres://shutsupass:shutsupass@db:5432/shutsupass
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
