require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("./pool");

async function main() {
  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");
  console.log("Applying schema.sql...");

  // Run on a single dedicated connection with an explicit transaction.
  // Sending the whole file through pool.query() relies on the simple query
  // protocol's implicit transaction, which some connection poolers (e.g.
  // Supabase's transaction-mode pooler) don't honor reliably across a
  // multi-statement batch — that can let some statements silently commit
  // even when a later one fails, leaving retries starting from a different
  // partial state every time instead of a clean one. BEGIN/COMMIT/ROLLBACK
  // on one client removes that ambiguity entirely.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✅ Schema applied.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("--- full Postgres error details ---");
    console.error("message:", err.message);
    console.error("detail:", err.detail);
    console.error("hint:", err.hint);
    console.error("where:", err.where); // pinpoints the exact line inside a DO block, if that's where it failed
    console.error("position:", err.position);
    console.error("schema/table/column:", err.schema, err.table, err.column);
    console.error("constraint:", err.constraint);
    console.error("------------------------------------");
    if (err.position) {
      const charPos = parseInt(err.position, 10);
      const upToError = sql.slice(0, charPos);
      const line = upToError.split("\n").length;
      console.error(`Failed at or near schema.sql line ${line} (character ${charPos}):`);
      console.error(sql.slice(Math.max(0, charPos - 120), charPos + 40).trim());
    }
    throw err;
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});