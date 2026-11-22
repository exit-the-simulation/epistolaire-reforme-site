"use strict";
/* Épistolaire de la Réforme — navigateur.
   Données : window.DONNEES (data.js, produit par scripts/construire_site.py).
   Lettre : [date, exp[], dest[], lieuExp, lieuDest, source, url, incertaine, ref, doute, precision, corrigee]
   precision : 0 jour exact, 1 mois, 2 année, 3 date estimée ou restituée. */
const D = window.DONNEES;
const P = D.personnes, L = D.lettres;
const A0 = 1480, A1 = 1600, NA = A1 - A0 + 1;
const DEPOT = "https://github.com/exit-the-simulation/epistolaire-reforme";
const COULEURS = {
  "wittenberg":"#b5452c","sud-allemand":"#d08a3c","zurich":"#2f6f9f","bale":"#4f9a8f","berne":"#7a8f3a",
  "geneve":"#6b4c9a","strasbourg":"#c2577f","constance":"#3f8f5a","saint-gall":"#8a6d3b","refuge":"#5b7fbf",
  "angleterre":"#9c3f5f","humaniste":"#c9a227","autre":"#9a948a"
};
const NOMS_GROUPES = {"wittenberg":"Wittenberg","sud-allemand":"Allemagne du Sud","zurich":"Zurich","bale":"Bâle","berne":"Berne",
  "geneve":"Genève et Suisse romande","strasbourg":"Strasbourg","constance":"Constance","saint-gall":"Saint-Gall","refuge":"Réfugiés italiens et polonais",
  "angleterre":"Angleterre","humaniste":"Humanistes","autre":"Autres"};
const PALETTE_COMM = ["#b5452c","#2f6f9f","#6b4c9a","#3f8f5a","#d08a3c","#c2577f","#4f9a8f","#8a6d3b","#5b7fbf","#9c3f5f","#7a8f3a","#c9a227"];
const THEMES = {"politique":"Politique","théologique":"Théologique","personnel":"Personnel / biographique"};
const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const PREC = ["date exacte","au mois près","à l'année près","date estimée ou restituée"];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const annee = d => +String(d).slice(0, 4);
const sansAccent = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const nf = n => n.toLocaleString("fr");
const stocke = {
  lire(k, def){ try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch(e){ return def; } },
  ecrire(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("vu"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("vu"), 2200); }
function copier(txt, msg){
  const ok = () => toast(msg || "Copié");
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(ok, () => repli());
  else repli();
  function repli(){ const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch(e){ prompt("Copiez :", txt); } ta.remove(); }
}
function telecharger(nom, contenu, type){
  const b = new Blob([contenu], {type: type || "text/csv;charset=utf-8"}), a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = nom; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCase = v => { v = String(v ?? ""); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const versCSV = (entete, lignes) => "﻿" + [entete, ...lignes].map(r => r.map(csvCase).join(",")).join("\n");

// ---------------------------------------------------------------- Thème
(function(){
  const t = stocke.lire("theme", null);
  if (t) document.documentElement.dataset.theme = t;
  $("#theme").onclick = () => {
    const sombre = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const n = sombre ? "light" : "dark";
    document.documentElement.dataset.theme = n; stocke.ecrire("theme", n);
    toutRedessiner();
  };
})();

// ---------------------------------------------------------------- Index des données
const cleP = i => P[i].ref || P[i].n;                      // clé stable d'une personne (lien, export)
const parCle = new Map(P.map((p, i) => [p.ref || p.n, i]));
const liens = new Map();                                    // "a|b" -> {a, b, lettres:[idx]}
const parPersonne = P.map(() => []);
const parLieu = new Map();
const cleLien = (a, b) => a < b ? a + "|" + b : b + "|" + a;
L.forEach((l, i) => {
  new Set([...l[1], ...l[2]]).forEach(p => parPersonne[p].push(i));
  for (const a of l[1]) for (const b of l[2]) {
    if (a === b) continue;
    const k = cleLien(a, b);
    if (!liens.has(k)) liens.set(k, {a: Math.min(a, b), b: Math.max(a, b), lettres: []});
    liens.get(k).lettres.push(i);
  }
  for (const q of [l[3], l[4]]) if (D.geo[q]) { if (!parLieu.has(q)) parLieu.set(q, []); parLieu.get(q).push(i); }
});
const total = parPersonne.map(x => x.length);
const titreSource = k => String(D.sources[k].titre || D.sources[k].id).replace(/\s+—\s+extraction du projet$/, "");
const estExtraction = k => String(D.sources[k].id || "").startsWith("extrait-");
D.evenements.forEach(e => { e.theme = e.theme || "théologique"; e.p = e.p || []; });

// ---------------------------------------------------------------- État (et lien partageable)
const etat = {
  debut: A0, fin: A1, min: 5, seulCles: false, noms: true, fiab: "toutes", couleurs: "poles",
  groupes: new Set(Object.keys(COULEURS)), themes: new Set(Object.keys(THEMES)), communautes: null,
  sel: null,          // {type:"p", id} | {type:"l", k} | {type:"chemin", noeuds:[], liens:[]} | {type:"s", id}
  ego: 0,             // réseau personnel : 0 non, 1 correspondants, 2 + leurs correspondants
  panneau: null,      // null | "sources" | "cmp" | "doublons" | "corrections" | "limites" | {evt:k} | {lieu:q}
  vue: "graphe", cmp: [], tri: {col: "date", sens: 1}, texte: "", lieu: null
};
function garder(i){
  const l = L[i], a = annee(l[0]);
  if (a < etat.debut || a > etat.fin) return false;
  if (etat.fiab === "datees" && l[10] === 3) return false;
  if (etat.fiab === "sures" && (l[10] === 3 || l[9])) return false;
  return true;
}
function versAdresse(){
  const q = new URLSearchParams();
  if (etat.debut !== A0) q.set("de", etat.debut);
  if (etat.fin !== A1) q.set("a", etat.fin);
  if (etat.min !== 5) q.set("min", etat.min);
  if (etat.seulCles) q.set("cles", 1);
  if (etat.fiab !== "toutes") q.set("fiab", etat.fiab);
  if (etat.couleurs !== "poles") q.set("couleurs", etat.couleurs);
  if (etat.vue !== "graphe") q.set("vue", etat.vue);
  if (etat.ego) q.set("ego", etat.ego);
  const gs = Object.keys(COULEURS).filter(g => !etat.groupes.has(g)); if (gs.length) q.set("sans", gs.join(","));
  if (etat.sel && etat.sel.type === "p") q.set("p", cleP(etat.sel.id));
  if (etat.sel && etat.sel.type === "l") { const e = liens.get(etat.sel.k); q.set("l", cleP(e.a) + "~" + cleP(e.b)); }
  if (etat.sel && etat.sel.type === "chemin") q.set("chemin", cleP(etat.sel.noeuds[0]) + "~" + cleP(etat.sel.noeuds.at(-1)));
  if (etat.sel && etat.sel.type === "s") q.set("source", D.sources[etat.sel.id].id);
  if (etat.cmp.length) q.set("cmp", etat.cmp.map(cleP).join("~"));
  if (etat.panneau === "cmp") q.set("panneau", "cmp");
  if (etat.texte) q.set("q", etat.texte);
  const h = q.toString();
  versAdresse.dernier = h ? "#" + h : "";
  history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
}
function depuisAdresse(){
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.has("de")) etat.debut = Math.max(A0, +q.get("de"));
  if (q.has("a")) etat.fin = Math.min(A1, +q.get("a"));
  if (q.has("min")) etat.min = +q.get("min");
  if (q.has("cles")) etat.seulCles = true;
  if (q.has("fiab")) etat.fiab = q.get("fiab");
  if (q.has("couleurs")) etat.couleurs = q.get("couleurs");
  if (q.has("vue")) etat.vue = q.get("vue");
  if (q.has("ego")) etat.ego = +q.get("ego");
  if (q.has("sans")) q.get("sans").split(",").forEach(g => etat.groupes.delete(g));
  if (q.has("q")) etat.texte = q.get("q");
  const pid = k => parCle.has(k) ? parCle.get(k) : null;
  if (q.has("p") && pid(q.get("p")) !== null) etat.sel = {type: "p", id: pid(q.get("p"))};
  if (q.has("l")) { const [a, b] = q.get("l").split("~").map(pid); if (a !== null && b !== null && liens.has(cleLien(a, b))) etat.sel = {type: "l", k: cleLien(a, b)}; }
  if (q.has("source")) { const k = D.sources.findIndex(s => s.id === q.get("source")); if (k >= 0) etat.sel = {type: "s", id: k}; }
  if (q.has("cmp")) etat.cmp = q.get("cmp").split("~").map(pid).filter(x => x !== null).slice(0, 4);
  if (q.get("panneau") === "cmp" && etat.cmp.length) etat.panneau = "cmp";
  if (q.has("chemin")) { const [a, b] = q.get("chemin").split("~").map(pid); if (a !== null && b !== null) etat.cheminDemande = [a, b]; }
}
$("#b-lien").onclick = () => { versAdresse(); copier(location.href, "Lien de cette vue copié"); };

// ---------------------------------------------------------------- Graphe
const Graph = graphology.Graph || graphology;
const graphe = new Graph({type: "undirected"});
P.forEach((p, i) => {
  if (!total[i]) return;
  const ang = Math.random() * 2 * Math.PI, r = p.cle ? 10 : 30 + Math.random() * 30;
  graphe.addNode(String(i), {x: r * Math.cos(ang), y: r * Math.sin(ang), label: p.n, color: COULEURS[p.g] || COULEURS.autre, size: 2});
});
for (const [k, e] of liens) graphe.addEdge(String(e.a), String(e.b), {k, weight: Math.log(1 + e.lettres.length)});

const compte = new Map(), compteLien = new Map();
function recompter(){
  compte.clear(); compteLien.clear();
  for (const [k, e] of liens){ let n = 0; for (const i of e.lettres) if (garder(i)) n++; if (n) compteLien.set(k, n); }
  P.forEach((p, i) => { let n = 0; for (const j of parPersonne[i]) if (garder(j)) n++; if (n) compte.set(i, n); });
  etat.egoSet = null;
  if (etat.ego && etat.sel && etat.sel.type === "p"){
    const s = new Set([etat.sel.id]); let front = [etat.sel.id];
    for (let d = 0; d < etat.ego; d++){
      const nv = [];
      for (const x of front) if (graphe.hasNode(String(x))) for (const y of graphe.neighbors(String(x))) {
        const yy = +y; if (!s.has(yy) && compteLien.has(cleLien(x, yy))) { s.add(yy); nv.push(yy); }
      }
      front = nv;
    }
    etat.egoSet = s;
  }
}
function couleurDe(i){
  if (etat.couleurs === "communautes" && etat.communautes) return etat.communautes.couleur.get(i) || COULEURS.autre;
  return COULEURS[P[i].g] || COULEURS.autre;
}
function visible(i){
  const p = P[i], n = compte.get(i) || 0;
  if (!n) return false;
  if (etat.egoSet) return etat.egoSet.has(i) && (etat.ego === 1 || etat.egoSet.size < 400 || n >= etat.min || p.cle || i === etat.sel.id);
  if (etat.sel && etat.sel.type === "p" && etat.sel.id === i) return true;
  if (etat.sel && etat.sel.type === "chemin" && etat.sel.noeuds.includes(i)) return true;
  if (etat.sel && etat.sel.type === "l" && (liens.get(etat.sel.k).a === i || liens.get(etat.sel.k).b === i)) return true;
  if (etat.couleurs === "poles" && !etat.groupes.has(p.g)) return false;
  if (etat.couleurs === "communautes" && etat.communautes && etat.communautesMasquees && etat.communautesMasquees.has(etat.communautes.de.get(i))) return false;
  if (etat.seulCles) return !!p.cle;
  return p.cle || n >= etat.min;
}
function voisinsSel(){
  const s = etat.sel; if (!s) return null;
  if (s.type === "p") return new Set(graphe.hasNode(String(s.id)) ? graphe.neighbors(String(s.id)).map(Number).filter(j => compteLien.has(cleLien(s.id, j))) : []);
  if (s.type === "l") { const e = liens.get(s.k); return new Set([e.a, e.b]); }
  if (s.type === "chemin") return new Set(s.noeuds);
  return null;
}
let voisins = null;
const Ctor = Sigma.Sigma || Sigma.default || Sigma;
const rendu = new Ctor(graphe, $("#sigma"), {
  enableEdgeClickEvents: true, enableEdgeHoverEvents: true, labelFont: "Georgia, serif", labelSize: 12,
  labelRenderedSizeThreshold: 7, defaultEdgeColor: "#bbb", zIndex: true,
  nodeReducer: (n, a) => {
    const i = +n;
    if (!visible(i)) return {...a, hidden: true};
    const c = compte.get(i), r = {...a, color: couleurDe(i), size: 2 + Math.sqrt(c) * 1.1};
    if (P[i].cle){ r.forceLabel = etat.noms; r.zIndex = 2; }
    const s = etat.sel;
    if (s && s.type !== "s"){
      const enjeu = (s.type === "p" && s.id === i) || (s.type === "l" && voisins.has(i)) || (s.type === "chemin" && voisins.has(i));
      if (enjeu){ r.highlighted = true; r.forceLabel = true; r.zIndex = 3; }
      else if (s.type === "p" && voisins.has(i)) r.forceLabel = r.forceLabel || c >= 10 || !!etat.egoSet;
      else if (!etat.egoSet){ r.color = css("--line"); r.label = ""; r.forceLabel = false; r.zIndex = 0; r.size = Math.min(r.size, 3); }
    }
    return r;
  },
  edgeReducer: (e, a) => {
    const n = compteLien.get(a.k);
    const [s, t] = graphe.extremities(e);
    if (!n || !visible(+s) || !visible(+t)) return {...a, hidden: true};
    const r = {...a, size: 0.4 + Math.log(1 + n) * 0.9, color: css("--bar") || "#bbb"};
    const sel = etat.sel;
    if (sel && sel.type !== "s"){
      const lie = (sel.type === "p" && (sel.id === +s || sel.id === +t)) || (sel.type === "l" && sel.k === a.k) || (sel.type === "chemin" && sel.liens.includes(a.k));
      if (lie){ r.color = css("--accent"); r.zIndex = 2; if (sel.type === "chemin") r.size += 2; }
      else r.color = css("--line");
    }
    return r;
  }
});
// Disposition ForceAtlas2, par tranches pour ne pas figer la page
const FA2 = graphologyLibrary.layoutForceAtlas2;
const reglages = Object.assign(FA2.inferSettings(graphe), {barnesHutOptimize: graphe.order > 1500, gravity: 1.5, scalingRatio: 8, slowDown: 3, edgeWeightInfluence: 0.6});
let tour = 0; const TOURS = 30;
function etape(){
  FA2.assign(graphe, {iterations: 10, settings: reglages, getEdgeWeight: "weight"});
  $("#chargement").textContent = "Calcul de la disposition… " + Math.round(100 * ++tour / TOURS) + " %";
  if (tour < TOURS) setTimeout(etape, 0);
  else { $("#chargement").style.display = "none"; if (etat.sel && etat.sel.type === "p") centrer(etat.sel.id); }
}

// Communautés (Louvain, sur l'ensemble du réseau)
function calculerCommunautes(){
  if (etat.communautes) return;
  const louvain = graphologyLibrary.communitiesLouvain;
  const part = louvain(graphe, {getEdgeWeight: "weight"});
  const membres = new Map();
  for (const [n, c] of Object.entries(part)) { if (!membres.has(c)) membres.set(c, []); membres.get(c).push(+n); }
  const tri = [...membres.entries()].map(([c, m]) => [c, m, m.reduce((s, i) => s + total[i], 0)]).sort((a, b) => b[2] - a[2]);
  const couleur = new Map(), de = new Map(), liste = [];
  tri.forEach(([c, m, poids], k) => {
    const col = k < PALETTE_COMM.length ? PALETTE_COMM[k] : COULEURS.autre;
    const tetes = [...m].sort((a, b) => (P[b].cle - P[a].cle) || (total[b] - total[a])).slice(0, 3).map(i => P[i].n);
    m.forEach(i => { couleur.set(i, col); de.set(i, k < PALETTE_COMM.length ? k : "autres"); });
    if (k < PALETTE_COMM.length) liste.push({k, col, tetes, n: m.length, poids});
  });
  etat.communautes = {couleur, de, liste, autres: tri.length - liste.length};
  etat.communautesMasquees = new Set();
}

// ---------------------------------------------------------------- Interactions du graphe
const bulle = $("#infobulle");
function montrerBulle(html){ bulle.innerHTML = html; bulle.style.display = "block"; }
rendu.on("enterNode", ({node}) => { const i = +node; montrerBulle(`<b>${esc(P[i].n)}</b><br>${compte.get(i) || 0} lettres sur ${etat.debut}–${etat.fin}`); });
rendu.on("enterEdge", ({edge}) => {
  const e = liens.get(graphe.getEdgeAttribute(edge, "k"));
  const mes = e.lettres.filter(garder), ab = mes.filter(j => L[j][1].includes(e.a)).length;
  montrerBulle(`<b>${esc(P[e.a].n)}</b> ↔ <b>${esc(P[e.b].n)}</b><br>${mes.length} lettres sur la période<br>${esc(P[e.a].n)} → : ${ab} · ${esc(P[e.b].n)} → : ${mes.length - ab}`);
});
rendu.on("leaveNode", () => bulle.style.display = "none");
rendu.on("leaveEdge", () => bulle.style.display = "none");
document.addEventListener("mousemove", ev => { bulle.style.left = Math.min(ev.clientX + 14, innerWidth - 330) + "px"; bulle.style.top = ev.clientY + 14 + "px"; });
rendu.on("clickNode", ({node}) => choisirPersonne(+node));
rendu.on("clickEdge", ({edge}) => choisirLien(graphe.getEdgeAttribute(edge, "k")));
rendu.on("clickStage", () => { etat.sel = null; etat.panneau = null; etat.ego = 0; maj(); });

function centrer(i){
  if (!graphe.hasNode(String(i))) return;
  const pos = rendu.getNodeDisplayData(String(i));
  if (pos) rendu.getCamera().animate({x: pos.x, y: pos.y, ratio: 0.35}, {duration: 500});
}
function choisirPersonne(i, recentrer){
  etat.sel = {type: "p", id: i}; etat.panneau = null; etat.lieu = null;
  maj(); if (recentrer) centrer(i);
}
function choisirLien(k){ etat.sel = {type: "l", k}; etat.panneau = null; etat.ego = 0; etat.lieu = null; maj(); }

// ---------------------------------------------------------------- Dates, citations, fiabilité
function dateFr(d){
  const [a, m, j] = String(d).split("-");
  if (j) return `${+j} ${MOIS[+m - 1]} ${a}`;
  if (m) return `${MOIS[+m - 1]} ${a}`;
  return a;
}
function badgeDate(i){
  const l = L[i], p = l[10] || 0;
  return `<span class="d p${p}" title="${PREC[p]}">${p === 3 ? "≈ " : ""}${esc(l[0])}</span>`;
}
function marqueurs(i){
  const l = L[i]; let s = "";
  if (l[9]) s += ' <span class="doute" title="Extraction automatique : numéro, date ou correspondant à vérifier">⚠ à vérifier</span>';
  if (l[11]) s += ' <span class="corrigee" title="Corrigé après relecture">✎ corrigée</span>';
  return s;
}
const noms = ids => ids.map(p => P[p].n).join(", ");
function lienDoc(i){
  const l = L[i]; if (!l[6]) return "";
  const t = /\/page\/n\d+/.test(l[6]) ? "page numérisée ↗" : /\?q=/.test(l[6]) ? "page numérisée (recherche) ↗" : estExtraction(l[5]) ? "volume numérisé ↗" : "notice ↗";
  return `<a href="${esc(l[6])}" target="_blank" rel="noopener" title="${/\?q=/.test(l[6]) ? "Ouvre le volume et recherche l'en-tête de la lettre" : ""}">${t}</a>`;
}
function citation(i){
  const l = L[i], lieu = D.lieux[l[3]];
  const src = titreSource(l[5]);
  return `${noms(l[1])} à ${noms(l[2])}${lieu ? ", " + lieu : ""}, ${l[10] === 3 ? "[date estimée] " : ""}${dateFr(l[0])}. `
    + (l[8] ? l[8] + ". " : "") + src + "."
    + (estExtraction(l[5]) ? " Métadonnées extraites automatiquement (Épistolaire de la Réforme" + (l[9] ? ", à vérifier" : "") + ")." : "")
    + (l[6] ? " " + l[6] : "");
}
function ligneLettre(i, a){
  const l = L[i];
  const sens = a === undefined ? "" : l[1].includes(a) ? "→" : "←";
  const autres = a === undefined ? `${esc(noms(l[1]))} → ${esc(noms(l[2]))}` : esc(noms(sens === "→" ? l[2] : l[1]));
  const lieu = [D.lieux[l[3]], D.lieux[l[4]]].filter(Boolean).join(" → ");
  return `<div class="lettre">${badgeDate(i)} ${sens} ${autres}${marqueurs(i)}
    ${lieu ? `<br><span class="muted">${esc(lieu)}</span>` : ""}
    ${l[8] ? `<br><span class="petit">${esc(l[8])}</span>` : ""}
    <br><span class="muted petit lien-source" data-s="${l[5]}" style="cursor:pointer;text-decoration:underline dotted">${esc(titreSource(l[5]).slice(0, 80))}</span>
    <br>${lienDoc(i)} · <button class="lienbtn" data-citer="${i}">citer</button> · <button class="lienbtn" data-signaler="${i}">signaler une erreur</button></div>`;
}
function brancherLettres(box){
  box.querySelectorAll("[data-citer]").forEach(el => el.onclick = () => copier(citation(+el.dataset.citer), "Référence copiée"));
  box.querySelectorAll("[data-signaler]").forEach(el => el.onclick = () => signaler(+el.dataset.signaler));
  box.querySelectorAll(".lien-source").forEach(el => el.onclick = () => { etat.panneau = {source: +el.dataset.s}; maj(); });
}
function legendeFiabilite(){
  $("#legende-fiab").innerHTML = `
    <div><span class="d p0">1527-11-21</span> <span class="muted">date exacte</span></div>
    <div><span class="d p1">1527-11</span> <span class="muted">au mois ou à l'année près</span></div>
    <div><span class="d p3">≈ 1527</span> <span class="muted">date estimée ou restituée</span></div>
    <div><span class="doute">⚠ à vérifier</span> <span class="muted">extraction automatique douteuse</span></div>`;
}

// ---------------------------------------------------------------- Mini-frises (deux sens)
/* rangees : [{haut:[idx], bas:[idx], titre}] ; axe commun lo..hi ; événements marqués */
function friseDouble(haut, bas, evts, opt = {}){
  const tous = [...haut, ...bas];
  if (!tous.length) return `<p class="petit muted">Aucune lettre.</p>`;
  const ans = tous.map(i => annee(L[i][0]));
  const lo = opt.lo ?? Math.max(A0, Math.min(...ans) - 1), hi = opt.hi ?? Math.min(A1, Math.max(...ans) + 1);
  const W = 340, H = opt.h || 92, mid = H / 2 - 4, n = hi - lo + 1;
  const compter = arr => { const m = new Map(), u = new Map(); arr.forEach(i => { const a = annee(L[i][0]); m.set(a, (m.get(a) || 0) + 1); if (L[i][10] === 3) u.set(a, (u.get(a) || 0) + 1); }); return [m, u]; };
  const [mh, uh] = compter(haut), [mb, ub] = compter(bas);
  const max = opt.max || Math.max(1, ...mh.values(), ...mb.values());
  const x = a => (a - lo) / n * W, bw = Math.max(1, W / n - 1), h = v => v / max * (mid - 6);
  let s = `<svg class="mini" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">`;
  s += `<rect x="${x(Math.max(etat.debut, lo))}" width="${Math.max(0, x(Math.min(etat.fin, hi) + 1) - x(Math.max(etat.debut, lo)))}" y="0" height="${H - 10}" fill="${css("--sel")}" opacity=".15"/>`;
  for (const g of opt.silences || []) s += `<rect x="${x(g[0] + 1)}" width="${x(g[1]) - x(g[0] + 1)}" y="2" height="${H - 14}" fill="none" stroke="${css("--muted")}" stroke-dasharray="2,2"><title>Silence de ${g[1] - g[0]} ans dans les lettres conservées (${g[0]}–${g[1]})</title></rect>`;
  for (const [a, v] of mh){ const u = uh.get(a) || 0;
    s += `<rect x="${x(a)}" y="${mid - h(v)}" width="${bw}" height="${h(v - u)}" fill="${css("--barwin")}"><title>${a} : ${v} ${opt.lh || "envoyée(s)"}${u ? ` (dont ${u} à date estimée)` : ""}</title></rect>`;
    if (u) s += `<rect x="${x(a)}" y="${mid - h(u)}" width="${bw}" height="${h(u)}" fill="${css("--barwin")}" opacity=".4"><title>${a} : ${u} à date estimée</title></rect>`; }
  for (const [a, v] of mb){ const u = ub.get(a) || 0;
    s += `<rect x="${x(a)}" y="${mid + 1}" width="${bw}" height="${h(v - u)}" fill="${css("--barbas")}"><title>${a} : ${v} ${opt.lb || "reçue(s)"}${u ? ` (dont ${u} à date estimée)` : ""}</title></rect>`;
    if (u) s += `<rect x="${x(a)}" y="${mid + 1 + h(v - u)}" width="${bw}" height="${h(u)}" fill="${css("--barbas")}" opacity=".4"/>`; }
  s += `<line x1="0" x2="${W}" y1="${mid + .5}" y2="${mid + .5}" stroke="${css("--line")}"/>`;
  for (const e of evts){ const a = annee(e.date); if (a < lo || a > hi || !etat.themes.has(e.theme)) continue;
    s += `<path d="M${x(a) + bw / 2 - 4},${H - 1} l4,-7 l4,7z" fill="${css("--t-" + sansAccent(e.theme))}"><title>${esc(dateFr(e.date))} — ${esc(e.evenement)}</title></path>`; }
  s += `</svg><div class="petit muted" style="display:flex;justify-content:space-between"><span>${lo}</span><span>${opt.legende || `<span style="color:var(--barwin)">▀ ${opt.lh || "envoyées"}</span> · <span style="color:var(--barbas)">▄ ${opt.lb || "reçues"}</span> · max ${max}/an`}</span><span>${hi}</span></div>`;
  return s;
}
const evenementsDe = ids => D.evenements.filter(e => e.p.some(p => ids.includes(p)));

// Dynamique d'une relation : première et dernière lettre, pic, silences
function dynamique(indices){
  const tri = [...indices].sort((x, y) => L[x][0] < L[y][0] ? -1 : 1);
  if (!tri.length) return null;
  const ans = tri.map(i => annee(L[i][0])), parAn = new Map();
  ans.forEach(a => parAn.set(a, (parAn.get(a) || 0) + 1));
  const pic = [...parAn.entries()].sort((a, b) => b[1] - a[1])[0];
  const uniq = [...new Set(ans)].sort((a, b) => a - b), silences = [];
  for (let k = 1; k < uniq.length; k++) if (uniq[k] - uniq[k - 1] >= 3) silences.push([uniq[k - 1], uniq[k]]);
  return {premiere: tri[0], derniere: tri.at(-1), duree: ans.at(-1) - ans[0], pic, silences, actives: uniq.length};
}

// ---------------------------------------------------------------- Panneau de droite
function afficherDetail(){
  const box = $("#detail"), s = etat.sel, pan = etat.panneau;
  if (pan === "sources" || (pan && pan.source !== undefined)) panneauSources(box, pan.source);
  else if (pan === "cmp") panneauComparer(box);
  else if (pan === "doublons") panneauDoublons(box);
  else if (pan === "corrections") panneauCorrections(box);
  else if (pan === "limites") panneauLimites(box);
  else if (pan && pan.evt !== undefined) panneauEvenement(box, pan.evt);
  else if (pan && pan.lieu !== undefined) panneauLieu(box, pan.lieu);
  else if (s && s.type === "p") panneauPersonne(box, s.id);
  else if (s && s.type === "l") panneauLien(box, s.k);
  else if (s && s.type === "chemin") panneauChemin(box);
  else if (s && s.type === "s") panneauSources(box, s.id);
  else panneauAccueil(box);
  box.querySelectorAll("[data-p]").forEach(el => el.onclick = () => choisirPersonne(+el.dataset.p, true));
  box.querySelectorAll("[data-l]").forEach(el => el.onclick = () => choisirLien(el.dataset.l));
  brancherLettres(box);
}
function panneauAccueil(box){
  const top = [...compte.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  box.innerHTML = `<h2>Sur ${etat.debut}–${etat.fin}</h2>
    <p>${nf([...compteLien.values()].reduce((a, b) => a + b, 0))} échanges entre ${nf(compte.size)} personnes.</p>
    <p class="petit muted">Cliquez sur une personne pour voir ses correspondants et sa frise, ou sur un lien pour lire les lettres qui le composent. Nouveau ici ? <button class="lienbtn" id="aide2">Mode d'emploi</button> · <button class="lienbtn" id="lim2">Limites du corpus</button></p>
    <h2>Les plus actifs</h2>` + top.map(([i, n]) => `<div class="corresp" data-p="${i}"><span><span class="pastille" style="background:${couleurDe(i)}"></span> ${esc(P[i].n)}</span><span class="muted">${n}</span></div>`).join("");
  $("#aide2").onclick = aide; $("#lim2").onclick = () => { etat.panneau = "limites"; maj(); };
}
function panneauPersonne(box, i){
  const p = P[i], mes = parPersonne[i].filter(garder);
  const env = mes.filter(j => L[j][1].includes(i)), rec = mes.filter(j => !L[j][1].includes(i));
  const parCorr = new Map();
  for (const j of mes){
    const envoyee = L[j][1].includes(i);
    for (const q of (envoyee ? L[j][2] : L[j][1])) if (q !== i) {
      const c = parCorr.get(q) || [0, 0]; c[envoyee ? 0 : 1]++; parCorr.set(q, c);
    }
  }
  const corr = [...parCorr.entries()].sort((a, b) => (b[1][0] + b[1][1]) - (a[1][0] + a[1][1]));
  const tousEnv = parPersonne[i].filter(j => L[j][1].includes(i)), tousRec = parPersonne[i].filter(j => !L[j][1].includes(i));
  const dansCmp = etat.cmp.includes(i);
  box.innerHTML = `<h3>${esc(p.n)}</h3>
    <div class="petit muted">${p.v ? p.v[0] + "–" + p.v[1] + " · " : ""}<span class="pastille" style="background:${couleurDe(i)}"></span> ${esc(NOMS_GROUPES[p.g] || p.g)}${p.ref ? ` · <a href="${esc(p.ref)}" target="_blank" rel="noopener">GND ↗</a>` : " · sans identifiant GND"}</div>
    <div class="ligne" style="margin-top:8px">
      <label class="groupe" title="N'afficher que cette personne et ses correspondants"><input type="checkbox" id="ego1" ${etat.ego ? "checked" : ""}> réseau personnel</label>
      <select class="champ" id="ego2" style="width:auto" ${etat.ego ? "" : "disabled"}><option value="1" ${etat.ego !== 2 ? "selected" : ""}>correspondants</option><option value="2" ${etat.ego === 2 ? "selected" : ""}>+ leurs correspondants</option></select>
    </div>
    <div class="ligne">
      <button class="btn petit ${dansCmp ? "actif" : ""}" id="b-cmp1">${dansCmp ? "✓ dans la comparaison" : "＋ comparer"}</button>
      <button class="btn petit" id="b-tab1">lettres en tableau</button>
      <button class="btn petit" id="b-sig1">signaler une erreur</button>
    </div>
    <h2>Lettres par an (toutes périodes)</h2>${friseDouble(tousEnv, tousRec, evenementsDe([i]))}
    <p>${mes.length} lettres sur ${etat.debut}–${etat.fin} : <b style="color:var(--barwin)">${env.length} envoyées</b>, <b style="color:var(--barbas)">${rec.length} reçues</b>.</p>
    <h2>Chemin vers une autre personne</h2>
    <input class="champ" id="chemin-vers" placeholder="Par qui passe le lien avec… ?" autocomplete="off"><div class="suggest" id="chemin-sugg"></div>
    <h2>Correspondants (${corr.length}) <span class="muted" style="text-transform:none;letter-spacing:0">· ↗ écrit · ↙ reçu</span></h2>` +
    corr.slice(0, 80).map(([q, [a, b]]) => `<div class="corresp" data-l="${cleLien(i, q)}"><span><span class="pastille" style="background:${couleurDe(q)}"></span> ${esc(P[q].n)}</span><span class="muted" title="${a} lettres de ${esc(p.n)}, ${b} lettres reçues de ${esc(P[q].n)}">↗${a} ↙${b}</span></div>`).join("") +
    (corr.length > 80 ? `<p class="petit muted">… et ${corr.length - 80} autres (voir l'onglet Lettres)</p>` : "");
  $("#ego1").onchange = e => { etat.ego = e.target.checked ? +$("#ego2").value : 0; maj(); };
  $("#ego2").onchange = e => { etat.ego = +e.target.value; maj(); };
  $("#b-cmp1").onclick = () => { basculerComparaison(i); };
  $("#b-tab1").onclick = () => changerVue("tableau");
  $("#b-sig1").onclick = () => signalerPersonne(i);
  champPersonne($("#chemin-vers"), $("#chemin-sugg"), j => chercherChemin(i, j));
}
function panneauLien(box, k){
  const e = liens.get(k), mes = e.lettres.filter(garder).sort((x, y) => L[x][0] < L[y][0] ? -1 : 1);
  const ab = e.lettres.filter(j => L[j][1].includes(e.a)), ba = e.lettres.filter(j => !L[j][1].includes(e.a));
  const dy = dynamique(e.lettres);
  const nab = mes.filter(j => L[j][1].includes(e.a)).length;
  box.innerHTML = `<h3>${esc(P[e.a].n)} ↔ ${esc(P[e.b].n)}</h3>
    <div class="petit muted">${e.lettres.length} lettres au total · ${mes.length} sur ${etat.debut}–${etat.fin}</div>
    <h2>Rythme de l'échange</h2>${friseDouble(ab, ba, evenementsDe([e.a, e.b]), {lh: P[e.a].n.split(" ").at(-1) + " →", lb: P[e.b].n.split(" ").at(-1) + " →", silences: dy.silences})}
    <div class="cartouche"><div class="chiffres">
      <span>Première lettre</span><b>${esc(dateFr(L[dy.premiere][0]))}</b>
      <span>Dernière lettre</span><b>${esc(dateFr(L[dy.derniere][0]))}</b>
      <span>Durée</span><b>${dy.duree} ans (${dy.actives} années actives)</b>
      <span>Année la plus dense</span><b>${dy.pic[0]} (${dy.pic[1]} lettres)</b>
      <span>${esc(P[e.a].n.split(" ").at(-1))} → ${esc(P[e.b].n.split(" ").at(-1))}</span><b>${ab.length}</b>
      <span>${esc(P[e.b].n.split(" ").at(-1))} → ${esc(P[e.a].n.split(" ").at(-1))}</span><b>${ba.length}</b>
    </div>
    ${dy.silences.length ? `<p class="petit" style="margin:6px 0 0">Silences de 3 ans ou plus : ${dy.silences.map(g => `${g[0]}–${g[1]}`).join(", ")}.</p>` : ""}
    <p class="petit muted" style="margin:4px 0 0">Un silence signifie qu'aucune lettre n'est <i>conservée et collectée ici</i> ; ce n'est pas forcément une rupture. Le déséquilibre entre les deux sens reflète souvent l'archive (qui a gardé quoi).</p></div>
    <div class="ligne"><button class="btn petit" data-p="${e.a}">Voir ${esc(P[e.a].n)}</button><button class="btn petit" data-p="${e.b}">Voir ${esc(P[e.b].n)}</button><button class="btn petit" id="b-tab2">en tableau</button></div>
    <p class="petit">Sur la période : ${esc(P[e.a].n)} → ${nab} · ${esc(P[e.b].n)} → ${mes.length - nab}</p>
    <h2>Lettres</h2>` + mes.map(j => ligneLettre(j, e.a)).join("");
  $("#b-tab2").onclick = () => changerVue("tableau");
}

// ---------------------------------------------------------------- Chemin entre deux personnes
function chercherChemin(a, b){
  // Dijkstra sur les liens de la période ; coût = 1 + 1/n : à longueur égale, préfère les liens les plus nourris
  const dist = new Map([[a, 0]]), prec = new Map(), fait = new Set(), tas = [[0, a]];
  const pousser = x => { tas.push(x); let k = tas.length - 1; while (k > 0){ const p = (k - 1) >> 1; if (tas[p][0] <= tas[k][0]) break; [tas[p], tas[k]] = [tas[k], tas[p]]; k = p; } };
  const tirer = () => { const r = tas[0], d = tas.pop(); if (tas.length){ tas[0] = d; let k = 0; for(;;){ const g = 2*k+1, h = g+1; let m = k; if (g < tas.length && tas[g][0] < tas[m][0]) m = g; if (h < tas.length && tas[h][0] < tas[m][0]) m = h; if (m === k) break; [tas[m], tas[k]] = [tas[k], tas[m]]; k = m; } } return r; };
  while (tas.length){
    const [d, x] = tirer(); if (fait.has(x)) continue; fait.add(x); if (x === b) break;
    if (!graphe.hasNode(String(x))) continue;
    for (const y of graphe.neighbors(String(x))){
      const yy = +y, n = compteLien.get(cleLien(x, yy)); if (!n) continue;
      const nd = d + 1 + 1 / n;
      if (nd < (dist.get(yy) ?? Infinity)){ dist.set(yy, nd); prec.set(yy, x); pousser([nd, yy]); }
    }
  }
  if (!prec.has(b) && a !== b){ toast(`Aucun chemin entre ${P[a].n} et ${P[b].n} sur ${etat.debut}–${etat.fin}`); return; }
  const noeuds = [b]; while (noeuds[0] !== a) noeuds.unshift(prec.get(noeuds[0]));
  const ls = noeuds.slice(1).map((y, k) => cleLien(noeuds[k], y));
  etat.sel = {type: "chemin", noeuds, liens: ls}; etat.ego = 0; etat.panneau = null; maj();
}
function panneauChemin(box){
  const s = etat.sel;
  box.innerHTML = `<h3>${esc(P[s.noeuds[0]].n)} ⟶ ${esc(P[s.noeuds.at(-1)].n)}</h3>
    <p class="petit muted">Chemin le plus court sur ${etat.debut}–${etat.fin} (${s.noeuds.length - 1} étape${s.noeuds.length > 2 ? "s" : ""}). À longueur égale, les liens les plus nourris sont préférés.</p>` +
    s.noeuds.map((x, k) => `<div class="corresp" data-p="${x}"><span><span class="pastille" style="background:${couleurDe(x)}"></span> ${esc(P[x].n)}</span>${k ? "" : ""}</div>` +
      (k < s.liens.length ? `<div class="corresp" data-l="${s.liens[k]}" style="padding-left:18px"><span class="muted">↓ ${compteLien.get(s.liens[k])} lettres</span><span class="muted petit">voir</span></div>` : "")).join("") +
    `<p class="petit muted">Le chemin dépend des sources disponibles : un intermédiaire absent du corpus ne peut pas apparaître.</p>`;
}

// ---------------------------------------------------------------- Comparaison
function basculerComparaison(i){
  const k = etat.cmp.indexOf(i);
  if (k >= 0) etat.cmp.splice(k, 1);
  else { if (etat.cmp.length >= 4) { toast("Quatre personnes au plus"); return; } etat.cmp.push(i); }
  $("#b-comparer").textContent = etat.cmp.length ? `Comparer (${etat.cmp.length})` : "Comparer";
  if (etat.cmp.length >= 2) etat.panneau = "cmp";
  maj();
}
function panneauComparer(box){
  const ids = etat.cmp;
  if (!ids.length){ box.innerHTML = `<h3>Comparer</h3><p class="petit">Ajoutez jusqu'à quatre personnes avec le bouton « ＋ comparer » de leur fiche, ou ici :</p><input class="champ" id="cmp-ajout" placeholder="Ajouter une personne…" autocomplete="off"><div class="suggest" id="cmp-sugg"></div>`; champPersonne($("#cmp-ajout"), $("#cmp-sugg"), basculerComparaison); return; }
  const tous = ids.flatMap(i => parPersonne[i]), ans = tous.map(j => annee(L[j][0]));
  const lo = Math.max(A0, Math.min(...ans) - 1), hi = Math.min(A1, Math.max(...ans) + 1);
  const series = ids.map(i => [parPersonne[i].filter(j => L[j][1].includes(i)), parPersonne[i].filter(j => !L[j][1].includes(i))]);
  let max = 1; series.forEach(([e, r]) => { const m = new Map(); [...e, ...r].forEach(j => { const a = annee(L[j][0]); m.set(a, (m.get(a) || 0) + 1); }); max = Math.max(max, ...m.values()); });
  const corrDe = i => new Set(parPersonne[i].flatMap(j => [...L[j][1], ...L[j][2]]).filter(q => q !== i));
  const sets = ids.map(corrDe);
  const communs = [...sets[0]].filter(q => sets.every(s => s.has(q)) && !ids.includes(q)).sort((a, b) => total[b] - total[a]);
  const entre = [];
  for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++){ const e = liens.get(cleLien(ids[x], ids[y])); if (e) entre.push([ids[x], ids[y], e.lettres.length]); }
  const commune = etat.echelleCommune !== false;
  box.innerHTML = `<h3>Comparer</h3><p class="petit muted">Même axe du temps (${lo}–${hi}). En haut : lettres écrites ; en bas : lettres reçues. Triangles : événements liés à l'une des personnes.</p>
    <div class="ligne"><label class="groupe"><input type="radio" name="ech" value="1" ${commune ? "checked" : ""}> même échelle (compare les volumes)</label><label class="groupe"><input type="radio" name="ech" value="0" ${commune ? "" : "checked"}> échelle propre (compare les rythmes)</label></div>` +
    ids.map((i, k) => `<div class="cartouche"><div class="ligne" style="justify-content:space-between;margin:0"><b data-p="${i}" style="cursor:pointer">${esc(P[i].n)}</b><button class="lienbtn" data-retirer="${i}">retirer</button></div>
      ${friseDouble(series[k][0], series[k][1], evenementsDe([i]), {lo, hi, max: commune ? max : undefined, h: 74})}</div>`).join("") +
    `<input class="champ" id="cmp-ajout" placeholder="Ajouter une personne…" autocomplete="off" ${ids.length >= 4 ? "disabled" : ""}><div class="suggest" id="cmp-sugg"></div>` +
    (entre.length ? `<h2>Liens directs</h2>` + entre.map(([a, b, n]) => `<div class="corresp" data-l="${cleLien(a, b)}"><span>${esc(P[a].n)} ↔ ${esc(P[b].n)}</span><span class="muted">${n}</span></div>`).join("") : "") +
    (ids.length > 1 ? `<h2>Correspondants communs (${communs.length})</h2>` + communs.slice(0, 40).map(q => `<div class="corresp" data-p="${q}"><span><span class="pastille" style="background:${couleurDe(q)}"></span> ${esc(P[q].n)}</span><span class="muted">${total[q]}</span></div>`).join("") : "") +
    `<p><button class="btn petit" id="cmp-vider">Vider la comparaison</button></p>`;
  box.querySelectorAll("[data-retirer]").forEach(el => el.onclick = () => basculerComparaison(+el.dataset.retirer));
  box.querySelectorAll("input[name=ech]").forEach(el => el.onchange = () => { etat.echelleCommune = el.value === "1"; afficherDetail(); });
  champPersonne($("#cmp-ajout"), $("#cmp-sugg"), basculerComparaison);
  $("#cmp-vider").onclick = () => { etat.cmp = []; $("#b-comparer").textContent = "Comparer"; maj(); };
}
$("#b-comparer").onclick = () => { etat.panneau = etat.panneau === "cmp" ? null : "cmp"; maj(); };

// ---------------------------------------------------------------- Événement, lieu
function panneauEvenement(box, k){
  const e = D.evenements[k];
  box.innerHTML = `<h3>${esc(e.evenement)}</h3>
    <div class="petit muted">${esc(dateFr(e.date))}${e.date_precision && e.date_precision !== "exacte" ? ` (${e.date_precision === "mois" ? "au mois près" : "à l'année près"})` : ""} · ${esc(e.lieu || "")} · <span style="color:var(--t-${sansAccent(e.theme)})">${esc(THEMES[e.theme] || e.theme)}</span></div>
    ${e.source ? `<p class="petit">Source : <a href="${esc(e.source)}" target="_blank" rel="noopener">${esc(decodeURIComponent(e.source.replace(/^https?:\/\//, "")))}</a></p>` : ""}
    <p class="petit">La période affichée est centrée sur l'événement (± 2 ans).</p>
    ${e.p.length ? `<h2>Personnes concernées</h2>` + e.p.map(i => `<div class="corresp" data-p="${i}"><span><span class="pastille" style="background:${couleurDe(i)}"></span> ${esc(P[i].n)}</span><span class="muted">${(compte.get(i) || 0)} lettres sur la période</span></div>`).join("") : ""}
    ${e.p.length > 1 ? `<p><button class="btn petit" id="evt-cmp">Comparer ces personnes</button></p>` : ""}`;
  const b = $("#evt-cmp"); if (b) b.onclick = () => { etat.cmp = e.p.slice(0, 4); $("#b-comparer").textContent = `Comparer (${etat.cmp.length})`; etat.panneau = "cmp"; maj(); };
}
function panneauLieu(box, q){
  const mes = (parLieu.get(q) || []).filter(garder).filter(i => !filtreSel() || filtreSel().has(i));
  const env = mes.filter(i => L[i][3] === q).length;
  const pers = new Map(); mes.forEach(i => (L[i][3] === q ? L[i][1] : L[i][2]).forEach(p => pers.set(p, (pers.get(p) || 0) + 1)));
  box.innerHTML = `<h3>${esc(D.lieux[q])}</h3><p>${mes.length} lettres sur ${etat.debut}–${etat.fin} : ${env} écrites depuis ce lieu, ${mes.length - env} adressées à ce lieu.</p>
    <p><button class="btn petit" id="lieu-tab">voir ces lettres en tableau</button></p>
    <h2>Personnes présentes (écrivant ou recevant ici)</h2>` +
    [...pers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([p, n]) => `<div class="corresp" data-p="${p}"><span><span class="pastille" style="background:${couleurDe(p)}"></span> ${esc(P[p].n)}</span><span class="muted">${n}</span></div>`).join("");
  $("#lieu-tab").onclick = () => { etat.lieu = q; changerVue("tableau"); };
}

// ---------------------------------------------------------------- Sources et limites du corpus
function panneauSources(box, k){
  const lien = (u, t) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${t} ↗</a>` : "";
  const fiche = (x, k) => `<div class="lettre">
    <b>${esc(x.titre)}</b>
    <br><span class="muted">${nf(x.retenues || 0)} lettres retenues${x.lettres && x.lettres !== x.retenues ? ` (${nf(x.lettres)} collectées avant dédoublonnage)` : ""}${x.periode ? " · " + esc(x.periode) : ""}${x.type ? " · " + esc(x.type) : ""}</span>
    <br>${[lien(x.url_edition, "édition"), lien(x.url_correspsearch, "notices sur correspSearch"), lien(x.url_api, "requête exacte")].filter(Boolean).join(" · ")}
    ${x.fournisseur ? `<br><span class="petit">Obtenu via : ${esc(x.fournisseur)}${x.collecte ? ", le " + esc(x.collecte) : ""}</span>` : ""}
    ${x.licence ? `<br><span class="petit">Licence : ${lien(x.licence, esc(x.licence.replace(/^https?:\/\//, "")))}</span>` : ""}
    ${x.methode ? `<br><span class="petit muted">${esc(x.methode)}</span>` : ""}
    <br><button class="btn petit" data-filtre="${k}" style="margin-top:4px">Voir les lettres de cette source</button></div>`;
  if (k === undefined || k === null){
    box.innerHTML = `<h3>Sources des données</h3>
      <p class="petit">Chaque lettre renvoie à sa notice d'origine ou à la page du volume numérisé. La méthode complète est décrite dans <code>docs/sources-collectees.md</code> du dépôt.</p>
      <p class="petit muted">Les lettres sont dédoublonnées : une même lettre trouvée dans deux sources n'est comptée qu'une fois.</p>` +
      D.sources.map((x, k) => [x, k]).sort((a, b) => (b[0].retenues || 0) - (a[0].retenues || 0)).map(([x, k]) => fiche(x, k)).join("");
  } else box.innerHTML = `<h3>Source</h3>` + fiche(D.sources[k], k) + `<p><button class="btn petit" id="toutessources">Toutes les sources</button></p>`;
  box.querySelectorAll("[data-filtre]").forEach(el => el.onclick = () => { etat.sel = {type: "s", id: +el.dataset.filtre}; etat.panneau = null; maj(); });
  const tb = box.querySelector("#toutessources"); if (tb) tb.onclick = () => { etat.panneau = "sources"; maj(); };
}
function panneauLimites(box){
  const parSrc = new Map(); L.forEach(l => parSrc.set(l[5], (parSrc.get(l[5]) || 0) + 1));
  const srcs = [...parSrc.entries()].sort((a, b) => b[1] - a[1]), maxS = srcs[0][1];
  const cles = P.map((p, i) => [i, total[i]]).filter(([i]) => P[i].cle).sort((a, b) => b[1] - a[1]), maxC = cles[0][1];
  const prec = [0, 0, 0, 0]; let doute = 0; L.forEach(l => { prec[l[10] || 0]++; if (l[9]) doute++; });
  const extr = L.filter(l => estExtraction(l[5])).length;
  const barre = (n, max, col) => `<span style="display:inline-block;height:8px;width:${Math.max(1, 120 * n / max)}px;background:${col};border-radius:2px;vertical-align:middle"></span>`;
  box.innerHTML = `<h3>Comment lire ce réseau — limites du corpus</h3>
    <p class="petit">Ce navigateur rassemble des <b>métadonnées</b> de lettres (qui écrit à qui, quand, d'où), pas leur texte. Il reflète les lettres <i>conservées, éditées et collectées ici</i>, non la correspondance réelle.</p>
    <h2>1. Des sources très inégales</h2>
    <p class="petit">La taille d'un nœud dépend d'abord de l'état des éditions : Bullinger (environ 12 000 lettres conservées) et Melanchthon (MBW) sont complètement inventoriés ; Bucer n'est représenté que par l'édition Lenz et les lettres de ses correspondants, en attendant la <i>Correspondance</i> de Brill. <b>Un gros nœud n'est donc pas forcément un personnage plus important.</b></p>
    ${srcs.slice(0, 14).map(([k, n]) => `<div class="leg">${barre(n, maxS, css("--barwin"))} <b>${nf(n)}</b> <span class="muted">${esc(titreSource(k).slice(0, 55))}</span></div>`).join("")}
    <h2>2. Lettres par figure clé (tout le corpus)</h2>
    ${cles.slice(0, 18).map(([i, n]) => `<div class="leg" data-p="${i}" style="cursor:pointer">${barre(n, maxC, COULEURS[P[i].g])} <b>${nf(n)}</b> ${esc(P[i].n)}</div>`).join("")}
    <h2>3. Fiabilité</h2>
    <div class="chiffres petit"><span>Date exacte</span><b>${nf(prec[0])}</b><span>Au mois près</span><b>${nf(prec[1])}</b><span>À l'année près</span><b>${nf(prec[2])}</b><span>Date estimée ou restituée</span><b>${nf(prec[3])}</b><span>Marquées « à vérifier »</span><b>${nf(doute)}</b><span>Issues d'extractions automatiques</span><b>${nf(extr)} (${Math.round(100 * extr / L.length)} %)</b></div>
    <p class="petit">Les extractions du projet (OCR de volumes imprimés : Zwingli, Calvin, Luther WA Br, Érasme, Herminjard, Vadian, Blaurer, Rhenanus, Lenz) n'ont pas été relues. Les numéros, dates et noms peuvent contenir des erreurs ; chaque lettre renvoie à la page numérisée pour vérification. Le menu « Fiabilité des données » permet d'exclure les dates estimées ou toutes les données douteuses.</p>
    <h2>4. Personnes</h2>
    <p class="petit">Une même personne peut apparaître sous plusieurs graphies (Butzer, Bucerus…). Les figures clés sont identifiées par leur numéro GND ; les autres sont rapprochées automatiquement quand c'est sûr. Les cas douteux sont listés dans « Doublons » pour validation. Les institutions (conseils, villes) figurent comme correspondants.</p>
    <h2>5. Silences et déséquilibres</h2>
    <p class="petit">L'absence de lettres pendant une période peut venir d'une perte, d'un tome non numérisé (Blaurer II–III, WA Br 12–18) ou d'une source non encore intégrée (CRFS, EMLO). Le déséquilibre entre lettres écrites et reçues reflète souvent l'archive : on garde mieux les lettres reçues que les copies des lettres envoyées.</p>
    <h2>6. Événements</h2>
    <p class="petit">La frise compte ${D.evenements.length} repères, avec un lien vers une notice encyclopédique pour chacun. Ils servent à situer les échanges et ne prétendent pas à l'exhaustivité.</p>`;
}
$("#b-limites").onclick = () => { etat.panneau = etat.panneau === "limites" ? null : "limites"; maj(); };
$("#voirsources").onclick = () => { etat.panneau = "sources"; maj(); };

// ---------------------------------------------------------------- Signalements et doublons (stockés dans ce navigateur, exportés en CSV)
let corrections = stocke.lire("corrections", []);
let decisions = stocke.lire("decisions-doublons", {});    // "cleA|cleB" -> "meme" | "differentes"
function majCompteurs(){
  const n = corrections.length + Object.keys(decisions).length;
  $("#b-corrections").textContent = n ? `Corrections (${n})` : "Corrections";
  $("#b-comparer").textContent = etat.cmp.length ? `Comparer (${etat.cmp.length})` : "Comparer";
  const restants = D.fusions.filter(([i, j]) => !decisions[cleP(i) + "|" + cleP(j)]).length;
  $("#b-doublons").textContent = `Doublons (${restants})`;
}
function ouvrirModal(html){ $("#modal-boite").innerHTML = html; $("#modal").classList.add("ouvert"); }
function fermerModal(){ $("#modal").classList.remove("ouvert"); }
$("#modal").addEventListener("mousedown", e => { if (e.target.id === "modal") fermerModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") fermerModal(); });
function signaler(i){
  const l = L[i];
  ouvrirModal(`<h3>Signaler une erreur</h3>
    <p class="petit">${badgeDate(i)} ${esc(noms(l[1]))} → ${esc(noms(l[2]))}${l[8] ? "<br>" + esc(l[8]) : ""}<br>${lienDoc(i)}</p>
    <label>Ce qui est faux</label>
    <select class="champ" id="s-champ">
      <option value="date">la date</option><option value="expediteur">l'expéditeur</option><option value="destinataire">le destinataire</option>
      <option value="lieu_expedition">le lieu d'expédition</option><option value="lieu_reception">le lieu de réception</option>
      <option value="exclure">ce n'est pas une lettre, ou c'est un doublon</option><option value="autre">autre</option>
    </select>
    <label>Valeur correcte <span class="muted">(date au format 1527-11-21 ; plusieurs personnes séparées par « ; »)</span></label>
    <input class="champ" id="s-valeur">
    <label>Commentaire, référence vérifiée</label>
    <textarea class="champ" id="s-comm" rows="3" placeholder="p. ex. « vérifié sur la page numérisée : 21 novembre 1527 »"></textarea>
    <p class="petit muted">Le signalement est gardé dans ce navigateur. Exportez-le depuis « Corrections » pour qu'il soit intégré aux données.</p>
    <div class="actions"><button class="btn" id="s-annuler">Annuler</button><button class="btn actif" id="s-ok">Enregistrer</button></div>`);
  $("#s-annuler").onclick = fermerModal;
  $("#s-ok").onclick = () => {
    corrections.push({type: "lettre", source: D.sources[l[5]].id, ref: l[8], url: l[6], date: l[0], champ: $("#s-champ").value,
      valeur: $("#s-valeur").value.trim(), commentaire: $("#s-comm").value.trim(), resume: `${l[0]} ${noms(l[1])} → ${noms(l[2])}`});
    stocke.ecrire("corrections", corrections); fermerModal(); majCompteurs(); toast("Signalement enregistré");
  };
}
function signalerPersonne(i){
  ouvrirModal(`<h3>Signaler une erreur sur ${esc(P[i].n)}</h3>
    <label>Ce qui est faux</label>
    <select class="champ" id="s-champ"><option value="nom">le nom</option><option value="pole">le pôle</option><option value="identite">l'identification (mauvaise personne)</option><option value="autre">autre</option></select>
    <label>Valeur correcte</label><input class="champ" id="s-valeur">
    <label>Commentaire</label><textarea class="champ" id="s-comm" rows="3"></textarea>
    <div class="actions"><button class="btn" id="s-annuler">Annuler</button><button class="btn actif" id="s-ok">Enregistrer</button></div>`);
  $("#s-annuler").onclick = fermerModal;
  $("#s-ok").onclick = () => {
    corrections.push({type: "personne", source: "", ref: cleP(i), url: P[i].ref, date: "", champ: $("#s-champ").value,
      valeur: $("#s-valeur").value.trim(), commentaire: $("#s-comm").value.trim(), resume: P[i].n});
    stocke.ecrire("corrections", corrections); fermerModal(); majCompteurs(); toast("Signalement enregistré");
  };
}
function panneauCorrections(box){
  const fus = Object.entries(decisions);
  box.innerHTML = `<h3>Vos corrections</h3>
    <p class="petit">Elles sont gardées dans ce navigateur seulement. Pour les intégrer aux données : téléchargez les fichiers, puis déposez-les dans <code>data/</code> du dépôt (ou envoyez-les au responsable). La reconstruction (<code>scripts/construire_site.py</code>) les applique automatiquement.</p>
    <h2>Signalements (${corrections.length})</h2>` +
    (corrections.length ? corrections.map((c, k) => `<div class="lettre"><b>${esc(c.resume)}</b><br><span class="petit">${esc(c.champ)}${c.valeur ? " → « " + esc(c.valeur) + " »" : ""}</span>${c.commentaire ? `<br><span class="petit muted">${esc(c.commentaire)}</span>` : ""}<br><button class="lienbtn" data-suppr="${k}">supprimer</button></div>`).join("") : `<p class="petit muted">Aucun. Utilisez « signaler une erreur » sous une lettre ou sur la fiche d'une personne.</p>`) +
    `<h2>Décisions sur les doublons (${fus.length})</h2>` +
    (fus.length ? fus.map(([k, v]) => { const [a, b] = k.split("|"); const na = P[parCle.get(a)]?.n || a, nb = P[parCle.get(b)]?.n || b;
      return `<div class="lettre">${esc(na)} / ${esc(nb)} : <b>${v === "meme" ? "même personne" : "personnes différentes"}</b> <button class="lienbtn" data-annuler="${esc(k)}">annuler</button></div>`; }).join("") : `<p class="petit muted">Aucune. Voir « Doublons ».</p>`) +
    `<div class="ligne" style="margin-top:12px">
      <button class="btn petit" id="x-corr" ${corrections.length ? "" : "disabled"}>corrections.csv</button>
      <button class="btn petit" id="x-fus" ${fus.some(([, v]) => v === "meme") ? "" : "disabled"}>fusions.csv</button>
      <button class="btn petit" id="x-rej" ${fus.some(([, v]) => v !== "meme") ? "" : "disabled"}>fusions_rejetees.csv</button>
      <a class="btn petit" id="x-gh" target="_blank" rel="noopener" style="text-decoration:none">proposer sur GitHub ↗</a></div>
    <p class="petit muted">« Proposer sur GitHub » ouvre un ticket prérempli sur le dépôt (accès réservé aux membres du projet).</p>`;
  box.querySelectorAll("[data-suppr]").forEach(el => el.onclick = () => { corrections.splice(+el.dataset.suppr, 1); stocke.ecrire("corrections", corrections); majCompteurs(); afficherDetail(); });
  box.querySelectorAll("[data-annuler]").forEach(el => el.onclick = () => { delete decisions[el.dataset.annuler]; stocke.ecrire("decisions-doublons", decisions); majCompteurs(); afficherDetail(); });
  const cCSV = () => versCSV(["type", "source", "ref", "url", "date", "champ", "valeur", "commentaire"], corrections.map(c => [c.type, c.source, c.ref, c.url, c.date, c.champ, c.valeur, c.commentaire]));
  const fCSV = v => versCSV(["de", "vers", "commentaire"], fus.filter(([, x]) => (x === "meme") === v).map(([k]) => { const [a, b] = k.split("|"); return [b, a, "validé dans le navigateur"]; }));
  $("#x-corr").onclick = () => telecharger("corrections.csv", cCSV());
  $("#x-fus").onclick = () => telecharger("fusions.csv", fCSV(true));
  $("#x-rej").onclick = () => telecharger("fusions_rejetees.csv", fCSV(false));
  const corps = "Corrections proposées depuis le navigateur.\n\n```csv\n" + cCSV().slice(1) + "\n```\n\nFusions :\n```csv\n" + fCSV(true).slice(1) + "\n```\n\nFusions rejetées :\n```csv\n" + fCSV(false).slice(1) + "\n```";
  $("#x-gh").href = `${DEPOT}/issues/new?title=${encodeURIComponent("Corrections des données (" + (corrections.length + fus.length) + ")")}&body=${encodeURIComponent(corps.slice(0, 6000))}`;
}
$("#b-corrections").onclick = () => { etat.panneau = etat.panneau === "corrections" ? null : "corrections"; maj(); };

function panneauDoublons(box){
  const periode = i => { const a = parPersonne[i].map(j => annee(L[j][0])); return a.length ? `${Math.min(...a)}–${Math.max(...a)}` : ""; };
  const restants = D.fusions.filter(([i, j]) => !decisions[cleP(i) + "|" + cleP(j)]);
  box.innerHTML = `<h3>Doublons probables</h3>
    <p class="petit">Personnes au nom proche (variantes de graphie, latin, OCR) qui partagent au moins un correspondant. Ce sont des <b>suggestions</b> : validez seulement ce dont vous êtes sûr. La personne de gauche (la plus documentée) est conservée.</p>
    <p class="petit muted">${restants.length} paires à examiner · ${Object.keys(decisions).length} décidées</p>` +
    restants.slice(0, 60).map(([i, j, c]) => `<div class="cartouche">
      <div class="chiffres petit">
        <span><b data-p="${i}" style="cursor:pointer">${esc(P[i].n)}</b>${P[i].ref ? " (GND)" : ""}</span><span><b data-p="${j}" style="cursor:pointer">${esc(P[j].n)}</b>${P[j].ref ? " (GND)" : ""}</span>
        <span class="muted">${total[i]} lettres, ${periode(i)}</span><span class="muted">${total[j]} lettres, ${periode(j)}</span>
      </div>
      <div class="petit muted" style="margin-top:4px">${c} correspondant${c > 1 ? "s" : ""} en commun</div>
      <div class="ligne"><button class="btn petit" data-meme="${i}|${j}">même personne</button><button class="btn petit" data-diff="${i}|${j}">différentes</button></div></div>`).join("") +
    (restants.length > 60 ? `<p class="petit muted">Les ${restants.length - 60} suivantes apparaîtront à mesure.</p>` : "");
  const decider = (s, v) => { const [i, j] = s.split("|").map(Number); decisions[cleP(i) + "|" + cleP(j)] = v; stocke.ecrire("decisions-doublons", decisions); majCompteurs(); afficherDetail(); };
  box.querySelectorAll("[data-meme]").forEach(el => el.onclick = () => decider(el.dataset.meme, "meme"));
  box.querySelectorAll("[data-diff]").forEach(el => el.onclick = () => decider(el.dataset.diff, "differentes"));
}
$("#b-doublons").onclick = () => { etat.panneau = etat.panneau === "doublons" ? null : "doublons"; maj(); };

// ---------------------------------------------------------------- Lettres de la sélection
function filtreSel(){
  const s = etat.sel;
  if (s && s.type === "p") return new Set(etat.egoSet && etat.ego ? [...etat.egoSet].flatMap(x => parPersonne[x]).filter(j => [...L[j][1], ...L[j][2]].every(q => etat.egoSet.has(q))) : parPersonne[s.id]);
  if (s && s.type === "l") return new Set(liens.get(s.k).lettres);
  if (s && s.type === "chemin") return new Set(s.liens.flatMap(k => liens.get(k).lettres));
  if (s && s.type === "s") return new Set(L.map((l, i) => l[5] === s.id ? i : -1).filter(i => i >= 0));
  if (etat.panneau === "cmp" && etat.cmp.length) return new Set(etat.cmp.flatMap(i => parPersonne[i]));
  return null;
}
function decrireSel(){
  const s = etat.sel;
  if (s && s.type === "p") return P[s.id].n + (etat.ego ? " (réseau personnel)" : "");
  if (s && s.type === "l") { const e = liens.get(s.k); return `${P[e.a].n} ↔ ${P[e.b].n}`; }
  if (s && s.type === "chemin") return `chemin ${P[s.noeuds[0]].n} → ${P[s.noeuds.at(-1)].n}`;
  if (s && s.type === "s") return titreSource(s.id).slice(0, 50);
  if (etat.panneau === "cmp" && etat.cmp.length) return "comparaison : " + etat.cmp.map(i => P[i].n).join(", ");
  return "toutes les lettres";
}

// ---------------------------------------------------------------- Vue « Lettres » (tableau)
let tableLimite = 200;
function lettresTableau(){
  const f = filtreSel(), q = sansAccent(etat.texte.trim());
  let r = [];
  const base = f ? [...f] : L.map((_, i) => i);
  for (const i of base){
    if (!garder(i)) continue;
    if (etat.lieu !== null && L[i][3] !== etat.lieu && L[i][4] !== etat.lieu) continue;
    if (q){ const l = L[i]; const t = sansAccent([noms(l[1]), noms(l[2]), D.lieux[l[3]], D.lieux[l[4]], l[8], l[0]].join(" ")); if (!q.split(/\s+/).every(m => t.includes(m))) continue; }
    r.push(i);
  }
  const {col, sens} = etat.tri;
  const cle = {date: i => L[i][0], de: i => sansAccent(noms(L[i][1])), a: i => sansAccent(noms(L[i][2])), lieu: i => sansAccent(D.lieux[L[i][3]] || "~"), ref: i => L[i][8] || "~", source: i => titreSource(L[i][5]), fiab: i => (L[i][10] || 0) + (L[i][9] ? 4 : 0)}[col];
  r.sort((x, y) => { const a = cle(x), b = cle(y); return (a < b ? -1 : a > b ? 1 : 0) * sens || (L[x][0] < L[y][0] ? -1 : 1); });
  return r;
}
function dessinerTableau(){
  const el = $("#tableau"), r = lettresTableau();
  const th = (c, t) => `<th data-tri="${c}">${t}${etat.tri.col === c ? (etat.tri.sens > 0 ? " ▲" : " ▼") : ""}</th>`;
  el.innerHTML = `<div class="barre-outils">
      <input class="champ" id="t-texte" placeholder="Filtrer : nom, lieu, référence, année…" value="${esc(etat.texte)}">
      <span class="petit muted">${nf(r.length)} lettres · ${esc(decrireSel())}${etat.lieu !== null ? ` · lieu : ${esc(D.lieux[etat.lieu])} <button class="lienbtn" id="t-sanslieu">retirer</button>` : ""} · ${etat.debut}–${etat.fin}</span>
      <button class="btn petit" id="t-csv">Exporter en CSV</button>
    </div>
    <table><thead><tr>${th("date", "Date")}${th("de", "De")}${th("a", "À")}${th("lieu", "Lieu")}${th("ref", "Référence")}${th("source", "Source")}${th("fiab", "Fiabilité")}<th></th></tr></thead><tbody>` +
    r.slice(0, tableLimite).map(i => { const l = L[i];
      return `<tr><td>${badgeDate(i)}</td><td>${l[1].map(p => `<span data-p="${p}" style="cursor:pointer">${esc(P[p].n)}</span>`).join(", ")}</td><td>${l[2].map(p => `<span data-p="${p}" style="cursor:pointer">${esc(P[p].n)}</span>`).join(", ")}</td>
        <td>${esc([D.lieux[l[3]], D.lieux[l[4]]].filter(Boolean).join(" → "))}</td><td>${esc(l[8])}</td><td class="petit muted">${esc(titreSource(l[5]).slice(0, 40))}</td>
        <td class="petit">${PREC[l[10] || 0]}${marqueurs(i)}</td><td class="petit" style="white-space:nowrap">${lienDoc(i)}<br><button class="lienbtn" data-citer="${i}">citer</button> · <button class="lienbtn" data-signaler="${i}">signaler</button></td></tr>`; }).join("") +
    `</tbody></table>` + (r.length > tableLimite ? `<p style="text-align:center"><button class="btn" id="t-plus">Afficher ${Math.min(500, r.length - tableLimite)} de plus</button></p>` : "");
  const champ = $("#t-texte");
  champ.oninput = () => { etat.texte = champ.value; tableLimite = 200; clearTimeout(dessinerTableau.t); dessinerTableau.t = setTimeout(() => { dessinerTableau(); const c = $("#t-texte"); c.focus(); c.setSelectionRange(c.value.length, c.value.length); versAdresse(); }, 250); };
  el.querySelectorAll("th[data-tri]").forEach(t => t.onclick = () => { const c = t.dataset.tri; etat.tri = {col: c, sens: etat.tri.col === c ? -etat.tri.sens : 1}; dessinerTableau(); });
  el.querySelectorAll("[data-p]").forEach(s => s.onclick = () => choisirPersonne(+s.dataset.p));
  brancherLettres(el);
  const plus = $("#t-plus"); if (plus) plus.onclick = () => { tableLimite += 500; dessinerTableau(); };
  const sl = $("#t-sanslieu"); if (sl) sl.onclick = () => { etat.lieu = null; dessinerTableau(); };
  $("#t-csv").onclick = () => {
    const lignes = r.map(i => { const l = L[i]; return [l[0], PREC[l[10] || 0], noms(l[1]), l[1].map(p => P[p].ref).join(" ; "), noms(l[2]), l[2].map(p => P[p].ref).join(" ; "),
      D.lieux[l[3]] || "", D.lieux[l[4]] || "", l[8], titreSource(l[5]), l[9] ? "à vérifier" : "", l[6], citation(i)]; });
    telecharger(`lettres_${etat.debut}-${etat.fin}.csv`, versCSV(["date", "precision", "expediteur", "expediteur_gnd", "destinataire", "destinataire_gnd", "lieu_expedition", "lieu_reception", "reference", "source", "controle", "url", "citation"], lignes));
  };
}

// ---------------------------------------------------------------- Vue « Carte » (Leaflet, chargé à la demande)
let carte = null, coucheCarte = null, chargementCarte = null;
function chargerLeaflet(){
  if (window.L && window.L.map) return Promise.resolve();
  if (!chargementCarte) chargementCarte = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  return chargementCarte;
}
function dessinerCarte(){
  chargerLeaflet().then(() => {
    const LL = window.L;
    if (!carte){
      carte = LL.map("carte", {preferCanvas: true, worldCopyJump: true}).setView([48.5, 9.5], 5);
      // Fond Esri « Canvas » (gris clair / gris foncé), sans clé : les serveurs d'openstreetmap.org refusent les pages
      // ouvertes en file:// et CARTO exige désormais une clé. Fond sans frontières politiques marquées : moins anachronique.
      carte._fond = null;
      const leg = LL.control({position: "bottomleft"});
      leg.onAdd = () => { const d = LL.DomUtil.create("div"); d.style.cssText = "background:var(--panel);padding:6px 8px;border:1px solid var(--line);border-radius:4px;font-size:12px;max-width:240px"; d.id = "leg-carte"; return d; };
      leg.addTo(carte);
    }
    carte.invalidateSize();
    const sombre = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const style = sombre ? "World_Dark_Gray_Base" : "World_Light_Gray_Base";
    if (!carte._fond || carte._fond._style !== style){
      if (carte._fond) carte._fond.remove();
      carte._fond = LL.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${style}/MapServer/tile/{z}/{y}/{x}`, {maxZoom: 12,
        attribution: "Fond : Esri, HERE, Garmin, © contributeurs OpenStreetMap"}).addTo(carte);
      carte._fond._style = style;
    }
    if (coucheCarte) coucheCarte.remove();
    coucheCarte = LL.layerGroup().addTo(carte);
    const f = filtreSel(), env = new Map(), rec = new Map(), trajets = new Map();
    let n = 0, sansLieu = 0;
    L.forEach((l, i) => {
      if (!garder(i) || (f && !f.has(i))) return;
      n++;
      const a = D.geo[l[3]] ? l[3] : null, b = D.geo[l[4]] ? l[4] : null;
      if (a === null && b === null) { sansLieu++; return; }
      if (a !== null) env.set(a, (env.get(a) || 0) + 1);
      if (b !== null) rec.set(b, (rec.get(b) || 0) + 1);
      if (a !== null && b !== null && a !== b && D.geo[a].join() !== D.geo[b].join()){ const k = a + ">" + b; trajets.set(k, (trajets.get(k) || 0) + 1); }
    });
    const maxT = Math.max(1, ...trajets.values());
    [...trajets.entries()].sort((x, y) => y[1] - x[1]).slice(0, 400).forEach(([k, v]) => {
      const [a, b] = k.split(">").map(Number);
      LL.polyline([D.geo[a], D.geo[b]], {color: css("--accent"), weight: 0.6 + 4 * Math.sqrt(v / maxT), opacity: 0.35}).bindTooltip(`${esc(D.lieux[a])} → ${esc(D.lieux[b])} : ${v} lettres`).addTo(coucheCarte);
    });
    const lieux = new Set([...env.keys(), ...rec.keys()]);
    const parPoint = new Map();          // plusieurs graphies au même point : regroupées
    for (const q of lieux){ const k = D.geo[q].join(); if (!parPoint.has(k)) parPoint.set(k, []); parPoint.get(k).push(q); }
    const maxN = Math.max(1, ...[...parPoint.values()].map(qs => qs.reduce((s, q) => s + (env.get(q) || 0) + (rec.get(q) || 0), 0)));
    for (const qs of parPoint.values()){
      const e = qs.reduce((s, q) => s + (env.get(q) || 0), 0), r = qs.reduce((s, q) => s + (rec.get(q) || 0), 0);
      const principal = qs.sort((x, y) => ((env.get(y) || 0) + (rec.get(y) || 0)) - ((env.get(x) || 0) + (rec.get(x) || 0)))[0];
      LL.circleMarker(D.geo[principal], {radius: 3 + 22 * Math.sqrt((e + r) / maxN), color: css("--barwin"), weight: 1, fillColor: css("--barwin"), fillOpacity: 0.45})
        .bindTooltip(`<b>${esc(D.lieux[principal])}</b>${qs.length > 1 ? ` <span style="opacity:.7">(+ ${qs.length - 1} graphie${qs.length > 2 ? "s" : ""})</span>` : ""}<br>${e} écrites d'ici · ${r} reçues ici`)
        .on("click", () => { etat.panneau = {lieu: principal}; afficherDetail(); })
        .addTo(coucheCarte);
    }
    const leg = document.getElementById("leg-carte");
    if (leg) leg.innerHTML = `<b>${esc(decrireSel())}</b>, ${etat.debut}–${etat.fin}<br>${nf(n)} lettres, dont ${nf(sansLieu)} sans lieu connu<br><span style="color:var(--barwin)">●</span> taille : lettres écrites ou reçues<br><span style="color:var(--accent)">—</span> trajets (lieu d'expédition → réception, quand les deux sont connus)<br><span style="opacity:.7">Cliquez un lieu pour ses lettres. Coordonnées : GeoNames.</span>`;
  }).catch(() => { $("#carte").innerHTML = `<p style="padding:20px" class="muted">La carte n'a pas pu être chargée (connexion requise pour la bibliothèque Leaflet et le fond OpenStreetMap).</p>`; });
}

function changerVue(v){
  etat.vue = v;
  document.querySelectorAll(".onglets [data-vue]").forEach(b => b.setAttribute("aria-selected", b.dataset.vue === v));
  $("#tableau").hidden = v !== "tableau"; $("#carte").hidden = v !== "carte";
  maj();
}
document.querySelectorAll(".onglets [data-vue]").forEach(b => b.onclick = () => changerVue(b.dataset.vue));

// ---------------------------------------------------------------- Frise générale
const svg = $("#svgfrise");
function dessinerFrise(){
  const W = svg.clientWidth, H = svg.clientHeight, m = {l: 34, r: 10, t: 22, b: 36};
  if (!W || !H) return;
  const parAn = new Array(NA).fill(0), parAnU = new Array(NA).fill(0), sel = new Array(NA).fill(0), selU = new Array(NA).fill(0);
  const filtre = filtreSel();
  L.forEach((l, i) => {
    const a = annee(l[0]) - A0; if (a < 0 || a >= NA) return;
    if (etat.fiab === "datees" && l[10] === 3) return;
    if (etat.fiab === "sures" && (l[10] === 3 || l[9])) return;
    parAn[a]++; if (l[10] === 3) parAnU[a]++;
    if (filtre && filtre.has(i)){ sel[a]++; if (l[10] === 3) selU[a]++; }
  });
  const max = Math.max(1, ...(filtre ? sel : parAn)), maxTout = Math.max(1, ...parAn), x = a => m.l + (a - A0) / NA * (W - m.l - m.r), bw = Math.max(1, (W - m.l - m.r) / NA - 1);
  const h = n => Math.min(H - m.t - m.b, n / max * (H - m.t - m.b));
  let s = `<rect x="${x(etat.debut)}" y="${m.t}" width="${x(etat.fin + 1) - x(etat.debut)}" height="${H - m.t - m.b}" fill="${css("--sel")}" opacity=".18"/>`;
  const serie = filtre ? sel : parAn, serieU = filtre ? selU : parAnU;
  serie.forEach((n, k) => {
    const a = A0 + k, dans = a >= etat.debut && a <= etat.fin, u = serieU[k];
    if (filtre && parAn[k]){ const hh = parAn[k] / maxTout * (H - m.t - m.b); s += `<rect x="${x(a)}" y="${H - m.b - hh}" width="${bw}" height="${hh}" fill="${css("--line")}" opacity=".5"><title>${a} : ${parAn[k]} lettres (tout le corpus, autre échelle)</title></rect>`; }
    if (!n) return;
    s += `<rect x="${x(a)}" y="${H - m.b - h(n)}" width="${bw}" height="${h(n - u)}" fill="${css(dans || filtre ? "--barwin" : "--bar")}"><title>${a} : ${n} lettres${filtre ? " (sélection)" : ""}${u ? `, dont ${u} à date estimée` : ""}</title></rect>`;
    if (u) s += `<rect x="${x(a)}" y="${H - m.b - h(u)}" width="${bw}" height="${h(u)}" fill="${css(dans || filtre ? "--barwin" : "--bar")}" opacity=".4"><title>${a} : ${u} lettres à date estimée</title></rect>`;
  });
  for (let a = 1480; a <= A1; a += 10) s += `<text x="${x(a)}" y="${H - m.b + 13}" font-size="11" fill="${css("--muted")}">${a}</text><line x1="${x(a)}" x2="${x(a)}" y1="${H - m.b}" y2="${H - m.b + 3}" stroke="${css("--muted")}"/>`;
  s += `<text x="${m.l - 4}" y="${m.t + 8}" font-size="10" text-anchor="end" fill="${css("--muted")}">${max}</text>`;
  D.evenements.forEach((e, k) => {
    if (!etat.themes.has(e.theme)) return;
    const a = annee(e.date), xx = x(a + ((+e.date.slice(5, 7) || 6) - 1) / 12);
    const lie = filtre && etat.sel && etat.sel.type === "p" && e.p.includes(etat.sel.id);
    s += `<path class="evt" data-k="${k}" d="M${xx - 5},${H - 4} l5,-${lie ? 13 : 9} l5,${lie ? 13 : 9}z" fill="${css("--t-" + sansAccent(e.theme))}" opacity="${filtre && !lie ? .45 : 1}" style="cursor:pointer"><title>${esc(dateFr(e.date))} — ${esc(e.evenement)} (${THEMES[e.theme] || e.theme})</title></path>`;
  });
  svg.innerHTML = s;
  svg.querySelectorAll(".evt").forEach(el => el.addEventListener("mousedown", ev => { ev.stopPropagation(); const k = +el.dataset.k, a = annee(D.evenements[k].date); etat.panneau = {evt: k}; fixerPeriode(a - 2, a + 2); }));
  svg._x = v => A0 + (v - m.l) / (W - m.l - m.r) * NA;
  $("#legende-frise").innerHTML = `Lettres par an${filtre ? ` · <b>${esc(decrireSel())}</b> (en gris clair : tout le corpus, à sa propre échelle)` : ""} · teinte claire : dates estimées · ` +
    Object.entries(THEMES).map(([t, n]) => `<span style="color:var(--t-${sansAccent(t)})">▲ ${n.split(" ")[0].toLowerCase()}</span>`).join(" ");
}
let glisse = null;
const anFrise = ev => { const r = svg.getBoundingClientRect(); return Math.floor(svg._x(ev.clientX - r.left)); };
svg.addEventListener("mousedown", ev => { glisse = anFrise(ev); fixerPeriode(glisse, glisse); });
window.addEventListener("mousemove", ev => { if (glisse === null) return; const a = anFrise(ev); fixerPeriode(Math.min(glisse, a), Math.max(glisse, a)); });
window.addEventListener("mouseup", () => glisse = null);
svg.addEventListener("touchstart", ev => { glisse = anFrise(ev.touches[0]); }, {passive: true});
svg.addEventListener("touchmove", ev => { if (glisse === null) return; const a = anFrise(ev.touches[0]); fixerPeriode(Math.min(glisse, a), Math.max(glisse, a)); }, {passive: true});
svg.addEventListener("touchend", () => glisse = null);

function fixerPeriode(a, b){
  etat.debut = Math.max(A0, Math.min(A1, a)); etat.fin = Math.max(etat.debut, Math.min(A1, b));
  $("#debut").value = etat.debut; $("#fin").value = etat.fin; maj();
}

// ---------------------------------------------------------------- Contrôles
function champPersonne(input, liste, choisir){
  const index = P.map((p, i) => [sansAccent(p.n), i]).filter(([, i]) => total[i]);
  input.oninput = () => {
    const q = sansAccent(input.value.trim());
    if (q.length < 2){ liste.innerHTML = ""; return; }
    const r = index.filter(([n]) => n.includes(q)).sort((a, b) => total[b[1]] - total[a[1]]).slice(0, 15);
    liste.innerHTML = r.map(([, i]) => `<div data-i="${i}">${esc(P[i].n)} <span class="muted">(${total[i]})</span></div>`).join("");
    liste.querySelectorAll("div").forEach(el => el.onclick = () => { liste.innerHTML = ""; input.value = ""; choisir(+el.dataset.i); });
  };
  input.onkeydown = e => { if (e.key === "Enter"){ const d = liste.querySelector("div"); if (d) d.click(); } };
}
champPersonne($("#recherche"), $("#suggest"), i => choisirPersonne(i, true));
$("#debut").min = $("#fin").min = A0; $("#debut").max = $("#fin").max = A1;
$("#debut").oninput = e => fixerPeriode(+e.target.value, Math.max(+e.target.value, etat.fin));
$("#fin").oninput = e => fixerPeriode(Math.min(etat.debut, +e.target.value), +e.target.value);
$("#tout").onclick = () => fixerPeriode(A0, A1);
$("#min").oninput = e => { etat.min = +e.target.value; maj(); };
$("#seulcles").onchange = e => { etat.seulCles = e.target.checked; maj(); };
$("#noms").onchange = e => { etat.noms = e.target.checked; maj(); };
$("#fiabilite").onchange = e => { etat.fiab = e.target.value; maj(); };
$("#couleurs").onchange = e => { etat.couleurs = e.target.value; if (etat.couleurs === "communautes") calculerCommunautes(); dessinerGroupes(); maj(); };
let anim = null;
$("#lecture").onclick = () => {
  if (anim){ clearInterval(anim); anim = null; $("#lecture").textContent = "▶ Animer"; return; }
  const w = +$("#fenetre").value; let a = etat.debut >= A1 - 5 ? 1500 : etat.debut;
  $("#lecture").textContent = "❚❚ Pause";
  anim = setInterval(() => { fixerPeriode(a, a + w - 1); a++; if (a + w - 1 > A1){ clearInterval(anim); anim = null; $("#lecture").textContent = "▶ Animer"; } }, 700);
};
const nbParGroupe = {}; P.forEach((p, i) => { if (total[i]) nbParGroupe[p.g] = (nbParGroupe[p.g] || 0) + 1; });
function dessinerGroupes(){
  if (etat.couleurs === "communautes" && etat.communautes){
    $("#titre-groupes").textContent = "Communautés détectées";
    $("#groupes").innerHTML = `<p class="petit muted" style="margin:0 0 4px">Groupes de personnes qui s'écrivent surtout entre elles (algorithme de Louvain, sur tout le corpus). Nommées d'après leurs membres principaux.</p>` +
      etat.communautes.liste.map(c => `<label class="groupe"><input type="checkbox" data-c="${c.k}" ${etat.communautesMasquees.has(c.k) ? "" : "checked"}><span class="pastille" style="background:${c.col}"></span><span>${esc(c.tetes.join(", "))} <span class="muted petit">(${c.n})</span></span></label>`).join("") +
      `<label class="groupe"><input type="checkbox" data-c="autres" ${etat.communautesMasquees.has("autres") ? "" : "checked"}><span class="pastille" style="background:${COULEURS.autre}"></span>${etat.communautes.autres} petites communautés</label>`;
    $("#groupes").querySelectorAll("input").forEach(el => el.onchange = () => { const c = el.dataset.c === "autres" ? "autres" : +el.dataset.c; el.checked ? etat.communautesMasquees.delete(c) : etat.communautesMasquees.add(c); maj(); });
  } else {
    $("#titre-groupes").textContent = "Pôles";
    $("#groupes").innerHTML = `<p class="petit muted" style="margin:0 0 4px">Figures clés : leur ville ; autres personnes : le pôle de la figure clé avec qui elles échangent le plus.</p>` +
      Object.keys(COULEURS).filter(g => nbParGroupe[g]).map(g =>
      `<label class="groupe"><input type="checkbox" data-g="${g}" ${etat.groupes.has(g) ? "checked" : ""}><span class="pastille" style="background:${COULEURS[g]}"></span>${NOMS_GROUPES[g]} <span class="muted petit">(${nbParGroupe[g]})</span></label>`).join("");
    $("#groupes").querySelectorAll("input").forEach(el => el.onchange = () => { el.checked ? etat.groupes.add(el.dataset.g) : etat.groupes.delete(el.dataset.g); maj(); });
  }
}
function dessinerThemes(){
  const n = {}; D.evenements.forEach(e => n[e.theme] = (n[e.theme] || 0) + 1);
  $("#themes").innerHTML = Object.entries(THEMES).map(([t, nom]) => `<label class="groupe"><input type="checkbox" data-t="${t}" ${etat.themes.has(t) ? "checked" : ""}><span style="color:var(--t-${sansAccent(t)})">▲</span> ${nom} <span class="muted petit">(${n[t] || 0})</span></label>`).join("") +
    `<p class="petit muted" style="margin:4px 0 0">Cliquez un triangle de la frise pour la fiche de l'événement.</p>`;
  $("#themes").querySelectorAll("input").forEach(el => el.onchange = () => { el.checked ? etat.themes.add(el.dataset.t) : etat.themes.delete(el.dataset.t); maj(); });
}
const nbParSource = {}; L.forEach(l => nbParSource[l[5]] = (nbParSource[l[5]] || 0) + 1);
$("#sources").innerHTML = Object.entries(nbParSource).sort((a, b) => b[1] - a[1]).map(([s, n]) => `<div style="margin:3px 0;cursor:pointer" data-s="${s}">${nf(n)} · <span class="muted">${esc(titreSource(+s).slice(0, 70))}</span></div>`).join("");
$("#sources").querySelectorAll("[data-s]").forEach(el => el.onclick = () => { etat.panneau = {source: +el.dataset.s}; maj(); });

// ---------------------------------------------------------------- Aide (visite guidée à la première ouverture)
function aide(){
  ouvrirModal(`<h3>Mode d'emploi</h3>
    <p class="petit">Chaque <b>point</b> est une personne, chaque <b>trait</b> un échange de lettres : plus il est épais, plus il y a de lettres. La taille d'un point dépend du nombre de lettres conservées sur la période choisie.</p>
    <div class="etape"><b>1</b><div><b>Choisir une période</b> : glissez la souris sur la frise du bas, ou utilisez les curseurs. « ▶ Animer » fait défiler les années. Les triangles sont des événements (politiques, théologiques, personnels) ; cliquez-en un pour sa fiche.</div></div>
    <div class="etape"><b>2</b><div><b>Explorer une personne</b> : cherchez-la ou cliquez-la. Sa fiche montre ses lettres écrites (en haut) et reçues (en bas) année par année, ses correspondants, et permet d'isoler son <b>réseau personnel</b>, de chercher un <b>chemin</b> vers quelqu'un d'autre ou de l'ajouter à une <b>comparaison</b>.</div></div>
    <div class="etape"><b>3</b><div><b>Lire un échange</b> : cliquez un trait. Vous voyez le rythme de la relation, ses silences, le sens des lettres et la liste des lettres, chacune avec sa référence d'édition et un lien vers la page numérisée.</div></div>
    <div class="etape"><b>4</b><div><b>Travailler avec les lettres</b> : l'onglet <b>Lettres</b> donne un tableau triable et filtrable de la sélection, exportable en CSV ; l'onglet <b>Carte</b> montre d'où partent et où arrivent les lettres.</div></div>
    <div class="etape"><b>5</b><div><b>Citer et partager</b> : « citer » copie la référence d'une lettre ; « ⧉ Lien de cette vue » copie l'adresse de ce que vous voyez (période, personne, filtres).</div></div>
    <div class="etape"><b>6</b><div><b>Rester critique</b> : une part des données vient d'extractions automatiques non relues. Les dates estimées sont précédées de « ≈ » et en italique, les cas douteux portent ⚠. Le menu « Fiabilité des données » les exclut. Lisez <button class="lienbtn" id="aide-lim">Limites du corpus</button> avant d'interpréter la taille des nœuds. Une erreur ? « signaler une erreur ».</div></div>
    <h2>Légende</h2>
    <div class="leg"><span class="pastille" style="background:${COULEURS.wittenberg}"></span> couleur : pôle géographique (ou communauté détectée, au choix)</div>
    <div class="leg"><i style="background:var(--barwin)"></i> lettres écrites · <i style="background:var(--barbas)"></i> lettres reçues · teinte claire : dates estimées</div>
    <div class="leg"><span style="color:var(--t-politique)">▲</span> politique <span style="color:var(--t-theologique)">▲</span> théologique <span style="color:var(--t-personnel)">▲</span> personnel</div>
    <div class="actions"><button class="btn actif" id="aide-ok">Commencer</button></div>`);
  $("#aide-ok").onclick = fermerModal;
  $("#aide-lim").onclick = () => { fermerModal(); etat.panneau = "limites"; maj(); };
  stocke.ecrire("aide-vue", true);
}
$("#b-aide").onclick = aide;

// ---------------------------------------------------------------- Mise à jour générale
function maj(){
  $("#vdebut").textContent = etat.debut; $("#vfin").textContent = etat.fin; $("#vmin").textContent = etat.min;
  if (etat.sel && etat.sel.type !== "p") etat.ego = 0;
  recompter(); voisins = voisinsSel();
  rendu.refresh(); dessinerFrise(); afficherDetail();
  if (etat.vue === "tableau") dessinerTableau();
  if (etat.vue === "carte") dessinerCarte();
  $("#resume-vue").textContent = `${decrireSel()} · ${etat.debut}–${etat.fin}`;
  majCompteurs(); versAdresse();
}
function toutRedessiner(){ rendu.refresh(); dessinerFrise(); afficherDetail(); if (etat.vue === "carte") dessinerCarte(); }

// ---------------------------------------------------------------- Démarrage
depuisAdresse();
$("#debut").value = etat.debut; $("#fin").value = etat.fin; $("#min").value = etat.min;
$("#seulcles").checked = etat.seulCles; $("#fiabilite").value = etat.fiab; $("#couleurs").value = etat.couleurs;
if (etat.couleurs === "communautes") calculerCommunautes();
dessinerGroupes(); dessinerThemes(); legendeFiabilite();
$("#stats").textContent = `${nf(L.length)} lettres · ${nf(total.filter(Boolean).length)} personnes · ${D.sources.length} sources · données du ${D.genere}`;
window.addEventListener("resize", () => { dessinerFrise(); if (carte) carte.invalidateSize(); });
// lien collé dans la barre d'adresse : on recharge la vue décrite
window.addEventListener("hashchange", () => { if (location.hash !== versAdresse.dernier) location.reload(); });
if (etat.vue !== "graphe") changerVue(etat.vue); else maj();
if (etat.cheminDemande) chercherChemin(...etat.cheminDemande);
setTimeout(etape, 50);
if (!stocke.lire("aide-vue", false) && !location.hash) setTimeout(aide, 400);
