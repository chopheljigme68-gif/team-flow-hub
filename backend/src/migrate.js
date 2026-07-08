require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("./pool");

async function main() {
  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");
  console.log("Applying schema.sql...");
  await pool.query(sql);
  console.log("✅ Schema applied.");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
