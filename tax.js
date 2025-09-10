
import db from "./db.js";

function quarterBounds(year, quarter){
  const startMonth = {1:'01',2:'04',3:'07',4:'10'}[quarter];
  const endMonth = {'01':'04','04':'07','07':'10','10':'01'}[startMonth];
  const endYear = startMonth==='10' ? year+1 : year;
  return { start: `${year}-${startMonth}-01`, end: `${endYear}-${endMonth}-01` };
}

export function computePercentageTax({ year, quarter, rate = 0.03, org_id = 1 }){
  const { start, end } = quarterBounds(year, quarter);
  const gross_sales = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE org_id=? AND type='sale' AND date>=? AND date<?").get(org_id, start, end).t || 0;
  const credits = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM credits WHERE org_id=? AND date>=? AND date<?").get(org_id, start, end).t || 0;

  const tax_due = +(gross_sales * rate).toFixed(2);
  const tax_payable = Math.max(0, +(tax_due - credits).toFixed(2));

  return {
    year, quarter,
    period_start: start, period_end: end,
    gross_sales, rate, credits, tax_due, tax_payable
  };
}
