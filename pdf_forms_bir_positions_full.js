
import PDFDocument from "pdfkit";
import fs from "fs";

const POS = JSON.parse(fs.readFileSync("./bir_positions_full.json","utf8"));

function put(doc, keyMap, key, value, size=10){
  const pos = keyMap[key];
  if (!pos) return;
  const [x,y] = pos;
  doc.fontSize(size).fillColor('#111').text(String(value ?? ''), x, y, { lineBreak:false });
}
const peso = n => Number(n||0).toFixed(2);

export function render2551Q_full({ settings, rpt, signer }, res){
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  res.setHeader?.("Content-Type", "application/pdf");
  res.setHeader?.("Content-Disposition", "inline; filename=2551Q_exact_full.pdf");
  doc.pipe(res);
  const P = POS["2551Q"];
  put(doc, P, "business_name", settings.business_name||"-");
  put(doc, P, "tin", settings.tin||"-");
  put(doc, P, "quarter", "Q"+rpt.quarter);
  put(doc, P, "year", rpt.year);
  put(doc, P, "period", `${rpt.period_start} to ${rpt.period_end}`);
  put(doc, P, "part1_line13_gross_sales", peso(rpt.gross_sales));
  put(doc, P, "part1_line18_tax_due", peso(rpt.tax_due));
  if (signer){
    put(doc, P, "signature_name", signer.name || "");
    put(doc, P, "signature_date", signer.date || "");
  }
  doc.end();
}

export function render1701Q_full(opts, res){
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  res.setHeader?.("Content-Type", "application/pdf");
  res.setHeader?.("Content-Disposition", "inline; filename=1701Q_exact_full.pdf");
  doc.pipe(res);
  const P = POS[opts.mode === "8pct" ? "1701Q_8pct" : "1701Q_grad"];
  put(doc, P, "business_name", opts.settings.business_name||"-");
  put(doc, P, "tin", opts.settings.tin||"-");
  put(doc, P, "quarter", "Q"+opts.quarter);
  put(doc, P, "year", opts.year);
  if (opts.mode === "8pct") {
    const base = Math.max(0, (opts.ytdGross||0) - 250000);
    put(doc, P, "ytd_gross", peso(opts.ytdGross));
    put(doc, P, "tax_base_over_250k", peso(base));
    put(doc, P, "eight_pct_tax", peso(base * 0.08));
  } else {
    put(doc, P, "sched1_gross", peso(opts.gross));
    put(doc, P, "sched1_deductions", peso(opts.deductible));
    put(doc, P, "sched1_net_income", peso(opts.net));
    put(doc, P, "sched1_tax_due", peso(opts.tax));
  }
  if (opts.signer){
    put(doc, P, "signature_name", opts.signer.name || "");
    put(doc, P, "signature_date", opts.signer.date || "");
  }
  doc.end();
}

export function render1701A_full(opts, res){
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  res.setHeader?.("Content-Type", "application/pdf");
  res.setHeader?.("Content-Disposition", "inline; filename=1701A_exact_full.pdf");
  doc.pipe(res);
  const P = POS[opts.mode === "8pct" ? "1701A_8pct" : "1701A_grad"];
  put(doc, P, "business_name", opts.settings.business_name||"-");
  put(doc, P, "tin", opts.settings.tin||"-");
  put(doc, P, "year", opts.year);
  if (opts.mode === "8pct") {
    const base = Math.max(0, (opts.gross||0) - 250000);
    put(doc, P, "gross", peso(opts.gross));
    put(doc, P, "base_over_250k", peso(base));
    put(doc, P, "eight_pct_tax", peso(base * 0.08));
  } else {
    put(doc, P, "sched1_gross", peso(opts.gross));
    put(doc, P, "sched1_deductions", peso(opts.deductible));
    put(doc, P, "sched1_net_income", peso(opts.net));
    put(doc, P, "sched1_tax_due", peso(opts.tax));
  }
  if (opts.signer){
    put(doc, P, "signature_name", opts.signer.name || "");
    put(doc, P, "signature_date", opts.signer.date || "");
  }
  doc.end();
}
