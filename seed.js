
import db from "./db.js";
import { hashPassword } from "./auth.js";

const pass = await hashPassword("secret123");
try {
  db.prepare("INSERT INTO users (name,email,password_hash,role,org_id) VALUES (?,?,?,?,1)").run("Demo Owner","owner@example.com",pass,"admin");
} catch {}

const tx = db.prepare("INSERT INTO transactions (org_id,date,type,amount,particulars) VALUES (?,?,?,?,?)");
const today = new Date().toISOString().slice(0,10);
tx.run(1, today, "sale", 50000, "POS Sales");
tx.run(1, today, "sale", 25000, "Shopee Sales");
tx.run(1, today, "expense", 5000, "Supplies");

console.log("Seeded. Login with owner@example.com / secret123");
