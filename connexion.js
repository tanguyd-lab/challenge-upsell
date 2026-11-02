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

async function chargerPersonnes() {
  const m = await getDoc(doc(base, 'donnees', 'meta'));
  if (!m.exists()) throw new Error('vide');
  const n = m.data().morceaux; let b = '';
  const parts = await Promise.all(Array.from({ length: n }, (_, i) => getDoc(doc(base, 'donnees', 'p' + i))));
  for (const p of parts) b += p.data().b;
  return JSON.parse(await deBase64(b));
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
  const tech = await getDoc(doc(base, 'reglages', 'technique'));
  document.getElementById('tech').innerHTML = tech.exists() ? tech.data().html : '';
  const s = document.createElement('script'); s.src = 'app.js'; s.charset = 'utf-8'; document.body.append(s);
  $('porte').remove();
  } catch (e) {
    demarre = false;
    $('pmsg').textContent = `Le chargement a échoué pour ${email} (${(e && e.code) || (e && e.message) || 'erreur inconnue'}). Rechargez la page pour réessayer.`;
  }
});
