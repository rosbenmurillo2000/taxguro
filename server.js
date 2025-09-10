
import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import fs from "fs";
import path from "path";
import { z } from "zod";
import db from "./db.js";
import { addAuthRoutes, authRequired } from "./auth.js";
import { computePercentageTax } from "./tax.js";
import { computeIncomeTax } from "./income_tax.js";
import { render2551Q_full, render1701Q_full, render1701A_full } from "./pdf_forms_bir_positions_full.js";
import { import2307Csv } from "./importer_2307.js";
import { initAutomation } from "./automation.js";

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.resolve("./data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

app.use(cookieParser());
app.use(express.json({ limit:"10mb" }));
app.use(express.static("public"));

// Auth
addAuthRoutes(app);

// Orgs
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
  if (!org) return res.status(404).json({ message:"Org not found" });
  db.prepare("UPDATE users SET org_id=? WHERE id=?").run(org_id, req.user.sub);
  res.json({ ok:true, org_id });
});

// Import transactions (generic)
app.post("/api/import/transactions", authRequired, (req,res)=>{
  const { csv } = z.object({ csv: z.string().min(1) }).parse(req.body);
  const rows = csv.split(/\r?\n/).filter(Boolean);
  const header = rows.shift().split(",").map(h=>h.trim().toLowerCase());
  const idx = Object.fromEntries(header.map((c,i)=>[c,i]));
  const stmt = db.prepare("INSERT INTO transactions (org_id,date,type,amount,particulars) VALUES (?,?,?,?,?)");
  const trx = db.transaction(()=>{
    rows.forEach(line=>{
      const parts = line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(s=>s.replace(/^\"|\"$/g,''));
      const date = parts[idx.date] || parts[idx['transaction date']] || parts[idx['posting date']];
      const type = (parts[idx.type] || 'sale').toLowerCase();
      const amount = Number(String(parts[idx.amount]).replace(/[^0-9.\-]/g,'')) || 0;
      const particulars = parts[idx.particulars] || parts[idx.description] || '';
      stmt.run(req.user.org_id||1, date, type, amount, particulars);
    });
  });
  trx();
  res.json({ imported: rows.length });
});

// 2307 importer
app.post("/api/import/2307", authRequired, (req,res)=>{
  const { csv } = z.object({ csv: z.string().min(1) }).parse(req.body);
  res.json(import2307Csv(req.user.org_id||1, csv));
});

// Reports JSON
app.get("/api/reports/2551q", authRequired, (req,res)=>{
  const year = Number(req.query.year), quarter = Number(req.query.quarter);
  if (!year || !quarter) return res.status(400).json({ message:"year and quarter required" });
  res.json(computePercentageTax({ year, quarter, org_id: req.user.org_id||1 }));
});
app.get("/api/reports/1701q", authRequired, (req,res)=>{
  const year = Number(req.query.year), quarter = Number(req.query.quarter);
  const mode = (req.query.deduction === '8pct' || req.query.mode === '8pct') ? '8pct' : 'graduated';
  if (!year || !quarter) return res.status(400).json({ message:"year and quarter required" });
  res.json(computeIncomeTax({ year, quarter, mode, org_id: req.user.org_id||1 }));
});
app.get("/api/reports/1701a", authRequired, (req,res)=>{
  const year = Number(req.query.year);
  if (!year) return res.status(400).json({ message:"year required" });
  res.json({ year, note:"Use print endpoint for full PDF numbers" });
});

// PDF Print
app.get("/api/print/2551q-full", authRequired, (req,res)=>{
  const year = Number(req.query.year), quarter = Number(req.query.quarter);
  const signer = { name: req.query.signer || "", date: req.query.signed || "" };
  const s = db.prepare("SELECT * FROM settings WHERE id=1").get();
  const rpt = computePercentageTax({ year, quarter, org_id: req.user.org_id||1 });
  return render2551Q_full({ settings: s, rpt, signer }, res);
});
app.get("/api/print/1701q-full", authRequired, (req,res)=>{
  const year = Number(req.query.year), quarter = Number(req.query.quarter);
  const mode = (req.query.mode || 'graduated').toLowerCase();
  const signer = { name: req.query.signer || "", date: req.query.signed || "" };
  const s = db.prepare("SELECT * FROM settings WHERE id=1").get();
  if (mode === '8pct') {
    const ytdGross = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE type='sale' AND substr(date,1,4)=? AND org_id=?").get(String(year), req.user.org_id||1).t || 0;
    return render1701Q_full({ settings: s, mode:'8pct', year, quarter, ytdGross, signer }, res);
  } else {
    const startMonth = {1:'01',2:'04',3:'07',4:'10'}[quarter];
    const endMonth = {'01':'04','04':'07','07':'10','10':'01'}[startMonth];
    const endYear = startMonth==='10' ? year+1 : year;
    const start = `${year}-${startMonth}-01`, end = `${endYear}-${endMonth}-01`;
    const gross = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE type='sale' AND date>=? AND date<? AND org_id=?").get(start,end,req.user.org_id||1).t || 0;
    const deductible = 0.40 * gross;
    const net = Math.max(0, gross - deductible);
    const tax = 0;
    return render1701Q_full({ settings: s, mode:'graduated', year, quarter, gross, deductible, net, tax, signer }, res);
  }
});
app.get("/api/print/1701a-full", authRequired, (req,res)=>{
  const year = Number(req.query.year);
  const signer = { name: req.query.signer || "", date: req.query.signed || "" };
  const s = db.prepare("SELECT * FROM settings WHERE id=1").get();
  const gross = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE type='sale' AND substr(date,1,4)=? AND org_id=?").get(String(year), req.user.org_id||1).t || 0;
  const deductible = 0.40 * gross;
  const net = Math.max(0, gross - deductible);
  const tax = 0;
  return render1701A_full({ settings: s, mode:'graduated', year, gross, deductible, net, tax, signer }, res);
});

// File upload for 2307
const upload = multer({ dest: path.join(dataDir, "uploads") });
app.post("/api/import/2307/upload", authRequired, upload.single("file"), (req,res)=>{
  if (!req.file) return res.status(400).json({ message: "No file" });
  const text = fs.readFileSync(req.file.path, "utf8");
  res.json(import2307Csv(req.user.org_id||1, text));
});

// Automation
initAutomation(app);

// Root
app.get("/", (req,res)=> res.redirect("/login.html"));

app.listen(PORT, ()=> console.log("PH SmallBiz running on http://localhost:"+PORT));
