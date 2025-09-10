
import db from "./db.js";
export function import2307Csv(org_id, csvText){
  const rows = (csvText||'').split(/\r?\n/).filter(Boolean);
  if (!rows.length) throw new Error("Empty CSV");
  const header = rows.shift().split(",").map(s=>s.trim().toLowerCase());
  const idx = Object.fromEntries(header.map((c,i)=>[c,i]));
  const insert = db.prepare("INSERT INTO credits (org_id,date,type,particulars,amount) VALUES (?,?,?,?,?)");
  const trx = db.transaction(()=>{
    for (const line of rows){
      const parts = line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(s=>s.replace(/^\"|\"$/g,''));
      const date = parts[idx.date] || parts[idx['transaction date']] || parts[idx['posting date']] || new Date().toISOString().slice(0,10);
      const particulars = parts[idx.particulars] || parts[idx.description] || parts[idx['details']] || '';
      const type = (parts[idx.type] || 'withholding').toLowerCase();
      const amount = Number(String(parts[idx.amount]).replace(/[^0-9.\-]/g,'')) || 0;
      insert.run(org_id, date, type, particulars, amount);
    }
  });
  trx();
  return { imported: rows.length };
}
