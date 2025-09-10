
async function api(path){
  try { const r = await fetch(path); if(!r.ok) throw new Error(await r.text()); return r.json(); }
  catch(e){ return null; }
}
async function fetchMe(){ return await api('/api/me'); }
async function fetchOrgs(){ const o = await api('/api/orgs'); return Array.isArray(o) ? o : []; }
async function switchOrg(id){
  await fetch('/api/orgs/switch',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ org_id: Number(id) }) });
  location.reload();
}
export async function mountNavbar(){
  const nav = document.querySelector('nav');
  if (!nav) return;
  const bar = document.createElement('div');
  bar.style.display = 'flex'; bar.style.gap = '.6rem'; bar.style.flexWrap = 'wrap'; bar.style.alignItems = 'center';
  const left = document.createElement('div'); left.textContent = 'PH Small Biz';
  const right = document.createElement('div'); right.style.marginLeft = 'auto'; right.style.display='flex'; right.style.gap='.6rem'; right.style.alignItems='center';
  const orgSel = document.createElement('select'); orgSel.id = 'orgSel'; orgSel.style.padding='.4rem'; orgSel.style.borderRadius='8px';
  const userSpan = document.createElement('span'); userSpan.id = 'userSpan';
  right.appendChild(orgSel); right.appendChild(userSpan);
  bar.appendChild(left); bar.appendChild(right); nav.appendChild(bar);

  const [me, orgs] = await Promise.all([fetchMe(), fetchOrgs()]);
  if (orgs.length){
    orgSel.innerHTML = orgs.map(o=>`<option value="${o.id}">${o.name}</option>`).join('');
    if (me && me.org_id) orgSel.value = String(me.org_id);
    orgSel.addEventListener('change', ()=> switchOrg(orgSel.value));
  } else {
    orgSel.innerHTML = '<option>No orgs</option>';
  }
  userSpan.textContent = me ? (me.name || me.email || 'User') : 'Not signed in';
}
document.addEventListener('DOMContentLoaded', ()=> mountNavbar());
