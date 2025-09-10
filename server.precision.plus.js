
import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import fs from "fs";
import path from "path";
import { z } from "zod";

import db from "./db.js";
import { authRequired, verifyPassword, hashPassword, signToken, cookieName, meHandler } from "./auth.js";
import { computePercentageTax } from "./tax.js";
import { computeIncomeTax, computeIncomeTaxAnnual } from "./income_tax.js";
import { render2551Q_full, render1701Q_full, render1701A_full } from "./pdf_forms_bir_positions_full.js";
import { import2307Csv } from "./importer_2307.js";
import { initAutomation } from "./automation.js";

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.resolve("./data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

// -------- Auth --------
app.post("/auth/signup", async (req, res) => {
  const schema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(6) });
  const d = schema.parse(req.body);
  const exists = db.prepare("SELECT id FROM users WHERE email=?").get(d.email);
  if (exists) return res.status(409).json({ message: "Email already registered" });
  const hash = await hashPassword(d.password);
  const info = db.prepare("INSERT INTO users (name,email,password_hash,role,org_id) VALUES (?,?,?,?,1)").run(d.name, d.email, hash, "user");
  const user = db.prepare("SELECT id,name,email,role,org_id FROM users WHERE id=?").get(info.lastInsertRowid);
  const token = signToken(user);
  res.cookie(cookieName, token, { httpOnly: true, sameSite: "lax" });
  res.status(201).json(user);
});
app.post("/auth/login", async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
  const d = schema.parse(req.body);
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(d.email);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  const ok = await verifyPassword(d.password, user.password_hash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });
  const publicUser = { id:user.id, name:user.name, email:user.email, role:user.role, org_id: user.org_id || 1 };
  const token = signToken(publicUser);
  res.cookie(cookieName, token, { httpOnly: true, sameSite: "lax" });
  res.json(publicUser);
});
app.get("/api/me", authRequired, meHandler);

// -------- Orgs --------
app.get("/api/orgs", authRequired, (req,res)=>{
  const rows = db.prepare("SELECT * FROM organizations ORDER BY id").all();
  res.json(rows);
});
app.post("/api/orgs", authRequired, (req,res)=>{
  const { name, tin } = z.object({ name: z.string().min(1), tin: z.string().optional() }).parse(req.body);
  const info = db.prepare("INSERT INTO organizations (name,tin) VALUES (?,?)").run(name, tin||null);
  res.status(201).json(db.prepare("SELECT * FROM organizations WHERE id=?").get(info.lastInsertRowid));
});
app.post("/api/orgs/switch", authRequired, (req,res)=>{
  const { org_id } = z.object({ org_id: z.number().int().positive() }).parse(req.body);
  const org = db.prepare("SELECT * FROM organizations WHERE id=?").get(org_id);
  if (!org) return res.status(404).json({ message: "Org not found" });
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.sub);
  db.prepare("UPDATE users SET org_id=? WHERE id=?").run(org_id, u.id);
  const token = signToken({ id:u.id, name:u.name, email:u.email, role:u.role, org_id });
  res.cookie(cookieName, token, { httpOnly:true, sameSite: "lax" });
  res.json({ ok:true, org_id });
});

function currentOrgId(req){ return Number(req.user?.org_id || 1); }
function settings() { return db.prepare("SELECT * FROM settings WHERE id=1").get(); }

// -------- Transactions (basic) --------
app.get("/api/tx", authRequired, (req,res)=>{
  const rows = db.prepare("SELECT * FROM transactions WHERE org_id=? ORDER BY date DESC, id DESC").all(currentOrgId(req));
  res.json(rows);
});
app.post("/api/tx", authRequired, (req,res)=>{
  const d = z.object({ date:z.string().min(8), type:z.string(), particulars:z.string().optional(), amount:z.number() }).parse(req.body);
  const info = db.prepare("INSERT INTO transactions (org_id,date,type,particulars,amount) VALUES (?,?,?,?,?)").run(currentOrgId(req), d.date, d.type, d.particulars||'', d.amount);
  res.status(201).json(db.prepare("SELECT * FROM transactions WHERE id=?").get(info.lastInsertRowid));
});

// -------- Credits --------
app.get("/api/credits", authRequired, (req,res)=>{
  const rows = db.prepare("SELECT * FROM credits WHERE org_id=? ORDER BY date DESC, id DESC").all(currentOrgId(req));
  res.json(rows);
});
app.post("/api/credits", authRequired, (req,res)=>{
  const d = z.object({ date:z.string().min(8), type:z.string(), particulars:z.string().optional(), amount:z.number() }).parse(req.body);
  const info = db.prepare("INSERT INTO credits (org_id,date,type,particulars,amount) VALUES (?,?,?,?,?)").run(currentOrgId(req), d.date, d.type, d.particulars||'', d.amount);
  res.status(201).json(db.prepare("SELECT * FROM credits WHERE id=?").get(info.lastInsertRowid));
});

// -------- Import 2307 (file + paste) --------
const upload = multer({ dest: path.join(dataDir, "uploads") });
app.post("/api/import/2307/upload", authRequired, upload.single("file"), (req,res)=>{
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  const text = fs.readFileSync(req.file.path, "utf8");
  const result = import2307Csv(currentOrgId(req), text);
  res.json(result);
});
app.post("/api/import/2307", authRequired, (req,res)=>{
  const { csv } = z.object({ csv: z.string().min(1) }).parse(req.body);
  const result = import2307Csv(currentOrgId(req), csv);
  res.json(result);
});

// -------- Reports --------
app.get("/api/reports/2551q", authRequired, (req,res)=>{
  const year = Number(req.query.year), quarter = Number(req.query.quarter);
  if (!year || !quarter) return res.status(400).json({ message: "year and quarter required" });
  const rpt = computePercentageTax({ year, quarter, org_id: currentOrgId(req) });
  res.json(rpt);
});
app.get("/api/reports/1701q", authRequired, (req,res)=>{
  const year = Number(req.query.year), quarter = Number(req.query.quarter);
  const deduction = (req.query.deduction || 'osd').toLowerCase();
  if (!year || !quarter) return res.status(400).json({ message: "year and quarter required" });
  const mode = deduction==='8pct' ? '8pct' : 'graduated';
  res.json(computeIncomeTax({ year, quarter, mode, org_id: currentOrgId(req) }));
});
app.get("/api/reports/1701a", authRequired, (req,res)=>{
  const year = Number(req.query.year);
  const deduction = (req.query.deduction || 'osd').toLowerCase();
  if (!year) return res.status(400).json({ message: "year required" });
  const mode = deduction==='8pct' ? '8pct' : 'graduated';
  res.json(computeIncomeTaxAnnual({ year, mode, org_id: currentOrgId(req) }));
});

// -------- Print PDFs --------
app.get("/api/print/2551q-full", authRequired, (req,res)=>{
  const year = Number(req.query.year), quarter = Number(req.query.quarter);
  const signer = { name: req.query.signer || "", date: req.query.signed || new Date().toISOString().slice(0,10) };
  const s = settings();
  const rpt = computePercentageTax({ year, quarter, org_id: currentOrgId(req) });
  return render2551Q_full({ settings: s, rpt, signer }, res);
});
app.get("/api/print/1701q-full", authRequired, (req,res)=>{
  const year = Number(req.query.year), quarter = Number(req.query.quarter);
  const mode = (req.query.mode || 'graduated').toLowerCase();
  const signer = { name: req.query.signer || "", date: req.query.signed || new Date().toISOString().slice(0,10) };
  const s = settings();
  if (mode === '8pct') {
    const ytdGross = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE org_id=? AND type='sale' AND substr(date,1,4)=?").get(currentOrgId(req), String(year)).t || 0;
    return render1701Q_full({ settings: s, mode:'8pct', year, quarter, ytdGross, signer }, res);
  } else {
    const startMonth = {1:'01',2:'04',3:'07',4:'10'}[quarter];
    const endMonth = {'01':'04','04':'07','07':'10','10':'01'}[startMonth];
    const endYear = startMonth==='10' ? year+1 : year;
    const start = `${year}-${startMonth}-01`, end = `${endYear}-${endMonth}-01`;
    const gross = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE org_id=? AND type='sale' AND date>=? AND date<?").get(currentOrgId(req), start,end).t || 0;
    const deductible = 0.40 * gross;
    const net = Math.max(0, gross - deductible);
    const tax = 0;
    return render1701Q_full({ settings: s, mode:'graduated', year, quarter, gross, deductible, net, tax, signer }, res);
  }
});
app.get("/api/print/1701a-full", authRequired, (req,res)=>{
  const year = Number(req.query.year);
  const signer = { name: req.query.signer || "", date: req.query.signed || new Date().toISOString().slice(0,10) };
  const s = settings();
  const gross = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE org_id=? AND type='sale' AND substr(date,1,4)=?").get(currentOrgId(req), String(year)).t || 0;
  const deductible = 0.40 * gross;
  const net = Math.max(0, gross - deductible);
  const tax = 0;
  return render1701A_full({ settings: s, mode:'graduated', year, gross, deductible, net, tax, signer }, res);
});

// -------- Automation wiring --------
initAutomation(app);

// Root
app.get("/", (req,res)=> res.redirect("/login.html"));
app.listen(PORT, ()=> console.log("PH SmallBiz on http://localhost:"+PORT));
