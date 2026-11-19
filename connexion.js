import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, onSnapshot, writeBatch } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const base = getFirestore(app);
const $ = (id) => document.getElementById(id);
const PATRON = 'tanguy.denonain@franceia.com';
let demarre = false;

const enBase64 = async (texte) => {
  const flux = new Blob([texte]).stream().pipeThrough(new CompressionStream('gzip'));
  const o = new Uint8Array(await new Response(flux).arrayBuffer());
  let s = ''; for (let i = 0; i < o.length; i += 32768) s += String.fromCharCode(...o.subarray(i, i + 32768));
  return btoa(s);
};
const deBase64 = async (b) => {
  const o = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  return new Response(new Blob([o]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
};

async function lirePersonnes() {
  const m = await getDoc(doc(base, 'donnees', 'meta'));
  if (!m.exists()) throw new Error('vide');
  const n = m.data().morceaux; let b = '';
  const parts = await Promise.all(Array.from({ length: n }, (_, i) => getDoc(doc(base, 'donnees', 'p' + i))));
  for (const p of parts) b += p.data().b;
  return JSON.parse(await deBase64(b));
}

/* Suivi automatique : relu dans CRMIA et DELIV'IA (lecture seule) à 12 h et 19 h, puis rangé dans donnees/suivi_auto.
   DEPUIS = lancement du challenge. Les personnes du tableau sont déjà clientes : une opportunité CRMIA créée avant
   cette date est leur vente d'origine (pas un upsell) et ne compte pas, même si la requête la renvoie. */
const DEPUIS = '2026-11-19';
/* Nom CRMIA → nom du tableau, quand ils diffèrent. */
const ALIAS = { Nizar: 'Nizar Alrobiai' };
const ETAPES = { rdv_pris: 'RDV pris', no_show: 'No show', nurturing: 'Nurturing', motive: 'Motivé', inscription_en_cours: 'Inscription en cours', inscription_validee: 'Inscription validée', paye: 'Payé', lost: 'Perdu', retracte: 'Rétracté' };
const COACHING = { nouvelle_demande: 'nouvelle demande', valider_formateur: 'formateur à valider', creer_groupe_whatsapp: 'groupe WhatsApp à créer', preparer: 'en préparation', lost: 'perdu' };
const jm = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '');
const euros = (n) => Number(n).toLocaleString('fr-FR') + '\u00a0€';
function texteDelivia(x) {
  if (x.k === 'coaching') return `Coaching ${x.det} demandé le ${jm(x.d)} (${COACHING[x.s] || x.s.replace(/_/g, ' ')})`;
  if (x.k === 'accomp') return `${x.det.replace(/(\d+)\.00 €/, '$1 €')}, ${x.s === 'actif' ? 'actif' : x.s.replace(/_/g, ' ')} depuis le ${jm(x.d)}`;
  if (x.k === 'n2') return `Inscription N2 le ${jm(x.d)} (${x.s.replace(/_/g, ' ')})`;
  const [interet, montant] = x.det.split(' ').reduce((a, w) => (/^\d/.test(w) ? [a[0], w] : [w, a[1]]), ['', '']);
  const issue = x.s === 'signe' ? 'signé' + (montant ? ', ' + euros(parseFloat(montant)) + ' HT' : '') : x.s === 'pas_interesse' ? 'pas intéressé' : 'en cours';
  return `Upsell signalé par le formateur le ${jm(x.d)}${interet ? ' (intérêt ' + (interet === 'n2' ? 'N2' : interet) + ')' : ''} : ${issue}`;
}
function appliquerSuivi(personnes, s) {
  for (const r of personnes) {
    const c = (s.crm[r.email] || []).filter((o) => (o.dc || '') >= DEPUIS);
    if (c.length) {
      const der = c.slice().sort((a, b) => (b.dm || '').localeCompare(a.dm || ''))[0];
      r.crm_opps = c;
      r.crm_statut = ETAPES[der.s] || der.s;
      r.crm_detail = r.crm_statut + (der.cl ? ' · ' + der.cl : '') + (der.v ? ' · ' + euros(der.v) : '') + ' · modifiée le ' + jm(der.dm) + (c.length > 1 ? ` · ${c.length} opportunités depuis le ${jm(DEPUIS)}` : '');
    }
    const d = s.dv[r.email];
    if (d && d.length) {
      r.nouveau_delivia = d.map(texteDelivia).join('\n');
      if (d.some((x) => x.k === 'coaching' && x.s !== 'lost') && !['Réalisé', 'Vendu, en cours', 'Vendu'].includes(r.coaching)) r.coaching = 'Vendu, en cours';
      const acc = d.find((x) => x.k === 'accomp' && x.s !== 'termine' && x.s !== 'annule');
      if (acc) { r.accompagnement = 'Oui'; r.accompagnement_detail = texteDelivia(acc); }
    }
  }
  return personnes;
}
async function lireSuivi() {
  try { const s = await getDoc(doc(base, 'donnees', 'suivi_auto')); return s.exists() ? { ...JSON.parse(s.data().j), maj_le: s.data().maj_le } : null; } catch (_) { return null; }
}
async function chargerPersonnes() {
  const [p, s] = await Promise.all([lirePersonnes(), lireSuivi()]);
  window.__suiviAuto = s ? { maj_le: s.maj_le } : null;
  return s ? appliquerSuivi(p, s) : p;
}
const lignes = (bloc, nb) => {
  const l = bloc && bloc.x ? String(bloc.x).split('\n').filter((x) => x.trim()) : [];
  if (bloc && Number(bloc.n) !== l.length) throw new Error(`lignes reçues ${l.length}, attendues ${bloc.n}`);
  if (l.some((x) => x.split('|').length !== nb)) throw new Error('ligne mal formée');
  return l.map((x) => x.split('|'));
};
/* Appelé par la tâche planifiée, depuis la page ouverte par un admin. crm et deliv : { n, x } tels que rendus par les requêtes SQL. */
async function synchroniser({ crm, deliv }) {
  if (!window.__moi || !window.__moi.admin) throw new Error('réservé aux admins');
  const lc = lignes(crm, 10), ld = lignes(deliv, 5);
  const personnes = await lirePersonnes();
  const parEmail = new Map(), parId = new Map(), parTel = new Map();
  for (const r of personnes) {
    parEmail.set(r.email.toLowerCase(), r);
    const m = /contact=([0-9a-f-]{36})/.exec(r.crmia_url || ''); if (m) parId.set(m[1], r);
    const t = String(r.telephone || '').replace(/\D/g, ''); if (t.length >= 9 && !parTel.has(t.slice(-9))) parTel.set(t.slice(-9), r);
  }
  const s = { depuis: DEPUIS, crm: {}, dv: {} };
  for (const [id, e, tel, ci, cl0, st, ty, v, dc, dm] of lc) {
    if (dc < DEPUIS) continue;
    const cl = ALIAS[cl0] || cl0;
    const r = parEmail.get(e) || parId.get(ci) || (tel.length >= 9 ? parTel.get(tel.slice(-9)) : null);
    if (!r) continue;
    (s.crm[r.email] = s.crm[r.email] || []).push({ id, s: st, cl, ty, v: v ? Number(v) : 0, dc, dm });
  }
  for (const [k, e, st, det, d] of ld) {
    const r = parEmail.get(e); if (!r) continue;
    (s.dv[r.email] = s.dv[r.email] || []).push({ k, s: st, det, d });
  }
  const avant = await lireSuivi();
  const nom = (e) => { const r = parEmail.get(e); return r ? r.personne + (r.activite ? ' (' + r.activite + ')' : '') : e; };
  const rapport = { lignes_crmia: lc.length, lignes_delivia: ld.length, personnes_crmia: Object.keys(s.crm).length, personnes_delivia: Object.keys(s.dv).length, premiere_fois: !avant, nouvelles_opportunites: [], changements_etape: [], nouveautes_delivia: [] };
  const ancien = new Map(); if (avant) for (const [e, os] of Object.entries(avant.crm)) for (const o of os) ancien.set(o.id, o);
  const vusDv = new Set(); if (avant) for (const [e, xs] of Object.entries(avant.dv)) for (const x of xs) vusDv.add([e, x.k, x.s, x.d].join('|'));
  for (const [e, os] of Object.entries(s.crm)) for (const o of os) {
    const a = ancien.get(o.id), ligne = `${nom(e)} : ${ETAPES[o.s] || o.s}${o.cl ? ' · ' + o.cl : ''}${o.v ? ' · ' + euros(o.v) : ''}`;
    if (!a) rapport.nouvelles_opportunites.push(ligne); else if (a.s !== o.s) rapport.changements_etape.push(`${ligne} (avant : ${ETAPES[a.s] || a.s})`);
  }
  for (const [e, xs] of Object.entries(s.dv)) for (const x of xs) if (!vusDv.has([e, x.k, x.s, x.d].join('|'))) rapport.nouveautes_delivia.push(`${nom(e)} : ${texteDelivia(x)}`);
  const maj = new Date().toISOString();
  await setDoc(doc(base, 'donnees', 'suivi_auto'), { j: JSON.stringify(s), maj_le: maj });
  const relu = await lireSuivi();
  rapport.ecrit = !!(relu && relu.maj_le === maj);
  return rapport;
}

/* Même contrat que la page d'origine : le code applicatif ne change pas. */
function installerContrat(moi, annuaire) {
  const adapte = (s) => ({ exists: s.exists(), data: () => s.data() });
  const dbf = {
    doc: (chemin) => {
      const [c, d] = chemin.split('/');
      return { onSnapshot: (fn, err) => onSnapshot(doc(base, c, d), (s) => fn(adapte(s)), err) };
    },
    collection: (c) => ({
      doc: (id) => ({ set: (corps) => setDoc(doc(base, c, id), corps) }),
      onSnapshot: (fn, err) => onSnapshot(collection(base, c), (s) => fn({
        docChanges: () => s.docChanges().map((x) => ({ type: x.type, doc: { id: x.doc.id, data: () => x.doc.data() } })),
      }), err),
    }),
  };
  const userf = {
    can: async () => true,
    id: async () => moi.email,
    profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: (annuaire[i] && annuaire[i].nom) || i }])),
  };
  window.__moi = moi;
  window.__chargerPersonnes = chargerPersonnes;
  if (moi.admin) window.__synchroniser = synchroniser;
  window.claude = { use: async (n) => (n === 'db' ? dbf : n === 'user' ? userf : null) };
}

async function installerDonnees(fichier) {
  const paquet = JSON.parse(await fichier.text());
  const b = await enBase64(JSON.stringify(paquet.personnes));
  const T = 900000, n = Math.ceil(b.length / T);
  $('pimp').textContent = 'Installation…';
  for (let i = 0; i < n; i++) await setDoc(doc(base, 'donnees', 'p' + i), { b: b.slice(i * T, (i + 1) * T) });
  await setDoc(doc(base, 'donnees', 'meta'), { morceaux: n, nb: paquet.personnes.length, maj_le: new Date().toISOString() });
  const lot = writeBatch(base);
  for (const [e, v] of Object.entries(paquet.acces)) lot.set(doc(base, 'acces', e), v);
  lot.set(doc(base, 'reglages', 'listes'), paquet.listes);
  lot.set(doc(base, 'reglages', 'technique'), { html: paquet.technique });
  for (const [e, v] of Object.entries(paquet.suivi || {})) lot.set(doc(base, 'suivi', e), v);
  await lot.commit();
  location.reload();
}

/* Mise à jour par un admin : remplace la liste des personnes, la technique, les listes et les accès fournis, sans toucher aux statuts ni aux offres. */
async function majDonnees(fichier) {
  const paquet = JSON.parse(await fichier.text());
  if (!Array.isArray(paquet.personnes) || !paquet.personnes.length) throw new Error('fichier invalide');
  const b = await enBase64(JSON.stringify(paquet.personnes));
  const T = 900000, n = Math.ceil(b.length / T);
  for (let i = 0; i < n; i++) await setDoc(doc(base, 'donnees', 'p' + i), { b: b.slice(i * T, (i + 1) * T) });
  await setDoc(doc(base, 'donnees', 'meta'), { morceaux: n, nb: paquet.personnes.length, maj_le: new Date().toISOString() });
  if (paquet.technique) await setDoc(doc(base, 'reglages', 'technique'), { html: paquet.technique });
  const lot = writeBatch(base);
  if (paquet.listes) lot.set(doc(base, 'reglages', 'listes'), paquet.listes);
  for (const [e, v] of Object.entries(paquet.acces || {})) lot.set(doc(base, 'acces', e), v);
  /* Seul le closeur change : les statuts et offres déjà saisis restent. */
  for (const [e, nom] of Object.entries(paquet.suivi_closeurs || {})) lot.set(doc(base, 'suivi', e), { closeur: nom }, { merge: true });
  await lot.commit();
  location.reload();
}
$('pgo').addEventListener('click', async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { $('pmsg').textContent = `Connexion impossible (${(e && e.code) || 'erreur inconnue'}) : réessayez, ou autorisez les fenêtres pop-up.`; }
});
$('pout').addEventListener('click', () => signOut(auth));
$('pfic').addEventListener('change', (e) => {
  installerDonnees(e.target.files[0]).catch(() => { $('pimp').textContent = "L'installation a échoué : vérifiez le fichier et réessayez."; });
});

onAuthStateChanged(auth, async (u) => {
  if (!u) { $('pgo').hidden = false; $('pout').hidden = true; $('pmsg').textContent = 'Connectez-vous avec votre compte Google professionnel.'; return; }
  $('pgo').hidden = true; $('pout').hidden = false;
  const email = (u.email || '').toLowerCase();
  let acces = null, erreur = '';
  try { await u.getIdToken(true); const s = await getDoc(doc(base, 'acces', email)); acces = s.exists() ? s.data() : null; } catch (e) { acces = null; erreur = (e && e.code) || 'inconnue'; }
  let installe = false;
  if (acces) { try { installe = (await getDoc(doc(base, 'donnees', 'meta'))).exists(); } catch (_) {} }
  if (!installe && email === PATRON) { $('pmsg').textContent = 'Base vide.'; $('padmin').hidden = false; return; }
  if (!acces) {
    const raison = erreur ? ` Refus de la base (${erreur}), adresse validée par Google : ${u.emailVerified ? 'oui' : 'non'}.` : '';
    $('pmsg').textContent = `Le compte ${email} n'a pas accès au Challenge Upsell.${raison} Rechargez la page pour réessayer.`;
    return;
  }
  if (demarre) return; demarre = true;
  try {
  const annuaire = Object.fromEntries((await getDocs(collection(base, 'acces'))).docs.map((d) => [d.id, d.data()]));
  installerContrat({ email, nom: acces.nom, admin: acces.role === 'admin' }, annuaire);
  if (acces.role === 'admin') {
    $('majwrap').hidden = false;
    $('pmaj').addEventListener('change', (e) => {
      majDonnees(e.target.files[0]).catch(() => { $('majwrap').firstChild.textContent = 'Mise à jour échouée, réessayez'; });
    });
  }
  const tech = await getDoc(doc(base, 'reglages', 'technique'));
  document.getElementById('tech').innerHTML = tech.exists() ? tech.data().html : '';
  const s = document.createElement('script'); s.src = 'app.js?v=10'; s.charset = 'utf-8'; document.body.append(s);
  $('porte').remove();
  } catch (e) {
    demarre = false;
    $('pmsg').textContent = `Le chargement a échoué pour ${email} (${(e && e.code) || (e && e.message) || 'erreur inconnue'}). Rechargez la page pour réessayer.`;
  }
});
