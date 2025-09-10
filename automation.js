
import fs from "fs";
import path from "path";
import { CronJob } from "cron";
import nodemailer from "nodemailer";

import db from "./db.js";
import { computePercentageTax } from "./tax.js";
import { render2551Q_full, render1701Q_full, render1701A_full } from "./pdf_forms_bir_positions_full.js";

const DATA_DIR = path.resolve("./data/reports");
fs.mkdirSync(DATA_DIR, { recursive: true });

function quarterOf(date){ return Math.floor(date.getMonth()/3)+1; }
function qRange(year,q){
  const startMonth = {1:'01',2:'04',3:'07',4:'10'}[q];
  const endMonth = {'01':'04','04':'07','07':'10','10':'01'}[startMonth];
  const endYear = startMonth==='10' ? year+1 : year;
  return { start: `${year}-${startMonth}-01`, end: `${endYear}-${endMonth}-01` };
}
async function maybeMailer(){
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_TO } = process.env;
  if (!SMTP_HOST || !MAIL_TO) return null;
  const transport = nodemailer.createTransport({
    host: SMTP_HOST, port: Number(SMTP_PORT||587), secure:false,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
  return { transport, from: MAIL_FROM || SMTP_USER, to: MAIL_TO };
}
function fauxRes(){
  const chunks = [];
  return {
    headers:{}, setHeader(){},
    write(c){ chunks.push(Buffer.from(c)); },
    end(c){ if(c) chunks.push(Buffer.from(c)); this.onend && this.onend(); },
    pipe(){}, on(event,cb){ if(event==='end') this.onend=cb; },
    buffer(){ return Buffer.concat(chunks); }
  };
}

async function writePdfBuffer(buffer, outPath){
  await fs.promises.mkdir(path.dirname(outPath), { recursive:true });
  await fs.promises.writeFile(outPath, buffer);
  return outPath;
}

async function generate2551Q({year, quarter}){
  const settings = db.prepare("SELECT * FROM settings WHERE id=1").get();
  const rpt = computePercentageTax({ year, quarter });
  const res = fauxRes(); render2551Q_full({ settings, rpt, signer: { name: settings.business_name||'', date: new Date().toISOString().slice(0,10) } }, res);
  return writePdfBuffer(res.buffer(), path.join(DATA_DIR, `${year}-Q${quarter}`, `2551Q-${year}-Q${quarter}.pdf`));
}
async function generate1701Q({year, quarter}){
  const s = db.prepare("SELECT * FROM settings WHERE id=1").get();
  const { start, end } = qRange(year, quarter);
  const gross = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE type='sale' AND date>=? AND date<?").get(start,end).t || 0;
  const deductible = 0.40 * gross; const net = Math.max(0, gross - deductible);
  const res = fauxRes(); render1701Q_full({ settings: s, mode:'graduated', year, quarter, gross, deductible, net, tax:0, signer:{ name: s.business_name||'', date: new Date().toISOString().slice(0,10) } }, res);
  return writePdfBuffer(res.buffer(), path.join(DATA_DIR, `${year}-Q${quarter}`, `1701Q-${year}-Q${quarter}.pdf`));
}
async function generate1701A({year}){
  const s = db.prepare("SELECT * FROM settings WHERE id=1").get();
  const gross = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE type='sale' AND substr(date,1,4)=?").get(String(year)).t || 0;
  const res = fauxRes(); render1701A_full({ settings: s, mode:'graduated', year, gross, deductible: 0.40*gross, net: 0.60*gross, tax:0, signer:{ name: s.business_name||'', date: new Date().toISOString().slice(0,10) } }, res);
  return writePdfBuffer(res.buffer(), path.join(DATA_DIR, `${year}-ANNUAL`, `1701A-${year}.pdf`));
}

let enabled = false;
const job = new CronJob("0 0 9 * * 1", async ()=>{
  if (!enabled) return;
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth()+1;
  const map = {1:{year:y-1, q:4}, 4:{year:y, q:1}, 7:{year:y, q:2}, 10:{year:y, q:3}};
  if (map[m]){
    const tgt = map[m];
    await generate2551Q({year:tgt.year, quarter:tgt.q});
    await generate1701Q({year:tgt.year, quarter:tgt.q});
    const mail = await maybeMailer();
    if (mail){
      await mail.transport.sendMail({ from: mail.from, to: mail.to, subject:`[PH SmallBiz] Auto PDFs for ${tgt.year} Q${tgt.q}`, text:"Generated under data/reports." });
    }
  }
}, null, false, "Asia/Manila");

export function initAutomation(app){
  app.post("/api/automation/toggle", (req,res)=>{
    enabled = !enabled;
    if (enabled && !job.running) job.start();
    if (!enabled && job.running) job.stop();
    res.json({ enabled });
  });
  app.get("/api/automation/status", (req,res)=> res.json({ enabled, schedule:"Mon 09:00 Asia/Manila" }));
  app.post("/api/automation/run", async (req,res)=>{
    const y = Number(req.query.year) || new Date().getFullYear();
    const q = Number(req.query.quarter) || Math.floor(new Date().getMonth()/3)+1;
    const f1 = await generate2551Q({year:y, quarter:q});
    const f2 = await generate1701Q({year:y, quarter:q});
    res.json({ ok:true, files:[f1,f2] });
  });
  app.post("/api/automation/run-annual", async (req,res)=>{
    const y = Number(req.query.year) || (new Date().getFullYear()-1);
    const f = await generate1701A({year:y});
    res.json({ ok:true, file:f });
  });
}
