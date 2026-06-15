/* ===== Centro de Gestión · app conectada a Supabase ===== */
const sb = supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.publishableKey);

const CH = {airbnb:{c:"var(--ab)",t:"AB"},booking:{c:"var(--bk)",t:"BK"},instagram:{c:"var(--ig)",t:"IG"},whatsapp:{c:"var(--wa)",t:"WA"},directo:{c:"var(--web)",t:"W"},otro:{c:"var(--soft)",t:"·"}};
const ST = {nuevo:"Nuevo",contactado:"Contactado",cotizado:"Cotizado",reservado:"Reservado",perdido:"Perdido"};
const RST = {cotizacion:"Cotización",confirmada:"Confirmada",en_curso:"En curso",finalizada:"Finalizada",cancelada:"Cancelada"};
const SEG = {familia_paisa:"Familia paisa",grupo_evento:"Grupo/Evento",nomada_digital:"Nómada digital",internacional:"Internacional",corporativo:"Corporativo",otro:"Otro"};

let me=null, villa="all", cur="inicio";
let D = {villas:[],leads:[],reservas:[],tx:[],contactos:[],tareas:[],categorias:[]};
let leadFilter="todos", crmSeg="Todos";

const cop = n => "$"+Math.round(+n||0).toLocaleString("es-CO");
const copK = n => {n=+n||0; return Math.abs(n)>=1e6 ? "$"+(n/1e6).toFixed(1).replace(".0","")+"M" : "$"+Math.round(n/1000)+"k";};
const initials = s => (s||"·").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();
const fv = arr => villa==="all" ? arr : arr.filter(x=>x.propiedad===villa || x.propiedad_id===villa);
const vname = id => (D.villas.find(v=>v.id===id)||{}).nombre || "—";
const vcolor = id => (D.villas.find(v=>v.id===id)||{}).color || "var(--green)";
const $ = s => document.querySelector(s);
const esc = s => (s==null?"":String(s)).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");setTimeout(()=>t.classList.remove("on"),2200);}
function thisMonth(){const d=new Date();return {y:d.getFullYear(),m:d.getMonth()};}
const MONTHS=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

/* ---------- AUTH ---------- */
async function boot(){
  const {data:{session}} = await sb.auth.getSession();
  if(session) await afterLogin(session); else showLogin();
}
sb.auth.onAuthStateChange((e,session)=>{
  if(e==="SIGNED_IN" && session && !me) afterLogin(session);
  if(e==="SIGNED_OUT"){ me=null; showLogin(); }
});
function showLogin(){ $("#appView").classList.add("hidden"); $("#authView").classList.remove("hidden"); }
async function afterLogin(session){
  const {data:prof} = await sb.from("usuarios").select("*").eq("id",session.user.id).maybeSingle();
  if(!prof || !prof.activo){
    $("#loginMsg").textContent = "Este correo no está autorizado. Contacta al administrador.";
    await sb.auth.signOut(); return;
  }
  me=prof;
  $("#ava").textContent = initials(prof.nombre);
  $("#authView").classList.add("hidden"); $("#appView").classList.remove("hidden");
  await loadAll(); render();
}
$("#loginForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const email=$("#loginEmail").value.trim();
  if(!email) return;
  $("#loginBtn").disabled=true; $("#loginMsg").textContent="Enviando…";
  const {error}=await sb.auth.signInWithOtp({email, options:{emailRedirectTo:location.href}});
  $("#loginBtn").disabled=false;
  $("#loginMsg").textContent = error ? ("Error: "+error.message) : "✓ Revisa tu correo y abre el enlace para entrar.";
});

/* ---------- DATA ---------- */
async function loadAll(){
  const [villas,leads,reservas,tx,contactos,tareas,categorias] = await Promise.all([
    sb.from("propiedades").select("*").order("nombre"),
    sb.from("leads").select("*, contacto:contactos(nombre)").order("creado",{ascending:false}),
    sb.from("reservas").select("*, contacto:contactos(nombre)").order("fecha_in",{ascending:false}),
    sb.from("transacciones").select("*, categoria:categorias(nombre,tipo)").order("fecha",{ascending:false}),
    sb.from("contactos").select("*").order("nombre"),
    sb.from("tareas").select("*").order("vence"),
    sb.from("categorias").select("*").order("orden")
  ]);
  D.villas=villas.data||[]; D.leads=leads.data||[]; D.reservas=reservas.data||[];
  D.tx=tx.data||[]; D.contactos=contactos.data||[]; D.tareas=tareas.data||[]; D.categorias=categorias.data||[];
  // villa filter chips
  const vf=$("#vfilter");
  vf.innerHTML = '<button class="vchip on" data-villa="all">Las 2 villas</button>' +
    D.villas.map(v=>`<button class="vchip" data-villa="${v.id}">${esc(v.nombre.replace(/^Villa (Las )?/,""))}</button>`).join("");
}
async function reload(){ await loadAll(); render(); }

/* ---------- helpers de render ---------- */
function chan(c){const x=CH[c]||CH.otro; return `<span class="chan" style="background:${x.c}">${x.t}</span>`;}
function monthTx(){ const {y,m}=thisMonth(); return fv(D.tx).filter(t=>{const d=new Date(t.fecha+"T00:00:00");return d.getFullYear()===y&&d.getMonth()===m;}); }
function pnl(list){ const inc=list.filter(t=>t.tipo==="ingreso").reduce((a,b)=>a+ +b.monto,0); const exp=list.filter(t=>t.tipo==="gasto").reduce((a,b)=>a+ +b.monto,0); return {inc,exp,res:inc-exp};}
function emptyState(t,s){return `<div class="empty"><b>${t}</b>${s||""}</div>`;}

/* ---------- VIEWS ---------- */
function vDash(){
  const {inc,exp,res}=pnl(monthTx());
  const margin=inc?Math.round(res/inc*100):0;
  const nuevos=fv(D.leads).filter(l=>l.estado==="nuevo"||l.estado==="contactado").length;
  const activas=fv(D.reservas).filter(r=>r.estado==="confirmada"||r.estado==="en_curso").length;
  const next=fv(D.reservas).filter(r=>r.estado==="confirmada"||r.estado==="cotizacion").sort((a,b)=>a.fecha_in.localeCompare(b.fecha_in)).slice(0,4);
  const {m}=thisMonth();
  return `
  <div class="kpis">
    <div class="kpi"><div class="lab">Ingresos del mes</div><div class="val">${copK(inc)}</div><div class="delta muted">${MONTHS[m]}</div></div>
    <div class="kpi"><div class="lab">Resultado (P&L)</div><div class="val ${res>=0?'':'down'}">${copK(res)}</div><div class="delta ${res>=0?'up':'down'}">margen ${margin}%</div></div>
    <div class="kpi"><div class="lab">Solicitudes activas</div><div class="val">${nuevos}</div><div class="delta muted">por atender</div></div>
    <div class="kpi"><div class="lab">Reservas en curso</div><div class="val">${activas}</div><div class="delta muted">confirmadas</div></div>
  </div>
  <div class="sec-t">P&L del mes</div>
  <div class="card">
    <div class="spread"><b>Ingresos ${cop(inc)}</b><b class="${res>=0?'pos':'neg'}">${cop(res)}</b></div>
    <div class="pnl-bar"><i style="width:${inc?Math.min(100,exp/inc*100):0}%;background:var(--bad)"></i><i style="width:${inc&&res>0?res/inc*100:0}%;background:var(--ok)"></i></div>
    <div class="legend"><span><i class="dot" style="background:var(--bad)"></i>Gastos ${cop(exp)}</span><span><i class="dot" style="background:var(--ok)"></i>Resultado ${cop(res)}</span></div>
  </div>
  <div class="sec-t">Próximas llegadas</div>
  <div class="card">${ next.length ? next.map(r=>`
    <div class="li"><div class="ava2" style="background:${vcolor(r.propiedad)}">${initials(r.contacto?.nombre||r.codigo)}</div>
    <div class="main"><b>${esc(r.contacto?.nombre||r.codigo||"Reserva")}</b><small>${esc(vname(r.propiedad))} · ${r.huespedes||"–"} pax</small></div>
    <div class="end"><b>${fmtD(r.fecha_in)}</b><small><span class="badge b-${r.estado}">${RST[r.estado]}</span></small></div></div>`).join("")
    : emptyState("Aún no hay reservas","Crea la primera desde la pestaña Reservas.") }
  </div>`;
}
function fmtD(s){ if(!s) return "—"; const d=new Date(s+"T00:00:00"); return d.getDate()+" "+MONTHS[d.getMonth()].slice(0,3); }

function vBandeja(){
  const counts={todos:fv(D.leads).length};
  Object.keys(ST).forEach(k=>counts[k]=fv(D.leads).filter(l=>l.estado===k).length);
  const list=fv(D.leads).filter(l=>leadFilter==="todos"||l.estado===leadFilter);
  const chips=["todos",...Object.keys(ST)].map(k=>`<button class="chip ${leadFilter===k?"on":""}" data-lf="${k}">${k==="todos"?"Todos":ST[k]}${counts[k]?` (${counts[k]})`:""}</button>`).join("");
  return `<div class="chips">${chips}</div>
  <div class="card">${ list.length ? list.map(l=>`
    <button class="li" style="width:100%;text-align:left" data-lead="${l.id}"><div class="ava2" style="background:${vcolor(l.propiedad)}">${initials(l.contacto?.nombre||"·")}</div>
    <div class="main"><b>${esc(l.contacto?.nombre||"Sin nombre")}</b><small>${esc(vname(l.propiedad))} · ${l.huespedes||"–"} pax</small>
      <div style="margin-top:5px;display:flex;gap:6px;align-items:center"><span class="badge b-${l.estado}">${ST[l.estado]}</span>${chan(l.canal)}</div></div>
    <div class="end"><b>${l.valor_estimado?copK(l.valor_estimado):"—"}</b><small>${SEG[l.contacto?.segmento]||""}</small></div></button>`).join("")
    : emptyState("Sin solicitudes","Registra la primera con el botón +.") }
  </div>`;
}

function vCalendario(){
  const {y,m}=thisMonth();
  const dow=["L","M","X","J","V","S","D"];
  const first=new Date(y,m,1).getDay(); const off=(first+6)%7;
  const days=new Date(y,m+1,0).getDate();
  const vlist=villa==="all"?D.villas.map(v=>v.id):[villa];
  let cells="";
  for(let i=0;i<off;i++)cells+='<div class="cell out"></div>';
  for(let d=1;d<=days;d++){
    const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    let bars="";
    vlist.forEach((vid,idx)=>{
      const r=D.reservas.find(x=>x.propiedad===vid && x.estado!=="cancelada" && x.fecha_in<=ds && x.fecha_out>ds);
      if(r)bars+=`<div class="bk" style="background:${CH[r.canal]?.c||'var(--green)'};bottom:${3+idx*7}px"></div>`;
    });
    cells+=`<div class="cell"><span class="d">${d}</span>${bars}</div>`;
  }
  const ag=fv(D.reservas).filter(r=>r.estado!=="finalizada"&&r.estado!=="cancelada").sort((a,b)=>a.fecha_in.localeCompare(b.fecha_in)).slice(0,5);
  return `<div class="cal-head"><span class="m">${MONTHS[m]} ${y}</span></div>
  <div class="cal-grid">${dow.map(d=>`<div class="dow">${d}</div>`).join("")}${cells}</div>
  <div class="legend" style="margin-top:14px"><span><i class="dot" style="background:var(--ab)"></i>Airbnb</span><span><i class="dot" style="background:var(--bk)"></i>Booking</span><span><i class="dot" style="background:var(--wa)"></i>WhatsApp</span><span><i class="dot" style="background:var(--web)"></i>Directo</span></div>
  <div class="sec-t">Agenda</div>
  <div class="card">${ ag.length ? ag.map(r=>`
    <div class="li"><div class="ava2" style="background:${vcolor(r.propiedad)}">${chan(r.canal).replace(/<[^>]+>/g,"")||"·"}</div>
    <div class="main"><b>${esc(r.contacto?.nombre||r.codigo||"Reserva")}</b><small>${esc(vname(r.propiedad))}</small></div>
    <div class="end"><b>${fmtD(r.fecha_in)}→${fmtD(r.fecha_out)}</b><small><span class="badge b-${r.estado}">${RST[r.estado]}</span></small></div></div>`).join("")
    : emptyState("Sin reservas este periodo","") }
  </div>
  <div class="card" style="background:#FFF7E8;border-color:#F0DFB6"><small class="muted" style="color:#8A6516">◆ La sincronización automática con Airbnb y Booking (iCal) se activa al pegar los enlaces en Ajustes.</small></div>`;
}

function vFinanzas(){
  const list=monthTx(); const {inc,exp,res}=pnl(list); const {m}=thisMonth();
  const byCat=tip=>{const map={};list.filter(t=>t.tipo===tip).forEach(t=>{const n=t.categoria?.nombre||"Sin categoría";map[n]=(map[n]||0)+ +t.monto;});return Object.entries(map).sort((a,b)=>b[1]-a[1]);};
  const incRows=byCat("ingreso").map(([c,a])=>`<tr><td class="cat">${esc(c)}</td><td class="pos">${cop(a)}</td></tr>`).join("")||`<tr><td class="cat" colspan="2">Sin ingresos aún</td></tr>`;
  const outRows=byCat("gasto").map(([c,a])=>`<tr><td class="cat">${esc(c)}</td><td class="neg">−${cop(a)}</td></tr>`).join("")||`<tr><td class="cat" colspan="2">Sin gastos aún</td></tr>`;
  return `<div class="cal-head"><span class="m">${MONTHS[m]} ${thisMonth().y}</span></div>
  <div class="kpis"><div class="kpi"><div class="lab">Ingresos</div><div class="val pos" style="font-size:1.25rem">${copK(inc)}</div></div>
  <div class="kpi"><div class="lab">Gastos</div><div class="val neg" style="font-size:1.25rem">${copK(exp)}</div></div></div>
  <div class="sec-t">Estado de resultados (P&L)</div>
  <div class="card"><table class="ftab">
    <tr><td><b>Ingresos</b></td><td></td></tr>${incRows}
    <tr><td><b>Gastos</b></td><td></td></tr>${outRows}
    <tr class="tot"><td>Resultado</td><td class="${res>=0?'pos':'neg'}">${cop(res)}</td></tr>
    <tr><td class="cat">Margen neto</td><td>${inc?Math.round(res/inc*100):0}%</td></tr>
  </table></div>
  <div class="split2"><button class="btn" data-add="ingreso">+ Ingreso</button><button class="btn ghost" data-add="gasto">+ Gasto</button></div>`;
}

function vCRM(){
  const segs=["Todos",...Object.values(SEG)];
  const list=(crmSeg==="Todos"?D.contactos:D.contactos.filter(c=>SEG[c.segmento]===crmSeg));
  // valor de vida = suma de reservas del contacto
  const val=cid=>D.reservas.filter(r=>r.contacto_id? r.contacto_id===cid : r.contacto&&r.contacto.id===cid).reduce((a,b)=>a+ +b.total,0);
  return `<div class="chips">${segs.map(s=>`<button class="chip ${crmSeg===s?"on":""}" data-seg="${esc(s)}">${esc(s)}</button>`).join("")}</div>
  <div class="card">${ list.length ? list.map(c=>`
    <div class="li"><div class="ava2" style="background:var(--green)">${initials(c.nombre)}</div>
    <div class="main"><b>${esc(c.nombre)}</b><small>${esc(c.pais||"")}${c.pais?" · ":""}${SEG[c.segmento]||""}</small></div>
    <div class="end">${c.telefono?`<a class="badge b-reservado" href="https://wa.me/${c.telefono.replace(/[^0-9]/g,"")}" target="_blank">WhatsApp</a>`:""}</div></div>`).join("")
    : emptyState("Sin clientes aún","Agrega contactos con el botón +.") }
  </div>`;
}

function vReservas(){
  const list=fv(D.reservas);
  return `<div class="card">${ list.length ? list.map(r=>`
    <div class="li"><div class="ava2" style="background:${vcolor(r.propiedad)}">${esc((r.codigo||"R").slice(0,2))}</div>
    <div class="main"><b>${esc(r.contacto?.nombre||r.codigo||"Reserva")}</b><small>${esc(vname(r.propiedad))} · ${fmtD(r.fecha_in)}→${fmtD(r.fecha_out)}</small>
      <div style="margin-top:5px"><span class="badge b-${r.estado}">${RST[r.estado]}</span></div></div>
    <div class="end"><b>${copK(r.total)}</b><small>${r.huespedes||"–"} pax</small></div></div>`).join("")
    : emptyState("Sin reservas","Crea la primera con el botón +.") }
  </div>`;
}

function donut(parts){
  const tot=parts.reduce((a,b)=>a+b.v,0)||1;let off=0;const R=42,C=2*Math.PI*R;
  const segs=parts.map(p=>{const len=p.v/tot*C;const s=`<circle r="${R}" cx="60" cy="60" fill="none" stroke="${p.c}" stroke-width="16" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`;off+=len;return s;}).join("");
  return `<svg width="120" height="120" viewBox="0 0 120 120">${segs}</svg>`;
}
function vStats(){
  const res=fv(D.reservas).filter(r=>r.estado!=="cancelada");
  const nights=res.reduce((a,b)=>a+(new Date(b.fecha_out)-new Date(b.fecha_in))/864e5,0);
  const rev=res.reduce((a,b)=>a+ +b.total,0);
  const adr=nights?rev/nights:0;
  const avgStay=res.length?nights/res.length:0;
  const leads=fv(D.leads); const conv=leads.length?Math.round(leads.filter(l=>l.estado==="reservado").length/leads.length*100):0;
  const chMap={}; res.forEach(r=>chMap[r.canal]=(chMap[r.canal]||0)+1);
  const chMix=Object.entries(chMap).map(([k,v])=>({n:CH[k]?.t,v,c:CH[k]?.c||"var(--soft)",label:k}));
  const segMap={}; D.contactos.forEach(c=>segMap[c.segmento]=(segMap[c.segmento]||0)+1);
  const segTot=Object.values(segMap).reduce((a,b)=>a+b,0)||1;
  return `<div class="sec-t">Indicadores clave</div>
  <div class="kpis">
   <div class="kpi"><div class="lab">ADR</div><div class="val" style="font-size:1.3rem">${adr?copK(adr):"—"}</div><div class="delta muted">precio/noche</div></div>
   <div class="kpi"><div class="lab">Reservas</div><div class="val" style="font-size:1.3rem">${res.length}</div><div class="delta muted">total</div></div>
   <div class="kpi"><div class="lab">Estadía media</div><div class="val" style="font-size:1.3rem">${avgStay?avgStay.toFixed(1):"—"}</div><div class="delta muted">noches</div></div>
   <div class="kpi"><div class="lab">Conversión</div><div class="val" style="font-size:1.3rem">${conv}%</div><div class="delta muted">leads→reserva</div></div>
  </div>
  <div class="sec-t">Mix por canal</div>
  <div class="card">${ chMix.length ? `<div class="donut-wrap">${donut(chMix)}<div class="legend" style="flex-direction:column;gap:8px;margin:0">${chMix.map(p=>`<span><i class="dot" style="background:${p.c}"></i>${p.label} · ${p.v}</span>`).join("")}</div></div>` : emptyState("Sin datos todavía","") }</div>
  <div class="sec-t">Segmentos de cliente</div>
  <div class="card">${ Object.keys(segMap).length ? `<div class="bars">${Object.entries(segMap).map(([k,v])=>`<div class="barrow"><span>${SEG[k]||k}</span><div class="track"><i style="width:${Math.round(v/segTot*100)}%"></i></div><span class="v">${Math.round(v/segTot*100)}%</span></div>`).join("")}</div>` : emptyState("Sin clientes aún","") }</div>`;
}

function vOps(){
  const list=fv(D.tareas);
  return `<div class="card">${ list.length ? list.map(t=>`
    <div class="li"><button class="ava2" data-task="${t.id}" data-done="${t.estado==='hecha'?1:0}" style="background:${t.estado==='hecha'?'#CFD8D2':vcolor(t.propiedad)};${t.estado==='hecha'?'color:#7A857F':''}">${t.estado==='hecha'?'✓':(t.tipo||'T')[0].toUpperCase()}</button>
    <div class="main"><b style="${t.estado==='hecha'?'text-decoration:line-through;color:var(--soft)':''}">${esc(t.titulo)}</b><small>${esc(vname(t.propiedad))}${t.responsable?" · "+esc(t.responsable):""}${t.vence?" · vence "+fmtD(t.vence):""}</small></div>
    <div class="end"><span class="badge ${t.estado==='hecha'?'b-finalizada':'b-nuevo'}">${t.estado==='hecha'?'Hecho':'Pendiente'}</span></div></div>`).join("")
    : emptyState("Sin tareas","Agrega una con el botón +.") }
  </div>`;
}

function vMas(){
  const items=[["crm","Clientes (CRM)","M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"],
    ["reservas","Reservas","M3 7l9 6 9-6M3 7v10h18V7"],
    ["estadisticas","Estadísticas","M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-7"],
    ["operaciones","Operaciones","M9 11l3 3L22 4M21 12v7H3V5h12"],
    ["ajustes","Ajustes y accesos","M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"]];
  return `<div class="card" style="padding:4px 16px">${items.map(([id,t,p])=>`
    <button class="menu-li" data-go="${id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="${p}"/></svg>${t}<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></button>`).join("")}</div>
  <button class="btn ghost" id="logout" style="margin-top:8px">Cerrar sesión (${esc(me?.nombre||"")})</button>
  <p class="muted" style="text-align:center;margin-top:14px">Centro de Gestión · Villas de Colombia</p>`;
}
function vAjustes(){
  return `<div class="card"><h3 style="font-size:1rem;margin-bottom:10px">Sincronización de calendarios</h3>
  <p class="muted">Pega aquí los enlaces iCal de Airbnb y Booking de cada villa para evitar sobre-reservas. (Próximamente editable)</p></div>
  <div class="card"><h3 style="font-size:1rem;margin-bottom:10px">Tu equipo</h3><p class="muted">Nicolas (propietario), Pauline y Soizic (admin). Para añadir o quitar accesos, contáctame.</p></div>
  <div class="card"><h3 style="font-size:1rem;margin-bottom:6px">Grilla tarifaria</h3><p class="muted">Semana / fin de semana / puente / temporada alta por villa. Valores de ejemplo cargados — ajústalos cuando quieras.</p></div>`;
}

const VIEWS={inicio:["Inicio",vDash],bandeja:["Solicitudes",vBandeja],calendario:["Calendario",vCalendario],
 finanzas:["Finanzas",vFinanzas],mas:["Más",vMas],crm:["Clientes (CRM)",vCRM],reservas:["Reservas",vReservas],
 estadisticas:["Estadísticas",vStats],operaciones:["Operaciones",vOps],ajustes:["Ajustes y accesos",vAjustes]};
const TOP=["inicio","bandeja","calendario","finanzas","mas"];

function render(){
  const [title,fn]=VIEWS[cur];
  $("#title").textContent=title;
  $("#main").innerHTML=`<section class="view on">${fn()}</section>`;
  $("#topbar").classList.toggle("sub",!TOP.includes(cur));
  $("#fab").style.display=["inicio","bandeja","finanzas","reservas","operaciones","crm"].includes(cur)?"grid":"none";
  $("#vfilter").style.display=["mas","ajustes","estadisticas"].includes(cur)?"none":"flex";
  document.querySelectorAll(".bnav button").forEach(b=>b.classList.toggle("on",b.dataset.nav===cur||(TOP.indexOf(cur)<0&&b.dataset.nav==="mas")));
  window.scrollTo(0,0);
}
function go(v){cur=v;render();}

/* ---------- NAV ---------- */
$("#bnav").addEventListener("click",e=>{const b=e.target.closest("[data-nav]");if(b)go(b.dataset.nav);});
$("#back").addEventListener("click",()=>go("mas"));
$("#vfilter").addEventListener("click",e=>{const b=e.target.closest("[data-villa]");if(!b)return;villa=b.dataset.villa;document.querySelectorAll(".vchip").forEach(c=>c.classList.toggle("on",c===b));render();});
$("#fab").addEventListener("click",()=>openAdd());
$("#main").addEventListener("click",async e=>{
  const lf=e.target.closest("[data-lf]"); if(lf){leadFilter=lf.dataset.lf;render();return;}
  const sg=e.target.closest("[data-seg]"); if(sg){crmSeg=sg.dataset.seg;render();return;}
  const g=e.target.closest("[data-go]"); if(g){go(g.dataset.go);return;}
  const add=e.target.closest("[data-add]"); if(add){openAdd(add.dataset.add);return;}
  const lead=e.target.closest("[data-lead]"); if(lead){openLead(lead.dataset.lead);return;}
  const task=e.target.closest("[data-task]"); if(task){await toggleTask(task.dataset.task,task.dataset.done==="1");return;}
  if(e.target.id==="logout"){await sb.auth.signOut();}
});

/* ---------- SHEET (formularios) ---------- */
const sheetBg=$("#sheetBg"), sheet=$("#sheet");
function closeSheet(){sheetBg.classList.remove("on");sheet.innerHTML="";}
sheetBg.addEventListener("click",e=>{if(e.target===sheetBg)closeSheet();});
function openSheet(html){sheet.innerHTML=html;sheetBg.classList.add("on");}
const villaOpts=sel=>D.villas.map(v=>`<option value="${v.id}" ${sel===v.id?"selected":""}>${esc(v.nombre)}</option>`).join("");

function openAdd(kind){
  // decide qué crear según vista o parámetro
  if(kind==="ingreso"||kind==="gasto") return formTx(kind);
  if(cur==="bandeja") return formLead();
  if(cur==="crm") return formContacto();
  if(cur==="operaciones") return formTarea();
  if(cur==="reservas") return formReserva();
  if(cur==="finanzas") return formTx("gasto");
  // inicio → menú rápido
  openSheet(`<h3>¿Qué quieres registrar?</h3>
   <div style="display:grid;gap:10px">
    <button class="btn" data-q="lead">Nueva solicitud</button>
    <button class="btn" data-q="reserva">Nueva reserva</button>
    <button class="btn ghost" data-q="ingreso">Ingreso</button>
    <button class="btn ghost" data-q="gasto">Gasto</button>
    <button class="btn ghost" data-q="tarea">Tarea</button>
    <button class="btn ghost" data-q="contacto">Cliente</button>
   </div>`);
  sheet.querySelectorAll("[data-q]").forEach(b=>b.addEventListener("click",()=>{const q=b.dataset.q;
    if(q==="ingreso"||q==="gasto")formTx(q); else if(q==="lead")formLead(); else if(q==="reserva")formReserva();
    else if(q==="tarea")formTarea(); else if(q==="contacto")formContacto();}));
}

function formTx(tipo){
  const cats=D.categorias.filter(c=>c.tipo===tipo);
  openSheet(`<h3>${tipo==="ingreso"?"Nuevo ingreso":"Nuevo gasto"}</h3>
   <div class="field"><label>Villa</label><select id="f_villa">${villaOpts(villa!=="all"?villa:null)}</select></div>
   <div class="field"><label>Categoría</label><select id="f_cat">${cats.map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join("")}</select></div>
   <div class="field"><label>Concepto</label><input id="f_con" placeholder="Descripción"></div>
   <div class="field"><label>Monto (COP)</label><input id="f_monto" type="number" inputmode="numeric" placeholder="0"></div>
   <div class="field"><label>Fecha</label><input id="f_fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
   <button class="btn" id="f_save">Guardar</button>`);
  $("#f_save").addEventListener("click",async()=>{
    const monto=+$("#f_monto").value; if(!monto)return toast("Indica el monto");
    const {error}=await sb.from("transacciones").insert({propiedad:$("#f_villa").value,categoria:$("#f_cat").value,tipo,concepto:$("#f_con").value||null,monto,fecha:$("#f_fecha").value});
    if(error)return toast("Error: "+error.message);
    closeSheet();toast("Registrado ✓");await reload();
  });
}
function formLead(){
  openSheet(`<h3>Nueva solicitud</h3>
   <div class="field"><label>Nombre del cliente</label><input id="f_nom" placeholder="Nombre"></div>
   <div class="field"><label>Teléfono / WhatsApp</label><input id="f_tel" placeholder="+57…"></div>
   <div class="field"><label>Villa</label><select id="f_villa">${villaOpts(villa!=="all"?villa:null)}</select></div>
   <div class="field"><label>Canal</label><select id="f_canal"><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="directo">Sitio web</option><option value="airbnb">Airbnb</option><option value="booking">Booking</option></select></div>
   <div class="field"><label>Huéspedes</label><input id="f_pax" type="number" inputmode="numeric"></div>
   <div class="field"><label>Valor estimado (COP)</label><input id="f_val" type="number" inputmode="numeric"></div>
   <button class="btn" id="f_save">Guardar</button>`);
  $("#f_save").addEventListener("click",async()=>{
    const nom=$("#f_nom").value.trim(); if(!nom)return toast("Indica el nombre");
    const {data:c,error:e1}=await sb.from("contactos").insert({nombre:nom,telefono:$("#f_tel").value||null}).select().single();
    if(e1)return toast("Error: "+e1.message);
    const {error}=await sb.from("leads").insert({contacto:c.id,propiedad:$("#f_villa").value,canal:$("#f_canal").value,huespedes:+$("#f_pax").value||null,valor_estimado:+$("#f_val").value||null,estado:"nuevo"});
    if(error)return toast("Error: "+error.message);
    closeSheet();toast("Solicitud creada ✓");await reload();
  });
}
function formContacto(){
  openSheet(`<h3>Nuevo cliente</h3>
   <div class="field"><label>Nombre</label><input id="f_nom"></div>
   <div class="field"><label>Teléfono / WhatsApp</label><input id="f_tel" placeholder="+57…"></div>
   <div class="field"><label>País</label><input id="f_pais" placeholder="Colombia"></div>
   <div class="field"><label>Segmento</label><select id="f_seg">${Object.entries(SEG).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></div>
   <button class="btn" id="f_save">Guardar</button>`);
  $("#f_save").addEventListener("click",async()=>{
    const nom=$("#f_nom").value.trim(); if(!nom)return toast("Indica el nombre");
    const {error}=await sb.from("contactos").insert({nombre:nom,telefono:$("#f_tel").value||null,pais:$("#f_pais").value||null,segmento:$("#f_seg").value});
    if(error)return toast("Error: "+error.message);
    closeSheet();toast("Cliente creado ✓");await reload();
  });
}
function formTarea(){
  openSheet(`<h3>Nueva tarea</h3>
   <div class="field"><label>Villa</label><select id="f_villa">${villaOpts(villa!=="all"?villa:null)}</select></div>
   <div class="field"><label>Tipo</label><select id="f_tipo"><option value="limpieza">Limpieza</option><option value="mantenimiento">Mantenimiento</option><option value="check_in">Check-in</option><option value="check_out">Check-out</option></select></div>
   <div class="field"><label>Título</label><input id="f_tit" placeholder="Qué hay que hacer"></div>
   <div class="field"><label>Responsable</label><input id="f_resp" placeholder="Johana, Daniel, Ángel, Wendy…"></div>
   <div class="field"><label>Vence</label><input id="f_vence" type="date"></div>
   <button class="btn" id="f_save">Guardar</button>`);
  $("#f_save").addEventListener("click",async()=>{
    const tit=$("#f_tit").value.trim(); if(!tit)return toast("Indica el título");
    const {error}=await sb.from("tareas").insert({propiedad:$("#f_villa").value,tipo:$("#f_tipo").value,titulo:tit,responsable:$("#f_resp").value||null,vence:$("#f_vence").value||null});
    if(error)return toast("Error: "+error.message);
    closeSheet();toast("Tarea creada ✓");await reload();
  });
}
function formReserva(){
  openSheet(`<h3>Nueva reserva</h3>
   <div class="field"><label>Cliente</label><input id="f_nom" placeholder="Nombre del huésped"></div>
   <div class="field"><label>Villa</label><select id="f_villa">${villaOpts(villa!=="all"?villa:null)}</select></div>
   <div class="field"><label>Canal</label><select id="f_canal"><option value="directo">Sitio web/Directo</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="airbnb">Airbnb</option><option value="booking">Booking</option></select></div>
   <div class="split2" style="margin-top:0"><div class="field"><label>Entrada</label><input id="f_in" type="date"></div><div class="field"><label>Salida</label><input id="f_out" type="date"></div></div>
   <div class="field"><label>Huéspedes</label><input id="f_pax" type="number" inputmode="numeric"></div>
   <div class="field"><label>Total (COP)</label><input id="f_total" type="number" inputmode="numeric"></div>
   <button class="btn" id="f_save">Guardar</button>`);
  $("#f_save").addEventListener("click",async()=>{
    const nom=$("#f_nom").value.trim(),fin=$("#f_in").value,fout=$("#f_out").value;
    if(!nom||!fin||!fout)return toast("Completa cliente y fechas");
    if(fout<=fin)return toast("La salida debe ser posterior");
    const {data:c}=await sb.from("contactos").insert({nombre:nom}).select().single();
    const code=(D.villas.find(v=>v.id===$("#f_villa").value)?.slug||"R").slice(0,2).toUpperCase()+"-"+Date.now().toString().slice(-4);
    const {error}=await sb.from("reservas").insert({codigo:code,contacto:c?.id,propiedad:$("#f_villa").value,canal:$("#f_canal").value,fecha_in:fin,fecha_out:fout,huespedes:+$("#f_pax").value||null,total:+$("#f_total").value||0,estado:"confirmada"});
    if(error)return toast("Error: "+error.message);
    closeSheet();toast("Reserva creada ✓");await reload();
  });
}
function openLead(id){
  const l=D.leads.find(x=>x.id===id); if(!l)return;
  openSheet(`<h3>${esc(l.contacto?.nombre||"Solicitud")}</h3>
   <p class="muted" style="margin-bottom:14px">${esc(vname(l.propiedad))} · ${l.huespedes||"–"} pax · ${l.valor_estimado?cop(l.valor_estimado):"sin valor"}</p>
   <div class="field"><label>Estado del pipeline</label><select id="f_estado">${Object.entries(ST).map(([k,v])=>`<option value="${k}" ${l.estado===k?"selected":""}>${v}</option>`).join("")}</select></div>
   <button class="btn" id="f_save">Actualizar estado</button>`);
  $("#f_save").addEventListener("click",async()=>{
    const {error}=await sb.from("leads").update({estado:$("#f_estado").value}).eq("id",id);
    if(error)return toast("Error: "+error.message);
    closeSheet();toast("Actualizado ✓");await reload();
  });
}
async function toggleTask(id,done){
  const {error}=await sb.from("tareas").update({estado:done?"pendiente":"hecha"}).eq("id",id);
  if(error)return toast("Error: "+error.message);
  await reload();
}

boot();
