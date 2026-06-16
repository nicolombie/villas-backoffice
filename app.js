/* ===== Centro de Gestión · app conectada a Supabase ===== */
const sb = supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.publishableKey, {
  auth:{ flowType:"implicit", detectSessionInUrl:true, persistSession:true, autoRefreshToken:true }
});

const CH = {airbnb:{c:"var(--ab)",t:"AB"},booking:{c:"var(--bk)",t:"BK"},instagram:{c:"var(--ig)",t:"IG"},whatsapp:{c:"var(--wa)",t:"WA"},directo:{c:"var(--web)",t:"W"},otro:{c:"var(--soft)",t:"·"}};
const ST = {nuevo:"Nuevo",contactado:"Contactado",cotizado:"Cotizado",reservado:"Reservado",perdido:"Perdido"};
const RST = {cotizacion:"Cotización",confirmada:"Confirmada",en_curso:"En curso",finalizada:"Finalizada",cancelada:"Cancelada"};
const SEG = {familia_paisa:"Familia paisa",grupo_evento:"Grupo/Evento",nomada_digital:"Nómada digital",internacional:"Internacional",corporativo:"Corporativo",otro:"Otro"};
const TEMP = {semana:"Entre semana",fin_de_semana:"Fin de semana",puente:"Puente festivo",temporada_alta:"Temporada alta"};
const TPL = {confirmacion:"Confirmación",instrucciones:"Instrucciones de llegada",recordatorio:"Recordatorio check-out",resena:"Pedir reseña",seguimiento:"Seguimiento"};

let me=null, villa="all", cur="inicio";
let D = {villas:[],leads:[],reservas:[],tx:[],contactos:[],tareas:[],categorias:[],pagos:[],plantillas:[],temporadas:[]};
let leadFilter="todos", crmSeg="Todos";

const cop = n => "$"+Math.round(+n||0).toLocaleString("es-CO");
const copK = n => {n=+n||0; return Math.abs(n)>=1e6 ? "$"+(n/1e6).toFixed(1).replace(".0","")+"M" : "$"+Math.round(n/1000)+"k";};
const initials = s => (s||"·").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();
const fv = arr => villa==="all" ? arr : arr.filter(x=>x.propiedad===villa);
const vname = id => (D.villas.find(v=>v.id===id)||{}).nombre || "—";
const vcolor = id => (D.villas.find(v=>v.id===id)||{}).color || "var(--green)";
const villaEnlace = id => {const v=D.villas.find(x=>x.id===id);return v?`https://www.villasdecolombia.com/villa-${v.slug}/`:"";};
const $ = s => document.querySelector(s);
const esc = s => (s==null?"":String(s)).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");setTimeout(()=>t.classList.remove("on"),2200);}
function thisMonth(){const d=new Date();return {y:d.getFullYear(),m:d.getMonth()};}
const MONTHS=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function fmtD(s){ if(!s) return "—"; const d=new Date(s+"T00:00:00"); return d.getDate()+" "+MONTHS[d.getMonth()].slice(0,3); }
const pagosDe = rid => D.pagos.filter(p=>p.reserva===rid);
const pagadoDe = r => pagosDe(r.id).reduce((a,b)=>a+ +b.monto,0);
const saldoDe = r => (+r.total||0) - pagadoDe(r);
function waLink(phone,text){return "https://wa.me/"+String(phone||"").replace(/[^0-9]/g,"")+"?text="+encodeURIComponent(text);}
function fillTpl(b,d){return (b||"").replace(/{nombre}/g,d.nombre||"").replace(/{villa}/g,d.villa||"").replace(/{fecha_in}/g,d.fin||"").replace(/{fecha_out}/g,d.fout||"").replace(/{enlace}/g,d.enlace||"");}

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
let pendingEmail="";
$("#loginForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const email=$("#loginEmail").value.trim();
  if(!email) return;
  $("#loginBtn").disabled=true; $("#loginMsg").textContent="Enviando…";
  const {error}=await sb.auth.signInWithOtp({email, options:{emailRedirectTo:location.href, shouldCreateUser:true}});
  $("#loginBtn").disabled=false;
  if(error){ $("#loginMsg").textContent="Error: "+error.message; return; }
  pendingEmail=email;
  $("#codeForm").classList.remove("hidden");
  $("#loginCode").focus();
  $("#loginMsg").textContent="✓ Te enviamos un código por correo. Escríbelo aquí.";
});
$("#codeForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const token=$("#loginCode").value.trim().replace(/\s/g,"");
  const email=pendingEmail||$("#loginEmail").value.trim();
  if(!token||!email) return;
  $("#codeBtn").disabled=true; $("#loginMsg").textContent="Verificando…";
  const {error}=await sb.auth.verifyOtp({email, token, type:"email"});
  $("#codeBtn").disabled=false;
  if(error){ $("#loginMsg").textContent="Código incorrecto o expirado. Pide uno nuevo."; }
});

/* ---------- DATA ---------- */
async function loadAll(){
  const r = await Promise.all([
    sb.from("propiedades").select("*").order("nombre"),
    sb.from("leads").select("*, cliente:contactos(nombre,telefono)").order("creado",{ascending:false}),
    sb.from("reservas").select("*, cliente:contactos(nombre,telefono)").order("fecha_in",{ascending:false}),
    sb.from("transacciones").select("*, categoria:categorias(nombre,tipo)").order("fecha",{ascending:false}),
    sb.from("contactos").select("*").order("nombre"),
    sb.from("tareas").select("*").order("vence"),
    sb.from("categorias").select("*").order("orden"),
    sb.from("pagos").select("*"),
    sb.from("plantillas_mensaje").select("*"),
    sb.from("temporadas").select("*")
  ]);
  D.villas=r[0].data||[]; D.leads=r[1].data||[]; D.reservas=r[2].data||[];
  D.tx=r[3].data||[]; D.contactos=r[4].data||[]; D.tareas=r[5].data||[]; D.categorias=r[6].data||[];
  D.pagos=r[7].data||[]; D.plantillas=r[8].data||[]; D.temporadas=r[9].data||[];
  const vf=$("#vfilter");
  vf.innerHTML = '<button class="vchip on" data-villa="all">Las 2 villas</button>' +
    D.villas.map(v=>`<button class="vchip" data-villa="${v.id}">${esc(v.nombre.replace(/^Villa (Las )?/,""))}</button>`).join("");
}
async function reload(){ await loadAll(); render(); }

/* ---------- helpers ---------- */
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
  const porCobrar=fv(D.reservas).filter(r=>r.estado==="confirmada"||r.estado==="en_curso").map(r=>({r,s:saldoDe(r)})).filter(x=>x.s>0);
  const totCobrar=porCobrar.reduce((a,b)=>a+b.s,0);
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
  ${ porCobrar.length ? `<div class="sec-t">Saldos por cobrar · ${cop(totCobrar)}</div>
  <div class="card">${porCobrar.slice(0,4).map(({r,s})=>`
    <button class="li" style="width:100%;text-align:left" data-reserva="${r.id}"><div class="ava2" style="background:${vcolor(r.propiedad)}">${initials(r.cliente?.nombre||r.codigo)}</div>
    <div class="main"><b>${esc(r.cliente?.nombre||r.codigo)}</b><small>${esc(vname(r.propiedad))} · ${fmtD(r.fecha_in)}</small></div>
    <div class="end"><b class="neg">${copK(s)}</b><small>pendiente</small></div></button>`).join("")}</div>`:"" }
  <div class="sec-t">Próximas llegadas</div>
  <div class="card">${ next.length ? next.map(r=>`
    <button class="li" style="width:100%;text-align:left" data-reserva="${r.id}"><div class="ava2" style="background:${vcolor(r.propiedad)}">${initials(r.cliente?.nombre||r.codigo)}</div>
    <div class="main"><b>${esc(r.cliente?.nombre||r.codigo||"Reserva")}</b><small>${esc(vname(r.propiedad))} · ${r.huespedes||"–"} pax</small></div>
    <div class="end"><b>${fmtD(r.fecha_in)}</b><small><span class="badge b-${r.estado}">${RST[r.estado]}</span></small></div></button>`).join("")
    : emptyState("Aún no hay reservas","Crea la primera desde Reservas.") }
  </div>`;
}

function vBandeja(){
  const counts={todos:fv(D.leads).length};
  Object.keys(ST).forEach(k=>counts[k]=fv(D.leads).filter(l=>l.estado===k).length);
  const list=fv(D.leads).filter(l=>leadFilter==="todos"||l.estado===leadFilter);
  const chips=["todos",...Object.keys(ST)].map(k=>`<button class="chip ${leadFilter===k?"on":""}" data-lf="${k}">${k==="todos"?"Todos":ST[k]}${counts[k]?` (${counts[k]})`:""}</button>`).join("");
  return `<div class="chips">${chips}</div>
  <div class="card">${ list.length ? list.map(l=>`
    <button class="li" style="width:100%;text-align:left" data-lead="${l.id}"><div class="ava2" style="background:${vcolor(l.propiedad)}">${initials(l.cliente?.nombre||"·")}</div>
    <div class="main"><b>${esc(l.cliente?.nombre||"Sin nombre")}</b><small>${esc(vname(l.propiedad))} · ${l.huespedes||"–"} pax</small>
      <div style="margin-top:5px;display:flex;gap:6px;align-items:center"><span class="badge b-${l.estado}">${ST[l.estado]}</span>${chan(l.canal)}</div></div>
    <div class="end"><b>${l.valor_estimado?copK(l.valor_estimado):"—"}</b></div></button>`).join("")
    : emptyState("Sin solicitudes","Registra la primera con el botón +.") }
  </div>`;
}

function vCalendario(){
  const {y,m}=thisMonth();
  const dow=["L","M","X","J","V","S","D"];
  const off=(new Date(y,m,1).getDay()+6)%7;
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
    <button class="li" style="width:100%;text-align:left" data-reserva="${r.id}"><div class="ava2" style="background:${vcolor(r.propiedad)}">${(CH[r.canal]||CH.otro).t}</div>
    <div class="main"><b>${esc(r.cliente?.nombre||r.codigo||"Reserva")}</b><small>${esc(vname(r.propiedad))}</small></div>
    <div class="end"><b>${fmtD(r.fecha_in)}→${fmtD(r.fecha_out)}</b><small><span class="badge b-${r.estado}">${RST[r.estado]}</span></small></div></button>`).join("")
    : emptyState("Sin reservas próximas","") }
  </div>
  <div class="card" style="background:#FFF7E8;border-color:#F0DFB6"><small class="muted" style="color:#8A6516">◆ Pega los enlaces iCal de Airbnb y Booking en Ajustes para sincronizar y evitar sobre-reservas.</small></div>`;
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
  const val=cid=>D.reservas.filter(r=>r.contacto===cid).reduce((a,b)=>a+ +b.total,0);
  return `<div class="chips">${segs.map(s=>`<button class="chip ${crmSeg===s?"on":""}" data-seg="${esc(s)}">${esc(s)}</button>`).join("")}</div>
  <div class="card">${ list.length ? list.sort((a,b)=>val(b.id)-val(a.id)).map(c=>`
    <div class="li"><div class="ava2" style="background:var(--green)">${initials(c.nombre)}</div>
    <div class="main"><b>${esc(c.nombre)}</b><small>${esc(c.pais||"")}${c.pais?" · ":""}${SEG[c.segmento]||""}${val(c.id)?" · "+copK(val(c.id)):""}</small></div>
    <div class="end">${c.telefono?`<a class="badge b-reservado" href="https://wa.me/${c.telefono.replace(/[^0-9]/g,"")}" target="_blank">WhatsApp</a>`:""}</div></div>`).join("")
    : emptyState("Sin clientes aún","Agrega contactos con el botón +.") }
  </div>`;
}

function vReservas(){
  const list=fv(D.reservas);
  return `<div class="card">${ list.length ? list.map(r=>{const s=saldoDe(r);return `
    <button class="li" style="width:100%;text-align:left" data-reserva="${r.id}"><div class="ava2" style="background:${vcolor(r.propiedad)}">${esc((r.codigo||"R").slice(0,2))}</div>
    <div class="main"><b>${esc(r.cliente?.nombre||r.codigo||"Reserva")}</b><small>${esc(vname(r.propiedad))} · ${fmtD(r.fecha_in)}→${fmtD(r.fecha_out)}</small>
      <div style="margin-top:5px;display:flex;gap:6px"><span class="badge b-${r.estado}">${RST[r.estado]}</span>${s>0?`<span class="badge b-contactado">Saldo ${copK(s)}</span>`:`<span class="badge b-reservado">Pagado</span>`}</div></div>
    <div class="end"><b>${copK(r.total)}</b><small>${r.huespedes||"–"} pax</small></div></button>`;}).join("")
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
    ["ajustes","Tarifas y ajustes","M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"]];
  return `<div class="card" style="padding:4px 16px">${items.map(([id,t,p])=>`
    <button class="menu-li" data-go="${id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="${p}"/></svg>${t}<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></button>`).join("")}</div>
  <button class="btn ghost" id="logout" style="margin-top:8px">Cerrar sesión (${esc(me?.nombre||"")})</button>
  <p class="muted" style="text-align:center;margin-top:14px">Centro de Gestión · Villas de Colombia</p>`;
}
function vAjustes(){
  const grid=D.villas.map(v=>{
    const rows=["semana","fin_de_semana","puente","temporada_alta"].map(tp=>{
      const t=D.temporadas.find(x=>x.propiedad===v.id&&x.tipo===tp);
      return `<div class="li"><div class="main"><b>${TEMP[tp]}</b><small>mín. ${t?.min_noches||1} noche(s)</small></div>
        <div class="end"><input class="tarin" data-tid="${t?.id||""}" inputmode="numeric" value="${t?Math.round(t.precio_noche):0}" style="width:120px;padding:8px;border:1px solid var(--line);border-radius:8px;text-align:right"></div></div>`;
    }).join("");
    return `<div class="card"><h3 style="font-size:1rem;margin-bottom:6px">${esc(v.nombre)}</h3>${rows}</div>`;
  }).join("");
  return `<div class="sec-t">Grilla tarifaria (COP / noche)</div>${grid}
  <button class="btn" data-savetar="1">Guardar tarifas</button>
  <div class="sec-t">Sincronización de calendarios</div>
  ${D.villas.map(v=>`<div class="card"><h3 style="font-size:.95rem;margin-bottom:8px">${esc(v.nombre)}</h3>
    <div class="field"><label>iCal Airbnb</label><input class="icalin" data-vid="${v.id}" data-k="ical_airbnb" placeholder="https://www.airbnb.com/calendar/ical/..." value="${esc(v.ical_airbnb||"")}"></div>
    <div class="field"><label>iCal Booking</label><input class="icalin" data-vid="${v.id}" data-k="ical_booking" placeholder="https://admin.booking.com/...ical" value="${esc(v.ical_booking||"")}"></div></div>`).join("")}
  <button class="btn ghost" data-saveical="1">Guardar enlaces iCal</button>
  <div class="card" style="margin-top:14px"><h3 style="font-size:1rem;margin-bottom:6px">Tu equipo</h3><p class="muted">Nicolas (propietario), Pauline y Soizic (admin).</p></div>`;
}

const VIEWS={inicio:["Inicio",vDash],bandeja:["Solicitudes",vBandeja],calendario:["Calendario",vCalendario],
 finanzas:["Finanzas",vFinanzas],mas:["Más",vMas],crm:["Clientes (CRM)",vCRM],reservas:["Reservas",vReservas],
 estadisticas:["Estadísticas",vStats],operaciones:["Operaciones",vOps],ajustes:["Tarifas y ajustes",vAjustes]};
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
  const resv=e.target.closest("[data-reserva]"); if(resv){openReserva(resv.dataset.reserva);return;}
  const task=e.target.closest("[data-task]"); if(task){await toggleTask(task.dataset.task,task.dataset.done==="1");return;}
  if(e.target.closest("[data-savetar]")){return saveTarifas();}
  if(e.target.closest("[data-saveical]")){return saveIcal();}
  if(e.target.id==="logout"){await sb.auth.signOut();}
});

/* ---------- SHEET ---------- */
const sheetBg=$("#sheetBg"), sheet=$("#sheet");
function closeSheet(){sheetBg.classList.remove("on");sheet.innerHTML="";}
sheetBg.addEventListener("click",e=>{if(e.target===sheetBg)closeSheet();});
function openSheet(html){sheet.innerHTML=html;sheetBg.classList.add("on");}
const villaOpts=sel=>D.villas.map(v=>`<option value="${v.id}" ${sel===v.id?"selected":""}>${esc(v.nombre)}</option>`).join("");

/* WhatsApp con plantillas */
function waBlock(ctx){
  // ctx: {phone, nombre, villaId, fin, fout}
  const enlace=villaEnlace(ctx.villaId), villa=vname(ctx.villaId);
  const tpls=D.plantillas.filter(p=>TPL[p.clave]);
  if(!tpls.length) return "";
  const btns=tpls.map(p=>{
    const txt=fillTpl(p.cuerpo,{nombre:ctx.nombre,villa,fin:fmtD(ctx.fin),fout:fmtD(ctx.fout),enlace});
    return `<a class="btn ghost" style="justify-content:flex-start" target="_blank" href="${waLink(ctx.phone,txt)}">WhatsApp · ${TPL[p.clave]}</a>`;
  }).join("");
  return `<div class="sec-t" style="margin-top:8px">Enviar por WhatsApp</div><div style="display:grid;gap:8px">${btns}</div>`;
}

function openAdd(kind){
  if(kind==="ingreso"||kind==="gasto") return formTx(kind);
  if(cur==="bandeja") return formLead();
  if(cur==="crm") return formContacto();
  if(cur==="operaciones") return formTarea();
  if(cur==="reservas") return formReserva();
  if(cur==="finanzas") return formTx("gasto");
  openSheet(`<h3>¿Qué quieres registrar?</h3><div style="display:grid;gap:10px">
    <button class="btn" data-q="lead">Nueva solicitud</button>
    <button class="btn" data-q="reserva">Nueva reserva</button>
    <button class="btn ghost" data-q="ingreso">Ingreso</button>
    <button class="btn ghost" data-q="gasto">Gasto</button>
    <button class="btn ghost" data-q="tarea">Tarea</button>
    <button class="btn ghost" data-q="contacto">Cliente</button></div>`);
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
function formReserva(pre){
  pre=pre||{};
  openSheet(`<h3>Nueva reserva</h3>
   <div class="field"><label>Cliente</label><input id="f_nom" value="${esc(pre.nombre||"")}" placeholder="Nombre del huésped"></div>
   <div class="field"><label>Teléfono</label><input id="f_tel" value="${esc(pre.tel||"")}" placeholder="+57…"></div>
   <div class="field"><label>Villa</label><select id="f_villa">${villaOpts(pre.villa||(villa!=="all"?villa:null))}</select></div>
   <div class="field"><label>Canal</label><select id="f_canal">${["directo","whatsapp","instagram","airbnb","booking"].map(c=>`<option value="${c}" ${pre.canal===c?"selected":""}>${c==="directo"?"Sitio web/Directo":c[0].toUpperCase()+c.slice(1)}</option>`).join("")}</select></div>
   <div class="split2" style="margin-top:0"><div class="field"><label>Entrada</label><input id="f_in" type="date"></div><div class="field"><label>Salida</label><input id="f_out" type="date"></div></div>
   <div class="field"><label>Huéspedes</label><input id="f_pax" type="number" inputmode="numeric" value="${esc(pre.pax||"")}"></div>
   <div class="field"><label>Total (COP)</label><input id="f_total" type="number" inputmode="numeric" value="${esc(pre.total||"")}"></div>
   <button class="btn" id="f_save">Guardar</button>`);
  $("#f_save").addEventListener("click",async()=>{
    const nom=$("#f_nom").value.trim(),fin=$("#f_in").value,fout=$("#f_out").value;
    if(!nom||!fin||!fout)return toast("Completa cliente y fechas");
    if(fout<=fin)return toast("La salida debe ser posterior");
    let cid=pre.contacto;
    if(cid){ if($("#f_tel").value) await sb.from("contactos").update({telefono:$("#f_tel").value}).eq("id",cid); }
    else { const {data:c}=await sb.from("contactos").insert({nombre:nom,telefono:$("#f_tel").value||null}).select().single(); cid=c?.id; }
    const code=(D.villas.find(v=>v.id===$("#f_villa").value)?.slug||"R").slice(0,2).toUpperCase()+"-"+Date.now().toString().slice(-4);
    const {error}=await sb.from("reservas").insert({codigo:code,contacto:cid,propiedad:$("#f_villa").value,canal:$("#f_canal").value,fecha_in:fin,fecha_out:fout,huespedes:+$("#f_pax").value||null,total:+$("#f_total").value||0,estado:"confirmada"});
    if(error)return toast("Error: "+error.message);
    if(pre.leadId) await sb.from("leads").update({estado:"reservado"}).eq("id",pre.leadId);
    closeSheet();toast("Reserva creada ✓");await reload();
  });
}
function openLead(id){
  const l=D.leads.find(x=>x.id===id); if(!l)return;
  openSheet(`<h3>${esc(l.cliente?.nombre||"Solicitud")}</h3>
   <p class="muted" style="margin-bottom:14px">${esc(vname(l.propiedad))} · ${l.huespedes||"–"} pax · ${l.valor_estimado?cop(l.valor_estimado):"sin valor"} · ${chan(l.canal).replace(/<[^>]+>/g,"")}</p>
   <div class="field"><label>Estado del pipeline</label><select id="f_estado">${Object.entries(ST).map(([k,v])=>`<option value="${k}" ${l.estado===k?"selected":""}>${v}</option>`).join("")}</select></div>
   <div class="split2" style="margin-top:0"><button class="btn" id="f_save">Actualizar</button><button class="btn ghost" id="f_conv">Convertir en reserva</button></div>
   ${waBlock({phone:l.cliente?.telefono, nombre:l.cliente?.nombre, villaId:l.propiedad})}`);
  $("#f_save").addEventListener("click",async()=>{
    const {error}=await sb.from("leads").update({estado:$("#f_estado").value}).eq("id",id);
    if(error)return toast("Error: "+error.message);
    closeSheet();toast("Actualizado ✓");await reload();
  });
  $("#f_conv").addEventListener("click",()=>{
    formReserva({nombre:l.cliente?.nombre,tel:l.cliente?.telefono,contacto:l.contacto,villa:l.propiedad,canal:l.canal,pax:l.huespedes,total:l.valor_estimado,leadId:l.id});
  });
}
function openReserva(id){
  const r=D.reservas.find(x=>x.id===id); if(!r)return;
  const pagado=pagadoDe(r), saldo=saldoDe(r);
  openSheet(`<h3>${esc(r.cliente?.nombre||r.codigo||"Reserva")}</h3>
   <p class="muted" style="margin-bottom:12px">${esc(r.codigo||"")} · ${esc(vname(r.propiedad))} · ${fmtD(r.fecha_in)}→${fmtD(r.fecha_out)} · ${r.huespedes||"–"} pax</p>
   <div class="card" style="margin-bottom:12px"><div class="spread"><span class="muted">Total</span><b>${cop(r.total)}</b></div>
    <div class="spread"><span class="muted">Pagado</span><b class="pos">${cop(pagado)}</b></div>
    <div class="spread"><span class="muted">Saldo</span><b class="${saldo>0?'neg':'pos'}">${cop(saldo)}</b></div></div>
   <div class="field"><label>Estado</label><select id="f_estado">${Object.entries(RST).map(([k,v])=>`<option value="${k}" ${r.estado===k?"selected":""}>${v}</option>`).join("")}</select></div>
   <div class="split2" style="margin-top:0"><button class="btn" id="f_est">Guardar estado</button><button class="btn ghost" id="f_pago">Registrar pago</button></div>
   ${waBlock({phone:r.cliente?.telefono, nombre:r.cliente?.nombre, villaId:r.propiedad, fin:r.fecha_in, fout:r.fecha_out})}`);
  $("#f_est").addEventListener("click",async()=>{
    const {error}=await sb.from("reservas").update({estado:$("#f_estado").value}).eq("id",id);
    if(error)return toast("Error: "+error.message);
    closeSheet();toast("Actualizado ✓");await reload();
  });
  $("#f_pago").addEventListener("click",()=>formPago(r,saldo));
}
function formPago(r,saldo){
  openSheet(`<h3>Registrar pago</h3>
   <p class="muted" style="margin-bottom:12px">${esc(r.cliente?.nombre||r.codigo)} · saldo ${cop(saldo)}</p>
   <div class="field"><label>Concepto</label><select id="f_con"><option value="anticipo">Anticipo</option><option value="saldo">Saldo</option><option value="otro">Otro</option></select></div>
   <div class="field"><label>Método</label><select id="f_met"><option>Bancolombia</option><option>Nequi</option><option>Efectivo</option><option>Tarjeta</option></select></div>
   <div class="field"><label>Monto (COP)</label><input id="f_monto" type="number" inputmode="numeric" value="${saldo>0?Math.round(saldo):''}"></div>
   <div class="field"><label>Fecha</label><input id="f_fecha" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
   <button class="btn" id="f_save">Guardar pago</button>`);
  $("#f_save").addEventListener("click",async()=>{
    const monto=+$("#f_monto").value; if(!monto)return toast("Indica el monto");
    const {error}=await sb.from("pagos").insert({reserva:r.id,concepto:$("#f_con").value,metodo:$("#f_met").value,monto,fecha:$("#f_fecha").value});
    if(error)return toast("Error: "+error.message);
    // registrar también como ingreso para el P&L
    await sb.from("transacciones").insert({propiedad:r.propiedad,reserva:r.id,tipo:"ingreso",concepto:"Pago "+(r.codigo||""),monto,fecha:$("#f_fecha").value});
    closeSheet();toast("Pago registrado ✓");await reload();
  });
}
async function toggleTask(id,done){
  const {error}=await sb.from("tareas").update({estado:done?"pendiente":"hecha"}).eq("id",id);
  if(error)return toast("Error: "+error.message);
  await reload();
}
async function saveTarifas(){
  const inputs=[...document.querySelectorAll(".tarin")].filter(i=>i.dataset.tid);
  for(const i of inputs){ await sb.from("temporadas").update({precio_noche:+i.value||0}).eq("id",i.dataset.tid); }
  toast("Tarifas guardadas ✓"); await reload();
}
async function saveIcal(){
  const inputs=[...document.querySelectorAll(".icalin")];
  const byV={};
  inputs.forEach(i=>{byV[i.dataset.vid]=byV[i.dataset.vid]||{}; byV[i.dataset.vid][i.dataset.k]=i.value||null;});
  for(const vid in byV){ await sb.from("propiedades").update(byV[vid]).eq("id",vid); }
  toast("Enlaces guardados ✓"); await reload();
}

boot();
