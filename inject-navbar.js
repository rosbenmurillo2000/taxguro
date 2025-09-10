
// Adds <script type="module" src="/nav.js"></script> to any HTML file containing <nav>.
import fs from 'fs'; import path from 'path';
const pubDir = process.argv[2] || './public';
const tag = '<script type="module" src="/nav.js"></script>';
function processFile(filePath){
  let html = fs.readFileSync(filePath, 'utf8');
  if (!html.includes('<nav') || html.includes(tag)) return false;
  html = html.replace('</body>', `${tag}\n</body>`);
  fs.writeFileSync(filePath, html, 'utf8'); return true;
}
function walk(dir){
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries){
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile() && e.name.endsWith('.html')){
      const changed = processFile(full);
      if (changed) console.log('Injected nav.js into', full);
    }
  }
}
walk(pubDir);
