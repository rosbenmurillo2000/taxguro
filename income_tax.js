
import db from "./db.js";

export function computeIncomeTax({ year, quarter, mode='graduated', org_id=1 }){
  // Simplified demo logic; replace with your exact schedule as needed.
  const startMonth = {1:'01',2:'04',3:'07',4:'10'}[quarter];
  const endMonth = {'01':'04','04':'07','07':'10','10':'01'}[startMonth];
  const endYear = startMonth==='10' ? year+1 : year;
  const start = `${year}-${startMonth}-01`, end = `${endYear}-${endMonth}-01`;
  const gross = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE org_id=? AND type='sale' AND date>=? AND date<?").get(org_id, start, end).t || 0;

  if (mode==='8pct'){
    const base = Math.max(0, gross - 250000);
    const tax = +(base * 0.08).toFixed(2);
    return { year, quarter, mode, gross, base_over_250k: base, tax };
  } else {
    const deductible = +(0.40 * gross).toFixed(2);
    const net = Math.max(0, +(gross - deductible).toFixed(2));
    // For demo we set tax=0; integrate brackets for real calc
    const tax = 0;
    return { year, quarter, mode, gross, deductible, net, tax };
  }
}

export function computeIncomeTaxAnnual({ year, mode='graduated', org_id=1 }){
  const gross = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE org_id=? AND type='sale' AND substr(date,1,4)=?").get(org_id, String(year)).t || 0;
  if (mode==='8pct'){
    const base = Math.max(0, gross - 250000);
    const tax = +(base * 0.08).toFixed(2);
    return { year, mode, gross, base_over_250k: base, tax };
  } else {
    const deductible = +(0.40 * gross).toFixed(2);
    const net = Math.max(0, +(gross - deductible).toFixed(2));
    const tax = 0;
    return { year, mode, gross, deductible, net, tax };
  }
}
