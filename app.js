(function(){
const $=(id)=>document.getElementById(id);
let data=[],suivi=new Map(),listes={closeurs:[],statuts:[]},selected=null,db=null,user=null,canWrite=true,period=0,prevRank=new Map(),view='tableau';
const f={fin:'',du:'',au:'',closeur:'',statut:'',type:'',coaching:'',acc:'',qualite:'',q:''};
let sortKey='date_formation',sortDir=-1;
const coll=new Intl.Collator('fr',{numeric:true,sensitivity:'base'});
const norm=(s)=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const defs=new Map();
const get=(e)=>suivi.get(e)||(defs.has(e)?{closeur:defs.get(e)}:{});
const COPY_ICO='<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="5" width="9" height="9" rx="2"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>';
const COLS=[{k:'personne',l:'Personne',w:285,t:'name'},{k:'activite',l:'Activité',w:230},{k:'email',l:'E-mail',w:230,t:'copy'},{k:'kyc',l:'Mini KYC',w:320,long:1},{k:'telephone',l:'Téléphone',w:245,t:'copy'},{k:'statut',l:'Statut',w:220,t:'pick'},{k:'closeur',l:'Closeur',w:180,t:'pick'},{k:'offre',l:'Offre closée',w:610,t:'pick'},{k:'lien_ard',l:'Lien ARD personnalisé',w:230,t:'lien'},{k:'lien_bd',l:'Lien formulaire accompagnement',w:250,t:'lien'},{k:'besoins',l:'Besoins',w:280,long:1},{k:'questions',l:"Questions d'audit",w:400,long:1},{k:'pistes',l:"Pistes d'implémentation IA",w:400,long:1},{k:'angle',l:'Angle',w:290,long:1},{k:'financement',l:'Financement',w:140,t:'tag'},{k:'formation',s:'date_formation',l:'Date de formation',w:150},{k:'coaching',l:'Coaching',w:135,t:'tag'},{k:'accompagnement',l:'Accompagnement',w:160,t:'tag'},{k:'contact',l:'Contact',w:140,t:'tag'},{k:'qualite',l:'Fiche',w:110,t:'tag'}];
const BYK=Object.fromEntries(COLS.map((c)=>[c.k,c]));
const LS='upsell-colonnes-v1';
let order=COLS.map((c)=>c.k),widths={},hideLong=false;
try{const s=JSON.parse(localStorage.getItem(LS)||'null');if(s){if(Array.isArray(s.order)){const known=s.order.filter((k)=>BYK[k]);order=known.concat(COLS.map((c)=>c.k).filter((k)=>!known.includes(k)));const neuves=['offre','lien_ard','lien_bd'].filter((k)=>!s.order.includes(k));if(neuves.length){order=order.filter((k)=>!neuves.includes(k));order.splice(order.indexOf('closeur')+1,0,...neuves);}}if(s.widths)widths=s.widths;}}catch(_){}
const saveCols=()=>{try{localStorage.setItem(LS,JSON.stringify({order,widths}));}catch(_){}};
const vis=()=>order.map((k)=>BYK[k]).filter((c)=>!(hideLong&&c.long));
const W=(c)=>widths[c.k]||c.w;
const val=(r,k)=>k==='closeur'||k==='statut'||k==='offre'?(get(r.email)[k]||''):(r[k]||'');
const TAG={'CPF':'indigo','Fonds propres':'green','OPCO':'amber','CPF + Fonds propres':'teal','Réalisé':'green','Vendu, en cours':'violet','Vendu':'violet','Demande':'amber','Annulé':'red','Oui':'green','Presta signée':'teal','Presta entreprise':'blue','OK':'green','Ne pas contacter':'red','Désabonné e-mail':'amber','Complète':'green','Partielle':'amber','À qualifier':'red'};
const CLOSED=new Set(['INSCRIPTION VALIDÉE','PAYÉ']);
const POINTS={'RDV PRIS':10,'MOTIVÉ À CLOSÉ PRIO':30,'INSCRIPTION EN COURS':50,'INSCRIPTION VALIDÉE':100,'PAYÉ':100};
const LEVELS=[[0,'Chaton'],[100,'Tigreau'],[300,'Tigre'],[700,'Tigre royal'],[1500,'Légende']];
const BADGES=[['Premier sang',(s)=>s.closes>=1,'green'],['Hat-trick',(s)=>s.closes>=3,'amber'],['Dix-de-der',(s)=>s.closes>=10,'pink'],['Machine à RDV',(s)=>s.avance>=10,'blue'],['Sniper',(s)=>s.traites>=5&&s.closes/s.traites>=.3,'violet']];
const toast=(t)=>{const e=$('toast');e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{e.hidden=true;},4000);};
const tone=(s)=>{const l=listes.statuts.find((x)=>x.nom===s);return l?l.ton||'':'';};
function match(r){
  const s=get(r.email),q=norm(f.q);
  if((f.du||f.au)&&!r.dates.some((d)=>(!f.du||d>=f.du)&&(!f.au||d<=f.au)))return false;
  if(f.fin&&!r.financement.split(' + ').includes(f.fin))return false;
  if(f.closeur==='__none'?s.closeur:(f.closeur&&s.closeur!==f.closeur))return false;
  if(f.statut==='__none'?s.statut:(f.statut&&s.statut!==f.statut))return false;
  if(f.type&&!r.type_formation.split(' + ').includes(f.type))return false;
  if(f.coaching==='deja'?!['Réalisé','Vendu, en cours','Vendu'].includes(r.coaching):(f.coaching&&r.coaching!==f.coaching))return false;
  if(f.acc&&r.accompagnement!==f.acc)return false;
  if(f.qualite==='commune'?r.fiche_type!=='Commune entreprise':(f.qualite&&r.qualite!==f.qualite))return false;
  if(q&&!norm(r.personne+' '+r.activite+' '+r.secteur+' '+r.email+' '+r.telephone).includes(q))return false;
  return true;
}
function sorted(list){return list.slice().sort((a,b)=>{const x=val(a,sortKey),y=val(b,sortKey);if(!x&&!y)return 0;if(!x)return 1;if(!y)return -1;return sortDir*coll.compare(x,y);});}
/* Les menus ne portent que la valeur courante, la liste complète n'est posée qu'à l'ouverture : la page reste fluide avec toutes les lignes. */
const blank=(k)=>k==='closeur'?'Choisir un closeur':k==='offre'?'Choisir une offre':'Choisir un statut';
const OFFRES=(()=>{const eur=(n)=>n.toLocaleString('fr-FR',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2})+' €';const g=[];for(const [h,p] of [[4,980],[8,1590],[16,2990]]){const items=[];for(const [m,r] of [[3,10],[6,15],[12,20]]){const pm=p*(100-r)/100;items.push(`Accompagnement ${h} h · engagement ${m} mois (−${r} %) · ${eur(pm)}/mois · ${eur(pm*m)} au total${m===3?' · offre par défaut':''}`);}items.push(`Accompagnement ${h} h · sans engagement, mois par mois · ${eur(p)}/mois · downsell`);g.push({l:`Accompagnement ${h} h par mois`,items});}g.push({l:'Offres ponctuelles',items:[`Coaching 4 h · ponctuel, non récurrent · ${eur(1000)}`,`Formation N2 · ${eur(1990)}`]});return g;})();
const lienAppel=(t)=>{const d=String(t).replace(/[^\d+]/g,'');const n=/^0\d{9}$/.test(d)?'+33'+d.slice(1):/^\+\d{7,15}$/.test(d)?d:'';return n?'https://web.withallo.com/?number='+encodeURIComponent(n):'';};
const URL_BRAS_DROIT='https://www.franceia.com/formulaire-bras-droit-ia/';
const preparerArd=(u)=>u.replace('franceia-dev.com/?','franceia-dev.com/preparer-lien?');
function lienCell(par,copie,titre,lien,libelle,titreLien){const b=document.createElement('button');b.type='button';b.className='cp lcopy';b.title=titre;b.dataset.v=copie;b.insertAdjacentHTML('beforeend',COPY_ICO);const s=document.createElement('span');s.textContent='Copier';b.append(s);const a=document.createElement('a');a.className='lopen';a.href=lien;a.target='_blank';a.rel='noopener';a.title=titreLien;a.textContent=libelle;const w=document.createElement('div');w.className='liens';w.append(b,a);par.append(w);}
function paint(s,v){if(s.dataset.kind==='statut')s.dataset.tone=tone(v);else s.dataset.on=v?'1':'';const mo=window.__moi;s.disabled=!canWrite||!!(mo&&!mo.admin&&(s.dataset.kind==='closeur'||(s.dataset.email&&get(s.dataset.email).closeur!==mo.nom)));}
function setSel(s,v){s.replaceChildren(new Option(v||blank(s.dataset.kind),v||''));s.value=v||'';s.dataset.full='';paint(s,v);}
function fullSel(s){if(s.dataset.full==='1')return;const k=s.dataset.kind,v=s.value;if(k==='offre'){const tout=OFFRES.flatMap((g)=>g.items);const nodes=OFFRES.map((g)=>{const o=document.createElement('optgroup');o.label=g.l;o.append(...g.items.map((n)=>new Option(n,n)));return o;});s.replaceChildren(new Option(blank(k),''),...(v&&!tout.includes(v)?[new Option(v,v)]:[]),...nodes);s.value=v;s.dataset.full='1';return;}const o=k==='closeur'?listes.closeurs:listes.statuts.map((x)=>x.nom);const all=v&&!o.includes(v)?o.concat(v):o;s.replaceChildren(new Option(blank(k),''),...all.map((n)=>new Option(n,n)));s.value=v;s.dataset.full='1';}
function pick(r,k){const s=document.createElement('select');s.className='pick';s.dataset.kind=k;s.dataset.email=r.email;s.setAttribute('aria-label',(k==='closeur'?'Closeur de ':k==='offre'?'Offre closée de ':'Statut de ')+r.personne);setSel(s,get(r.email)[k]);return s;}
document.addEventListener('pointerdown',(e)=>{if(e.target.matches&&e.target.matches('select.pick'))fullSel(e.target);},true);
document.addEventListener('focusin',(e)=>{if(e.target.matches&&e.target.matches('select.pick'))fullSel(e.target);});
function markSort(){document.querySelectorAll('#hr th').forEach((t)=>{if(t.dataset.sort===sortKey)t.setAttribute('aria-sort',sortDir>0?'ascending':'descending');else t.removeAttribute('aria-sort');});}
function sizeTable(){const cs=vis();$('table').style.width=cs.reduce((a,c)=>a+W(c),0)+'px';[...$('cg').children].forEach((g,i)=>{if(cs[i])g.style.width=W(cs[i])+'px';});}
function renderHead(){
  const cs=vis();
  $('cg').replaceChildren(...cs.map(()=>document.createElement('col')));
  $('hr').replaceChildren(...cs.map((c)=>{const th=document.createElement('th');th.textContent=c.l;th.title=c.l;th.dataset.k=c.k;th.dataset.sort=c.s||c.k;th.tabIndex=0;th.draggable=true;const r=document.createElement('div');r.className='rs';r.title='Glisser pour redimensionner, double-clic pour la largeur par défaut';th.append(r);return th;}));
  sizeTable();markSort();
}
function cellFor(tr,c,r){
  const td=document.createElement('td');tr.append(td);const v=r[c.k]||'';
  if(c.t==='name'){const w=document.createElement('div');w.className='pers';const b=document.createElement('button');b.type='button';b.className='name';b.textContent=v;w.append(b);if(r.crmia_url){const a=document.createElement('a');a.className='crm'+(r.crmia==='Fiche entreprise'?' soft':'');a.href=r.crmia_url;a.target='_blank';a.rel='noopener';a.title=r.crmia==='Fiche entreprise'?"Cette personne n'a pas de fiche : ouvre le contact de son entreprise dans CRMIA":'Ouvrir sa fiche dans CRMIA';a.textContent=r.crmia==='Fiche entreprise'?'Entreprise':'CRMIA';w.append(a);}else{const s=document.createElement('span');s.className='nocrm';s.title='Aucune fiche à son nom dans CRMIA';s.textContent='Pas de fiche';w.append(s);}td.append(w);}
  else if(c.t==='link'){const a=document.createElement('a');a.className='lnk'+(v==='Ouvrir la fiche'?'':' soft');a.href=r.crmia_url;a.target='_blank';a.rel='noopener';a.textContent=v;td.append(a);}
  else if(c.t==='pick')td.append(pick(r,c.k));
  else if(c.t==='lien'){if(c.k==='lien_ard')lienCell(td,r.ard_url,'Copier le lien ARD de cette personne, prêt à envoyer',preparerArd(r.ard_url),'Préparer',"Répondre à sa place (offre, financement, date), puis générer le lien");else lienCell(td,URL_BRAS_DROIT,"Copier le lien du formulaire d'accompagnement",URL_BRAS_DROIT,'Ouvrir',"Ouvrir le formulaire d'accompagnement");}
  else if(c.t==='tag'){const s=document.createElement('span');s.className='tag t-'+(TAG[v]||'x');s.textContent=v;td.append(s);}
  else if(c.t==='copy'){if(v){const b=document.createElement('button');b.type='button';b.className='cp';b.title='Copier';b.dataset.v=v;if(c.k==='telephone'&&r.telephone_source)b.title='Copier · source : '+r.telephone_source;const s=document.createElement('span');s.textContent=v;b.append(s);b.insertAdjacentHTML('beforeend',COPY_ICO);td.append(b);}else if(c.k==='telephone'){const s=document.createElement('span');s.className='none';s.textContent='Non trouvé';td.append(s);}if(c.k==='telephone'&&v){const u=lienAppel(v);const last=td.lastElementChild;if(u&&last){const w=document.createElement('div');w.className='liens';w.append(last);const a=document.createElement('a');a.className='lopen appel';a.href=u;a.target='_blank';a.rel='noopener';a.title="Appeler avec Allô";a.textContent='Appeler';w.append(a);td.append(w);}}}
  else td.textContent=v;
}
function renderRows(){
  markSort();
  const cs=vis(),list=sorted(data.filter(match));
  $('count').textContent=String(list.length);
  const frag=document.createDocumentFragment();
  for(const r of list){const tr=document.createElement('tr');tr.dataset.key=r.email;for(const c of cs)cellFor(tr,c,r);frag.append(tr);}
  $('rows').replaceChildren(frag);
}
async function copyText(t){try{await navigator.clipboard.writeText(t);return true;}catch(_){const a=document.createElement('textarea');a.value=t;a.style.position='fixed';a.style.opacity='0';document.body.append(a);a.select();let ok=false;try{ok=document.execCommand('copy');}catch(_2){}a.remove();return ok;}}
function fillFilters(){const keep=(sel,items)=>{const v=sel.value;[...sel.options].slice(2).forEach((o)=>o.remove());items.forEach((n)=>sel.add(new Option(n,n)));sel.value=v;};keep($('f-closeur'),listes.closeurs);keep($('f-statut'),listes.statuts.map((x)=>x.nom));}
async function renderFiche(){
  const r=data.find((x)=>x.email===selected);if(!r)return;
  for(const k of ['personne','activite','email','telephone','financement','parcours','coaching','contact','sources','kyc','angle'])$('ff-'+k).textContent=r[k];
  $('ff-acc').textContent=r.accompagnement+(r.accompagnement_detail?' : '+r.accompagnement_detail:'');
  $('ff-fiche').textContent=r.qualite+' · '+r.fiche_type;
  for(const k of ['besoins','questions','pistes'])$('fl-'+k).replaceChildren(...r[k].split('\n').map((l)=>{const li=document.createElement('li');li.textContent=l.replace(/^(\d+\.|-)\s+/,'');return li;}));
  $('ff-crmia').hidden=!r.crmia_url;if(r.crmia_url){$('ff-crmia').href=r.crmia_url;$('ff-crmia').textContent=r.crmia==='Fiche entreprise'?'Ouvrir la fiche entreprise dans CRMIA':'Ouvrir dans CRMIA';}$('ff-telephone').textContent=r.telephone||'Non trouvé';$('ff-ard').dataset.v=r.ard_url;$('ff-bd').dataset.v=URL_BRAS_DROIT;
  const s=get(r.email);
  for(const k of ['closeur','statut','offre']){const e=$('ff-'+k);e.dataset.email=r.email;if(e!==document.activeElement)setSel(e,s[k]);}
  const m=$('ff-maj');m.textContent='';
  if(s.maj_le){let who='';if(user&&s.maj_par){const ps=await user.profiles([s.maj_par]);who=(ps[s.maj_par]&&ps[s.maj_par].name)||'';}if(selected===r.email)m.textContent='Modifié le '+new Date(s.maj_le).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})+(who?' par '+who:'');}
}
const chains=new Map();
function save(email,kind,v){
  const cur={...get(email)};const prev=cur[kind]||'';
  if(prev===v)return;
  const before={...cur};
  cur[kind]=v;cur.maj_le=new Date().toISOString();
  if(kind==='statut'){if(CLOSED.has(v)&&!CLOSED.has(prev))cur.close_le=cur.maj_le;else if(!CLOSED.has(v))delete cur.close_le;}
  suivi.set(email,cur);syncSelects(email);renderBoard();
  if(kind==='statut'&&CLOSED.has(v)&&!CLOSED.has(prev))celebrate(email);
  if(!db){toast("Enregistrement indisponible ici : le choix ne sera pas conservé.");return;}
  const run=async()=>{const uid=user?await user.id():null;const body={closeur:cur.closeur||'',statut:cur.statut||'',maj_le:cur.maj_le};if(cur.offre)body.offre=cur.offre;if(cur.close_le)body.close_le=cur.close_le;if(uid)body.maj_par=uid;await db.collection('suivi').doc(email).set(body);};
  chains.set(email,(chains.get(email)||Promise.resolve()).then(run).catch((e)=>{suivi.set(email,before);syncSelects(email);renderBoard();toast(e&&e.code==='invalid_argument'?"Votre accès ne permet pas de modifier : demandez le rôle Contributeur.":"Non enregistré : réessayez dans un instant.");}));
}
function syncSelects(email){
  document.querySelectorAll('select.pick[data-email="'+CSS.escape(email)+'"]').forEach((s)=>{if(s===document.activeElement){paint(s,s.value);return;}setSel(s,get(email)[s.dataset.kind]);});
  if(selected===email)renderFiche();
}
document.addEventListener('change',(e)=>{const t=e.target;if(t.matches&&t.matches('select.pick[data-email]')){paint(t,t.value);save(t.dataset.email,t.dataset.kind,t.value);}});
let justResized=false,dragKey=null;
const doSort=(t)=>{const k=t.dataset.sort;if(k===sortKey)sortDir=-sortDir;else{sortKey=k;sortDir=k==='date_formation'?-1:1;}renderRows();};
$('hr').addEventListener('click',(e)=>{const t=e.target.closest('th');if(!t||e.target.closest('.rs')||justResized)return;doSort(t);});
$('hr').addEventListener('keydown',(e)=>{const t=e.target.closest('th');if(t&&e.key==='Enter'){e.preventDefault();doSort(t);}});
$('hr').addEventListener('dragstart',(e)=>{const t=e.target.closest('th');if(!t||e.target.closest('.rs')){e.preventDefault();return;}dragKey=t.dataset.k;t.classList.add('dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragKey);}catch(_){}});
const clearDrop=()=>document.querySelectorAll('#hr th').forEach((t)=>t.classList.remove('drop-l','drop-r','dragging'));
$('hr').addEventListener('dragover',(e)=>{const t=e.target.closest('th');if(!t||!dragKey)return;e.preventDefault();const left=e.clientX<t.getBoundingClientRect().left+t.offsetWidth/2;document.querySelectorAll('#hr th').forEach((x)=>x.classList.remove('drop-l','drop-r'));if(t.dataset.k!==dragKey)t.classList.add(left?'drop-l':'drop-r');
  const w=document.querySelector('.wrap'),b=w.getBoundingClientRect();if(e.clientX>b.right-50)w.scrollLeft+=24;else if(e.clientX<b.left+50)w.scrollLeft-=24;});
$('hr').addEventListener('drop',(e)=>{const t=e.target.closest('th');if(!t||!dragKey)return;e.preventDefault();const to=t.dataset.k;if(to!==dragKey){const left=e.clientX<t.getBoundingClientRect().left+t.offsetWidth/2;const o=order.filter((k)=>k!==dragKey);o.splice(o.indexOf(to)+(left?0:1),0,dragKey);order=o;saveCols();renderHead();renderRows();}dragKey=null;clearDrop();});
$('hr').addEventListener('dragend',()=>{dragKey=null;clearDrop();});
$('hr').addEventListener('pointerdown',(e)=>{const h=e.target.closest('.rs');if(!h)return;e.preventDefault();e.stopPropagation();const th=h.parentElement,c=BYK[th.dataset.k],x0=e.clientX,w0=W(c);th.draggable=false;h.classList.add('on');document.body.classList.add('resizing');h.setPointerCapture(e.pointerId);
  const mv=(ev)=>{widths[c.k]=Math.max(60,Math.round(w0+ev.clientX-x0));sizeTable();};
  const up=()=>{h.removeEventListener('pointermove',mv);h.removeEventListener('pointerup',up);h.removeEventListener('pointercancel',up);th.draggable=true;h.classList.remove('on');document.body.classList.remove('resizing');saveCols();justResized=true;setTimeout(()=>{justResized=false;},60);};
  h.addEventListener('pointermove',mv);h.addEventListener('pointerup',up);h.addEventListener('pointercancel',up);});
$('hr').addEventListener('dblclick',(e)=>{const h=e.target.closest('.rs');if(!h)return;delete widths[h.parentElement.dataset.k];sizeTable();saveCols();});
$('resetcols').addEventListener('click',()=>{order=COLS.map((c)=>c.k);widths={};saveCols();renderHead();renderRows();});
for(const id of ['ff-ard','ff-bd'])$(id).addEventListener('click',(e)=>{copyText(e.currentTarget.dataset.v).then((ok)=>toast(ok?'Lien copié':'Copie impossible : réessayez.'));});
let cellText='';
$('rows').addEventListener('click',(e)=>{
  if(e.target.closest('select,a'))return;
  const tr=e.target.closest('tr[data-key]');if(!tr)return;
  if(e.target.closest('button.name')){openF(tr.dataset.key);return;}
  const cpb=e.target.closest('button.cp');
  if(cpb){const b=cpb,v=b.dataset.v;copyText(v).then((ok)=>{if(ok){b.classList.add('done');toast(v.startsWith('http')?'Lien copié':v+' copié');setTimeout(()=>b.classList.remove('done'),1200);}else toast('Copie impossible : sélectionnez le texte.');});return;}
  const cell=e.target.closest('td');if(!cell)return;
  document.querySelectorAll('td.sel').forEach((x)=>x.classList.remove('sel'));cell.classList.add('sel');
  const r=data.find((x)=>x.email===tr.dataset.key);
  $('cb-col').textContent=vis()[cell.cellIndex].l+' · '+(r?r.personne:'');
  cellText=cell.textContent;$('cb-txt').textContent=cellText;$('cb-copy').hidden=false;
});
$('cb-copy').addEventListener('click',()=>{navigator.clipboard.writeText(cellText).then(()=>toast('Copié'),()=>toast('Copie impossible : sélectionnez le texte.'));});
$('nowrap').addEventListener('change',(e)=>$('table').classList.toggle('nowrap',e.target.checked));
$('hidelong').addEventListener('change',(e)=>{hideLong=e.target.checked;renderHead();renderRows();});
function openF(email){selected=email;$('fiche').hidden=false;renderFiche();}
const closeF=()=>{selected=null;$('fiche').hidden=true;};
$('close').addEventListener('click',closeF);
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&selected)closeF();});
document.querySelectorAll('[data-fin]').forEach((b)=>b.addEventListener('click',()=>{f.fin=b.dataset.fin;document.querySelectorAll('[data-fin]').forEach((x)=>x.setAttribute('aria-pressed',String(x===b)));renderRows();}));
const FK=['du','au','closeur','statut','type','coaching','acc','qualite'];
for(const k of FK)$('f-'+k).addEventListener('change',(e)=>{if(e.target.value&&!e.target.validity.valid)return;f[k]=e.target.value;renderRows();});
let timer;$('f-q').addEventListener('input',(e)=>{clearTimeout(timer);timer=setTimeout(()=>{f.q=e.target.value;renderRows();},180);});
$('reset').addEventListener('click',()=>{for(const k in f)f[k]='';$('f-q').value='';for(const k of FK)$('f-'+k).value='';sortKey='date_formation';sortDir=-1;document.querySelectorAll('[data-fin]').forEach((x)=>x.setAttribute('aria-pressed',String(x.dataset.fin==='')));renderRows();});
$('tech-copy').addEventListener('click',()=>{copyText($('tech-prompt').textContent).then((ok)=>toast(ok?'Prompt copié':'Copie impossible : sélectionnez le texte.'));});
try{if(localStorage.getItem('upsell-tech')==='0')$('tech').open=false;}catch(_){}
$('tech').addEventListener('toggle',(e)=>{try{localStorage.setItem('upsell-tech',e.target.open?'1':'0');}catch(_){}});
/* Onglets */
function go(v){view=v;$('v-tableau').hidden=v!=='tableau';$('v-classement').hidden=v!=='classement';$('t-tableau').setAttribute('aria-selected',String(v==='tableau'));$('t-classement').setAttribute('aria-selected',String(v==='classement'));if(v==='classement')renderBoard();try{history.replaceState(null,'',v==='classement'?'#classement':'#tableau');}catch(_){}}
$('t-tableau').addEventListener('click',()=>go('tableau'));$('t-classement').addEventListener('click',()=>go('classement'));
window.addEventListener('hashchange',()=>go(location.hash==='#classement'?'classement':'tableau'));
/* Classement */
const initials=(n)=>n.split(/\s+/).map((x)=>x[0]).slice(0,2).join('').toUpperCase();
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
function level(p){let i=0;LEVELS.forEach((l,j)=>{if(p>=l[0])i=j;});const nx=LEVELS[i+1];return{nom:LEVELS[i][1],pct:nx?Math.round((p-LEVELS[i][0])/(nx[0]-LEVELS[i][0])*100):100,next:nx?nx[1]:null,reste:nx?nx[0]-p:0};}
function stats(){
  const min=period?Date.now()-period*864e5:0,m=new Map();
  for(const r of data){
    const s=get(r.email);if(!s.closeur)continue;
    const c=m.get(s.closeur)||{nom:s.closeur,points:0,closes:0,avance:0,traites:0,lost:0,porte:0};m.set(s.closeur,c);c.porte++;
    if(!s.statut||s.statut==='Pas appelé'||(s.maj_le&&Date.parse(s.maj_le)<min))continue;
    c.traites++;c.points+=POINTS[s.statut]||0;
    if(CLOSED.has(s.statut))c.closes++;if(POINTS[s.statut])c.avance++;if(s.statut==='LOST')c.lost++;
  }
  return [...m.values()].sort((a,b)=>b.points-a.points||b.closes-a.closes||coll.compare(a.nom,b.nom));
}
const CROWN='<svg class="crown" viewBox="0 0 30 22"><path d="M2 20 L1 6 L9 12 L15 1 L21 12 L29 6 L28 20Z" fill="#f59e0b"/><circle cx="1.5" cy="5" r="1.5" fill="#f59e0b"/><circle cx="15" cy="1.5" r="1.5" fill="#f59e0b"/><circle cx="28.5" cy="5" r="1.5" fill="#f59e0b"/></svg>';
function renderBoard(){
  if(view!=='classement'||!data.length)return;
  const st=stats(),tot=st.reduce((a,c)=>a+c.points,0),cl=[...suivi.values()].filter((s)=>CLOSED.has(s.statut)).length;
  $('g-c').textContent=String(cl);$('g-t').textContent=String(data.length);$('g-b').style.width=Math.min(100,cl/data.length*100).toFixed(1)+'%';$('g-p').textContent=String(tot);$('g-a').textContent=String(st.length);
  const pod=$('podium');pod.replaceChildren();
  const order=[1,0,2];
  order.forEach((i)=>{const c=st[i];const p=el('div','pod p'+(i+1));p.append(el('span','medal',(i+1)+(i?'e':'er')));
    if(c){if(i===0)p.insertAdjacentHTML('beforeend',CROWN);p.append(el('div','ava',initials(c.nom)),el('h3','',c.nom));const pt=el('div','pts',String(c.points));pt.append(el('small','','pts'));p.append(pt,el('div','sub',c.closes+' closé'+(c.closes>1?'s':'')+' · '+level(c.points).nom));}
    else{p.append(el('div','ava','?'));p.append(el('h3','','Place à prendre'));p.append(el('div','sub','Premier arrivé, premier servi'));}
    pod.append(p);});
  const rk=$('rk');
  if(!st.length){const e=el('div','empty');e.append(el('b','','Personne en chasse pour le moment'));e.append(document.createTextNode('Attribuez un closeur et un statut dans le tableau : le classement démarre tout seul.'));rk.replaceChildren(e);}
  else{
    const t=el('table','rk');const th=el('thead');const hr=el('tr');['#','Closeur','Points','Closés','Conversion','Portefeuille','Badges'].forEach((x)=>hr.append(el('th','',x)));th.append(hr);t.append(th);const tb=el('tbody');
    st.forEach((c,i)=>{const tr=el('tr');const was=prevRank.get(c.nom);const key=c.points+'/'+c.closes;
      const n=el('td','n',String(i+1));if(was&&was.rank!==i+1){const up=was.rank>i+1;n.append(el('span','delta '+(up?'up':'down'),up?'▲':'▼'));}tr.append(n);
      const w=el('td');const who=el('div','who');who.append(el('span','mini',initials(c.nom)));const lv=level(c.points);const box=el('div');box.append(el('b','',c.nom),el('span','sub',lv.nom+(lv.next?' · plus que '+lv.reste+' pts pour '+lv.next:'')));const bar=el('div','lvl');const bi=el('i');bi.style.width=lv.pct+'%';bar.append(bi);box.append(bar);who.append(box);w.append(who);tr.append(w);
      tr.append(el('td','big',String(c.points)),el('td','',String(c.closes)),el('td','',c.traites?Math.round(c.closes/c.traites*100)+' %':'–'),el('td','',String(c.porte)));
      const bd=el('td');const bs=el('div','badges');BADGES.filter((b)=>b[1](c)).forEach((b)=>bs.append(el('span','tag t-'+b[2],b[0])));bd.append(bs);tr.append(bd);
      if(was&&was.key!==key)tr.classList.add('pulse');
      tb.append(tr);});
    t.append(tb);rk.replaceChildren(t);
    prevRank=new Map(st.map((c,i)=>[c.nom,{rank:i+1,key:c.points+'/'+c.closes}]));
  }
  const wins=data.map((r)=>({r,s:get(r.email)})).filter((x)=>CLOSED.has(x.s.statut)&&x.s.closeur).sort((a,b)=>coll.compare(b.s.close_le||b.s.maj_le||'',a.s.close_le||a.s.maj_le||'')).slice(0,8);
  const fd=$('feed');
  if(!wins.length){const e=el('div','empty');e.append(el('b','','Aucun close pour l\'instant'));e.append(document.createTextNode('Le premier prend le badge Premier sang.'));fd.replaceChildren(e);}
  else fd.replaceChildren(...wins.map((w)=>{const d=el('div');d.append(el('b','',w.s.closeur),document.createTextNode(' a closé '),el('b','',w.r.personne));const dt=w.s.close_le||w.s.maj_le;if(dt)d.append(el('time','',new Date(dt).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})));return d;}));
}
function renderRules(){
  const r=$('rules');const a=el('div');a.append(el('h4','','Barème'));Object.entries({'RDV pris':10,'Motivé à closer':30,'Inscription en cours':50,'Inscription validée ou payé':100}).forEach(([k,v])=>{const l=el('div','rl');l.append(el('span','',k),el('b','','+'+v));a.append(l);});
  const b=el('div');b.append(el('h4','','Niveaux'));LEVELS.forEach((x)=>{const l=el('div','rl');l.append(el('span','',x[1]),el('b','',x[0]+' pts'));b.append(l);});
  const c=el('div');c.append(el('h4','','Badges'));const bs=el('div','badges');[['Premier sang : 1 close','green'],['Hat-trick : 3 closes','amber'],['Dix-de-der : 10 closes','pink'],['Machine à RDV : 10 dossiers avancés','blue'],['Sniper : 30 % de conversion','violet']].forEach((x)=>bs.append(el('span','tag t-'+x[1],x[0])));c.append(bs);
  r.replaceChildren(a,b,c);
}
renderRules();
period=0;document.querySelectorAll('[data-per]').forEach((b)=>b.addEventListener('click',()=>{period=+b.dataset.per;document.querySelectorAll('[data-per]').forEach((x)=>x.setAttribute('aria-pressed',String(x===b)));renderBoard();}));
/* Célébration : uniquement sur l'écran de la personne qui vient de closer */
function celebrate(email){
  const r=data.find((x)=>x.email===email);
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reduce)confetti();
  const b=$('bravo'),t=$('tiger');
  $('bravo-t').textContent=(r?r.personne+' est closé':'Close')+' · +'+(POINTS[get(email).statut]||100)+' points';
  b.hidden=false;t.hidden=false;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{b.classList.add('in');t.classList.add('in');}));
  clearTimeout(celebrate.t);
  celebrate.t=setTimeout(()=>{b.classList.remove('in');t.classList.remove('in');setTimeout(()=>{b.hidden=true;t.hidden=true;},750);},4800);
}
function confetti(){
  const c=$('fx');c.hidden=false;const W=c.width=innerWidth,H=c.height=innerHeight,x=c.getContext('2d');
  const colors=['#4f46e5','#818cf8','#e11d48','#f59e0b','#10b981','#ffffff','#fb923c'];
  const P=[];for(let i=0;i<220;i++){const left=i%2===0;P.push({x:left?-10:W+10,y:H*.72,vx:(left?1:-1)*(4+Math.random()*13),vy:-(9+Math.random()*15),s:5+Math.random()*7,r:Math.random()*6,vr:(Math.random()-.5)*.35,c:colors[i%colors.length]});}
  const t0=performance.now();
  (function tick(now){const e=now-t0;x.clearRect(0,0,W,H);for(const p of P){p.vy+=.32;p.vx*=.992;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;x.save();x.translate(p.x,p.y);x.rotate(p.r);x.globalAlpha=Math.max(0,1-e/3400);x.fillStyle=p.c;x.fillRect(-p.s/2,-p.s/4,p.s,p.s/2);x.restore();}if(e<3400)requestAnimationFrame(tick);else{x.clearRect(0,0,W,H);c.hidden=true;}})(t0);
}
/* Données */
function info(t){const e=$('etat');e.textContent=t;e.hidden=!t;}
info('Chargement des personnes…');
window.__chargerPersonnes().then((d)=>{data=d;defs.clear();d.forEach((r)=>{if(r.closeur_defaut)defs.set(r.email,r.closeur_defaut);});const ds=d.flatMap((r)=>r.dates).sort();for(const k of ['du','au']){$('f-'+k).min=ds[0];$('f-'+k).max=ds[ds.length-1];}if($('etat').textContent==='Chargement des personnes…')info('');renderRows();renderBoard();}).catch(()=>info("La liste n'a pas pu être chargée. Rechargez la page."));
renderHead();
if(location.hash==='#classement')go('classement');
(async()=>{
  if(!window.claude||!window.claude.use){return;}
  [db,user]=await Promise.all([window.claude.use('db'),window.claude.use('user')]);
  if(user){const c=await user.can('data.write');if(c===false)canWrite=false;}
  if(!db){canWrite=false;info("Enregistrement indisponible : connectez-vous pour voir et modifier les closeurs et statuts.");document.querySelectorAll('select.pick').forEach((s)=>{s.disabled=true;});return;}
  if(!canWrite)info("Vous pouvez consulter, mais pas modifier : demandez le rôle Contributeur sur cette page.");
  db.doc('reglages/listes').onSnapshot((snap)=>{const v=snap.exists?snap.data():{};listes={closeurs:Array.isArray(v.closeurs)?v.closeurs:[],statuts:Array.isArray(v.statuts)?v.statuts:[]};fillFilters();if(window.__moi&&!window.__moi.admin&&!window.__vueFaite&&listes.closeurs.includes(window.__moi.nom)){window.__vueFaite=true;f.closeur=window.__moi.nom;$('f-closeur').value=f.closeur;renderRows();}document.querySelectorAll('select.pick').forEach((s)=>{if(s!==document.activeElement){s.dataset.full='';paint(s,s.value);}});},()=>info("Les listes de closeurs et de statuts n'ont pas pu être chargées."));
  db.collection('suivi').onSnapshot((snap)=>{snap.docChanges().forEach((c)=>{if(c.type==='removed')suivi.delete(c.doc.id);else suivi.set(c.doc.id,c.doc.data());syncSelects(c.doc.id);});renderBoard();},()=>info("Le suivi partagé n'a pas pu être chargé : rechargez la page."));
})();
})();
