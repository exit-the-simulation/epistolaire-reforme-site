"use strict";
/* Vues complémentaires du navigateur : lignes de vie, matrice des échanges, parcours guidés.
   Chargé après app.js (dont il utilise les données et fonctions globales). */

// ======================================================================== Lignes de vie
etat.vies = null;                     // liste explicite de personnes (sinon choix automatique)
function personnesVies(){
  if (etat.vies && etat.vies.length) return etat.vies;
  const s = etat.sel;
  const actifs = i => compte.get(i) || 0;
  if (s && s.type === "pole") return P.map((p, i) => i).filter(i => P[i].cle && P[i].g === s.g && actifs(i)).sort((a, b) => actifs(b) - actifs(a)).slice(0, 12);
  if (etat.cmp.length >= 2) return etat.cmp.slice();
  if (s && s.type === "l") { const e = liens.get(s.k); return [e.a, e.b]; }
  if (s && s.type === "p"){
    const c = s.id, corr = new Map();
    for (const j of parPersonne[c]) if (garder(j)) for (const q of [...L[j][1], ...L[j][2]]) if (q !== c && P[q].cle) corr.set(q, (corr.get(q) || 0) + 1);
    return [c, ...[...corr.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map(x => x[0])];
  }
  const ordre = Object.keys(POLES_XY);
  return P.map((p, i) => i).filter(i => P[i].cle && actifs(i)).sort((a, b) => actifs(b) - actifs(a)).slice(0, 8)
    .sort((a, b) => ordre.indexOf(P[a].g) - ordre.indexOf(P[b].g));          // rangées par pôle : arcs plus courts
}
function dessinerVies(){
  const el = $("#vies"), ids = personnesVies();
  const W = Math.max(600, el.clientWidth - 24), G = 170, Dr = 14, H0 = 34, RH = Math.max(34, Math.min(60, (el.clientHeight - 80) / Math.max(ids.length, 1)));
  const lo = etat.debut, hi = Math.max(etat.fin, etat.debut + 9);
  const x = t => G + (t - lo) / (hi - lo + 1) * (W - G - Dr);
  const yrow = new Map(ids.map((i, k) => [i, H0 + 20 + k * RH]));
  const H = H0 + 40 + ids.length * RH;
  const frac = d => { const [a, m, j] = d.split("-").map(Number); return a + ((m || 6) - 1) / 12 + ((j || 15) - 1) / 365; };
  let s = `<svg width="${W}" height="${H}" style="display:block">`;
  // axe
  for (let a = Math.ceil(lo / 5) * 5; a <= hi; a += 5){
    s += `<line x1="${x(a)}" x2="${x(a)}" y1="${H0}" y2="${H - 10}" stroke="${css("--line")}" stroke-dasharray="${a % 10 ? "2,4" : ""}"/>`;
    if (a % 10 === 0 || hi - lo < 30) s += `<text x="${x(a)}" y="${H0 - 6}" font-size="11" text-anchor="middle" fill="${css("--muted")}">${a}</text>`;
  }
  for (const e of D.evenements){ const a = frac(e.date); if (a < lo || a > hi + 1 || !etat.themes.has(e.theme)) continue;
    s += `<path d="M${x(a) - 4},${H0 + 6} l4,-7 l4,7z" fill="${css("--t-" + sansAccent(e.theme))}"><title>${esc(dateFr(e.date))} — ${esc(e.evenement)}</title></path>`; }
  // lignes de vie et densité de chaque personne (toutes ses lettres)
  for (const i of ids){
    const y = yrow.get(i), p = P[i], mes = parPersonne[i].filter(garder);
    const ans = mes.map(j => annee(L[j][0]));
    const debut = p.v ? Math.max(p.v[0], lo) : Math.max(lo, Math.min(...ans, hi)), fin = p.v ? Math.min(p.v[1] + 1, hi + 1) : Math.min(hi + 1, Math.max(...ans, lo) + 1);
    s += `<text x="${G - 8}" y="${y + 4}" font-size="12" text-anchor="end" fill="${css("--ink")}" style="cursor:pointer" data-p="${i}">${esc(p.n.length > 24 ? p.n.slice(0, 23) + "…" : p.n)}</text>`;
    s += `<circle cx="${G - 2}" cy="${y}" r="4" fill="${couleurDe(i)}"/>`;
    if (fin > debut) s += `<line x1="${x(debut)}" x2="${x(fin)}" y1="${y}" y2="${y}" stroke="${couleurDe(i)}" stroke-width="2.5" opacity=".8"/>`;
    if (p.v && p.v[1] >= lo && p.v[1] <= hi) s += `<text x="${x(p.v[1] + 1) + 4}" y="${y + 4}" font-size="10" fill="${css("--muted")}">† ${p.v[1]}</text>`;
    const parAn = new Map(); for (const a of ans) parAn.set(a, (parAn.get(a) || 0) + 1);
    const mx = Math.max(1, ...parAn.values());
    for (const [a, n] of parAn) s += `<rect x="${x(a)}" y="${y - 3 - 9 * n / mx}" width="${Math.max(1, x(a + 1) - x(a) - 1)}" height="${9 * n / mx}" fill="${couleurDe(i)}" opacity=".25"><title>${esc(p.n)}, ${a} : ${n} lettres (tous correspondants)</title></rect>`;
  }
  // arcs : lettres entre les personnes affichées, regroupées par mois
  // regroupement : par mois (≤ 8 ans), par trimestre (≤ 20 ans), par année au-delà
  const span = hi - lo + 1, pas = span <= 8 ? "mois" : span <= 20 ? "trimestre" : "année";
  const tranche = d => { const a = +d.slice(0, 4), m = +(d.slice(5, 7) || 6); return pas === "mois" ? a + (m - 0.5) / 12 : pas === "trimestre" ? a + (Math.floor((m - 1) / 3) + 0.5) / 4 : a + 0.5; };
  const libelle = t => pas === "année" ? String(Math.floor(t)) : pas === "trimestre" ? `${Math.floor(t)}, T${Math.floor((t % 1) * 4) + 1}` : `${Math.floor(t)}-${String(Math.floor((t % 1) * 12) + 1).padStart(2, "0")}`;
  const sel = new Set(ids), arcs = new Map();
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++){
    const e = liens.get(cleLien(ids[a], ids[b])); if (!e) continue;
    for (const j of e.lettres){ if (!garder(j)) continue;
      const l = L[j], de = l[1].find(q => sel.has(q));
      const k = `${cleLien(ids[a], ids[b])}|${de}|${tranche(l[0])}`; arcs.set(k, (arcs.get(k) || 0) + 1); }
  }
  const maxN = Math.max(1, ...arcs.values());
  let nArcs = 0;
  for (const [k, n] of arcs){
    const [ka, kb, de, t] = k.split("|"); const a = +ka, b = +kb, exp = +de, dest = exp === a ? b : a;
    // sens : de haut en bas, l'arc bombe à droite ; de bas en haut, à gauche (les deux sens ne se superposent pas)
    const xx = x(+t), y1 = yrow.get(exp), y2 = yrow.get(dest), bombe = Math.min(28, 6 + Math.abs(y2 - y1) * 0.12) * (y2 > y1 ? 1 : -1);
    s += `<path d="M${xx},${y1} Q${xx + bombe},${(y1 + y2) / 2} ${xx},${y2}" fill="none" stroke="${couleurDe(exp)}" stroke-width="${(0.6 + 5 * Math.sqrt(n / maxN)).toFixed(2)}" opacity=".5" style="cursor:pointer" data-l="${cleLien(a, b)}"><title>${esc(P[exp].n)} → ${esc(P[dest].n)}, ${libelle(+t)} : ${n} lettre${n > 1 ? "s" : ""}</title></path>`;
    nArcs++;
  }
  s += "</svg>";
  el.innerHTML = `<div class="barre-outils" style="padding:8px 12px 0">
      <b>Lignes de vie</b><span class="petit muted">${ids.length} personnes · ${etat.debut}–${etat.fin} · ${nArcs} arcs : un arc = les lettres d'un${pas === "année" ? "e année" : pas === "trimestre" ? " trimestre" : " mois"} d'une personne à une autre (épaisseur = nombre, couleur = expéditeur ; bombé à droite vers le bas, à gauche vers le haut)</span>
      <input class="champ" id="vies-ajout" placeholder="Ajouter une personne…" autocomplete="off" style="max-width:220px"><div class="suggest" id="vies-sugg" style="position:absolute;z-index:20;margin-top:34px"></div>
      ${etat.vies ? `<button class="btn petit" id="vies-auto">choix automatique</button>` : ""}
    </div>
    <p class="petit muted" style="margin:2px 12px 0">${etat.vies ? "Sélection manuelle." : "Choix automatique : " + (etat.sel && etat.sel.type === "pole" ? "les figures du pôle choisi" : etat.cmp.length >= 2 ? "les personnes de la comparaison" : etat.sel && etat.sel.type === "p" ? "la personne choisie et ses principaux correspondants" : "les 8 figures les plus actives de la période, rangées par pôle")}. Cliquez un nom pour sa fiche, un arc pour les lettres ; ✕ pour retirer.</p>
    <div style="padding:0 12px">${s}</div>`;
  el.querySelectorAll("text[data-p]").forEach(t => { t.onclick = () => choisirPersonne(+t.dataset.p); t.oncontextmenu = ev => { ev.preventDefault(); retirerVie(+t.dataset.p); }; });
  el.querySelectorAll("path[data-l]").forEach(t => t.onclick = () => choisirLien(t.dataset.l));
  champPersonne($("#vies-ajout"), $("#vies-sugg"), i => { etat.vies = [...personnesVies().filter(x => x !== i), i]; dessinerVies(); });
  const au = $("#vies-auto"); if (au) au.onclick = () => { etat.vies = null; dessinerVies(); };
  // bouton retirer : petite croix à gauche des noms
  const svg = el.querySelector("svg");
  for (const i of ids){
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", 6); t.setAttribute("y", yrow.get(i) + 4); t.setAttribute("font-size", 11); t.setAttribute("fill", css("--muted")); t.style.cursor = "pointer";
    t.textContent = "✕"; t.onclick = () => retirerVie(i); svg.appendChild(t);
  }
}
function retirerVie(i){ etat.vies = personnesVies().filter(x => x !== i); dessinerVies(); }

// ======================================================================== Matrice
etat.matrice = "figures";
function dessinerMatrice(){
  const el = $("#matrice"), parPoles = etat.matrice === "poles";
  let unites;
  if (parPoles) unites = Object.keys(POLES_XY).filter(g => g !== "autre" && P.some((p, i) => p.g === g && compte.get(i)));
  else unites = P.map((p, i) => i).filter(i => P[i].cle && (compte.get(i) || 0) > 0)
    .sort((a, b) => Object.keys(POLES_XY).indexOf(P[a].g) - Object.keys(POLES_XY).indexOf(P[b].g) || (compte.get(b) - compte.get(a)));
  const pos = new Map(unites.map((u, k) => [u, k])), n = unites.length;
  const M = Array.from({length: n}, () => new Float32Array(n));
  L.forEach((l, j) => {
    if (!garder(j)) return;
    const a = parPoles ? [...new Set(l[1].map(x => P[x].g))] : l[1], b = parPoles ? [...new Set(l[2].map(x => P[x].g))] : l[2];
    for (const x of a) { const r = pos.get(x); if (r === undefined) continue;
      for (const y of b) { const c = pos.get(y); if (c === undefined || (c === r && !parPoles)) continue; M[r][c]++; } }
  });
  let max = 1; for (const row of M) for (const v of row) if (v > max) max = v;
  const marge = parPoles ? 190 : 150, cell = Math.max(parPoles ? 22 : 6, Math.min(parPoles ? 40 : 14, Math.floor((Math.min(el.clientWidth, el.clientHeight + 200) - marge - 40) / n)));
  const nom = u => parPoles ? (NOMS_GROUPES[u] || u) : P[u].n;
  const col = u => parPoles ? COULEURS[u] : COULEURS[P[u].g];
  const teinte = v => { if (!v) return "transparent"; const t = Math.log(1 + v) / Math.log(1 + max); return melange(css("--accent"), css("--bg") || "#f6f1e7", 0.12 + 0.88 * t); };
  const W = marge + n * cell + 10, H = marge + n * cell + 10;
  let s = `<svg width="${W}" height="${H}" style="display:block;font-family:Georgia,serif">`;
  unites.forEach((u, k) => {
    const y = marge + k * cell + cell / 2 + 4;
    s += `<text x="${marge - 6}" y="${y}" font-size="${Math.min(12, cell)}" text-anchor="end" fill="${col(u)}">${esc(nom(u).slice(0, 26))}</text>`;
    s += `<text transform="translate(${marge + k * cell + cell / 2 + 4},${marge - 6}) rotate(-60)" font-size="${Math.min(12, cell)}" fill="${col(u)}">${esc(nom(u).slice(0, 26))}</text>`;
  });
  // séparations de pôles
  if (!parPoles) unites.forEach((u, k) => { if (k && P[u].g !== P[unites[k - 1]].g){ const z = marge + k * cell;
    s += `<line x1="${marge}" x2="${marge + n * cell}" y1="${z}" y2="${z}" stroke="${css("--muted")}" stroke-width=".6"/><line y1="${marge}" y2="${marge + n * cell}" x1="${z}" x2="${z}" stroke="${css("--muted")}" stroke-width=".6"/>`; } });
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++){
    const v = M[r][c]; if (!v) continue;
    s += `<rect x="${marge + c * cell}" y="${marge + r * cell}" width="${cell - 1}" height="${cell - 1}" fill="${teinte(v)}" data-r="${r}" data-c="${c}" style="cursor:pointer"><title>${esc(nom(unites[r]))} → ${esc(nom(unites[c]))} : ${v} lettre${v > 1 ? "s" : ""}${!parPoles ? ` (et ${M[c][r]} en retour)` : ""}</title></rect>`;
  }
  s += `<rect x="${marge}" y="${marge}" width="${n * cell}" height="${n * cell}" fill="none" stroke="${css("--line")}"/></svg>`;
  const decs = []; for (let d = 1510; d <= 1590; d += 10) decs.push(d);
  el.innerHTML = `<div class="barre-outils" style="padding:8px 12px 0">
      <b>Matrice des échanges</b>
      <select class="champ" id="mat-unite" style="width:auto"><option value="figures" ${!parPoles ? "selected" : ""}>figures clés</option><option value="poles" ${parPoles ? "selected" : ""}>pôles</option></select>
      <span class="petit">décennie :</span>${decs.map(d => `<button class="btn petit ${etat.debut === d && etat.fin === d + 9 ? "actif" : ""}" data-dec="${d}">${d}s</button>`).join("")}
      <button class="btn petit" data-dec="tout">tout</button>
    </div>
    <p class="petit muted" style="margin:2px 12px 6px">Ligne = expéditeur, colonne = destinataire ; plus la case est foncée, plus il y a de lettres (${etat.debut}–${etat.fin}, max ${max}). L'asymétrie de part et d'autre de la diagonale montre qui écrit davantage. ${parPoles ? "La diagonale compte les lettres internes à chaque pôle." : "Figures rangées par pôle."} Cliquez une case pour ses lettres.</p>
    <div style="padding:0 12px 12px;overflow:auto">${s}</div>`;
  $("#mat-unite").onchange = e => { etat.matrice = e.target.value; dessinerMatrice(); };
  el.querySelectorAll("[data-dec]").forEach(b => b.onclick = () => b.dataset.dec === "tout" ? fixerPeriode(A0, A1) : fixerPeriode(+b.dataset.dec, +b.dataset.dec + 9));
  el.querySelectorAll("rect[data-r]").forEach(r => r.onclick = () => {
    const a = unites[+r.dataset.r], b = unites[+r.dataset.c];
    if (parPoles){ if (a === b) ouvrirPole(a); else { etat.sel = {type: "pp", k: "pp:" + [a, b].sort().join("|"), g: [a, b]}; etat.panneau = null; maj(); } }
    else choisirLien(cleLien(a, b));
  });
}

// ======================================================================== Parcours guidés
/* Chaque étape règle la vue ; {n:A|B} est remplacé par le nombre de lettres conservées entre A et B sur la période de l'étape. */
const PARCOURS = [
  {titre: "Marbourg 1529 : l'unité manquée", etapes: [
    {de: 1524, a: 1529, vue: "vies", vies: ["Martin Luther", "Huldrych Zwingli", "Johannes Oekolampad", "Martin Bucer", "Philipp Melanchthon", "Philippe de Hesse"],
     texte: "À partir de 1525, la querelle sur la Cène oppose Luther à Zwingli et à Œcolampade. Elle se mène surtout par traités imprimés : entre Luther et Zwingli, le corpus ne conserve que {n:Martin Luther|Huldrych Zwingli} lettre(s) sur 1524–1529. Les arcs montrent qui, en revanche, s'écrit beaucoup."},
    {de: 1529, a: 1529, vue: "graphe", mode: "cles", p: "Philippe de Hesse",
     texte: "Philippe de Hesse, qui cherche une alliance politique des protestants, réunit les théologiens à Marbourg (1er–4 octobre 1529). Sa fiche montre ses correspondants de l'année."},
    {de: 1529, a: 1536, vue: "graphe", mode: "cles", l: "Martin Bucer|Martin Luther",
     texte: "Après l'échec du colloque, Bucer devient le médiateur entre Strasbourg, la Suisse et Wittenberg, jusqu'à la Concorde de Wittenberg (mai 1536) : {n:Martin Bucer|Martin Luther} lettre(s) conservée(s) entre Bucer et Luther sur 1529–1536, {n:Martin Bucer|Philipp Melanchthon} avec Melanchthon."},
    {de: 1529, a: 1536, vue: "matrice", matrice: "poles",
     texte: "Vue d'ensemble : la matrice des pôles sur 1529–1536. Comparez les échanges Wittenberg ↔ Strasbourg et Wittenberg ↔ Zurich."}]},
  {titre: "Calvin exilé à Strasbourg (1538–1541)", etapes: [
    {de: 1536, a: 1545, vue: "vies", vies: ["Jean Calvin", "Guillaume Farel", "Pierre Viret", "Martin Bucer", "Wolfgang Capito", "Heinrich Bullinger"],
     texte: "Chassés de Genève en avril 1538, Calvin et Farel se séparent : Farel part à Neuchâtel, Calvin rejoint Bucer à Strasbourg (septembre 1538). Il ne revient à Genève qu'en septembre 1541."},
    {de: 1538, a: 1541, vue: "graphe", mode: "cles", l: "Jean Calvin|Guillaume Farel",
     texte: "La séparation se lit dans la correspondance : {n:Jean Calvin|Guillaume Farel} lettre(s) conservée(s) entre Calvin et Farel sur 1538–1541. La fiche du lien montre le rythme et les silences."},
    {de: 1538, a: 1541, vue: "graphe", mode: "complet", p: "Jean Calvin", ego: 1,
     texte: "Le réseau personnel de Calvin pendant l'exil : qui lui écrit, et d'où ?"}]},
  {titre: "L'Intérim d'Augsbourg (1548) et la dispersion", etapes: [
    {de: 1543, a: 1547, vue: "graphe", mode: "poles",
     texte: "Avant la défaite de la Ligue de Smalkalde (Mühlberg, avril 1547) : les échanges entre pôles sur 1543–1547."},
    {de: 1548, a: 1552, vue: "graphe", mode: "poles",
     texte: "Après l'Intérim (1548), plusieurs réformateurs du Sud de l'Allemagne doivent partir : Bucer pour l'Angleterre (1549), Blarer quitte Constance. Comparez avec l'étape précédente."},
    {de: 1546, a: 1551, vue: "graphe", mode: "complet", p: "Martin Bucer", ego: 1,
     texte: "Le réseau de Bucer entre la guerre de Smalkalde et sa mort à Cambridge (février 1551)."}]},
  {titre: "Érasme et Luther : du dialogue à la rupture", etapes: [
    {de: 1516, a: 1530, vue: "vies", vies: ["Érasme", "Martin Luther", "Philipp Melanchthon", "Huldrych Zwingli", "Wolfgang Capito", "Johannes Oekolampad", "Beatus Rhenanus"],
     texte: "Érasme publie le *De libero arbitrio* en 1524 ; Luther répond par le *De servo arbitrio* (décembre 1525). Entre eux, le corpus conserve {n:Érasme|Martin Luther} lettre(s) sur 1516–1530 : le dialogue passe surtout par des intermédiaires."},
    {de: 1516, a: 1530, vue: "graphe", mode: "cles", l: "Érasme|Philipp Melanchthon",
     texte: "Melanchthon reste en contact avec Érasme : {n:Érasme|Philipp Melanchthon} lettre(s) sur 1516–1530."}]},
  {titre: "Les exilés anglais (1553–1559)", etapes: [
    {de: 1553, a: 1560, vue: "carte",
     texte: "Sous Marie Tudor (1553–1558), des protestants anglais se réfugient à Zurich, Strasbourg, Francfort et Genève. La carte montre les lieux d'expédition et de réception sur 1553–1560."},
    {de: 1553, a: 1575, vue: "graphe", mode: "complet", p: "Heinrich Bullinger", ego: 1,
     texte: "Bullinger devient le correspondant privilégié des évêques anglais revenus sous Élisabeth (Zurich Letters) : son réseau personnel sur 1553–1575."}]},
];
let parcoursActif = null;
function idParNom(nom){ const k = P.findIndex(p => p.n === nom && p.cle); return k >= 0 ? k : P.findIndex(p => p.n === nom); }
function compterPaire(a, b, de, fin){
  const ia = idParNom(a), ib = idParNom(b); if (ia < 0 || ib < 0) return 0;
  const e = liens.get(cleLien(ia, ib)); if (!e) return 0;
  return e.lettres.filter(i => { const y = annee(L[i][0]); return y >= de && y <= fin; }).length;
}
function appliquerEtape(){
  const {p: idx, k} = parcoursActif, t = PARCOURS[idx], e = t.etapes[k];
  etat.vies = e.vies ? e.vies.map(idParNom).filter(i => i >= 0) : null;
  if (e.matrice) etat.matrice = e.matrice;
  etat.sel = null; etat.ego = e.ego || 0; etat.panneau = null; etat.cmp = [];
  if (e.p) etat.sel = {type: "p", id: idParNom(e.p)};
  if (e.l){ const [a, b] = e.l.split("|").map(idParNom); if (liens.has(cleLien(a, b))) etat.sel = {type: "l", k: cleLien(a, b)}; }
  etat.debut = e.de; etat.fin = e.a; $("#debut").value = e.de; $("#fin").value = e.a;
  if (e.mode && e.mode !== etat.mode) changerMode(e.mode);
  changerVue(e.vue === "vies" ? "vies" : e.vue);
  const texte = e.texte.replace(/\{n:([^|}]+)\|([^}]+)\}/g, (_, a, b) => `<b>${compterPaire(a, b, e.de, e.a)}</b>`).replace(/\*([^*]+)\*/g, "<i>$1</i>");
  $("#parcours").innerHTML = `<div class="petit muted">Parcours · ${esc(t.titre)} · étape ${k + 1}/${t.etapes.length}</div>
    <p style="margin:6px 0">${texte}</p>
    <div class="ligne" style="justify-content:space-between"><button class="btn petit" id="pc-q">quitter</button>
      <span><button class="btn petit" id="pc-p" ${k ? "" : "disabled"}>◀ précédent</button> <button class="btn petit actif" id="pc-s">${k + 1 < t.etapes.length ? "suivant ▶" : "terminer"}</button></span></div>`;
  $("#parcours").style.display = "block";
  $("#pc-q").onclick = () => { parcoursActif = null; $("#parcours").style.display = "none"; };
  $("#pc-p").onclick = () => { parcoursActif.k--; appliquerEtape(); };
  $("#pc-s").onclick = () => { if (k + 1 < t.etapes.length){ parcoursActif.k++; appliquerEtape(); } else $("#pc-q").onclick(); };
}
function choisirParcours(){
  ouvrirModal(`<h3>Parcours guidés</h3><p class="petit">Chaque parcours règle la période, la vue et la sélection, étape par étape. Les nombres de lettres sont calculés en direct sur les données (lettres conservées et collectées, pas la correspondance réelle).</p>` +
    PARCOURS.map((t, k) => `<div class="cartouche" style="cursor:pointer" data-t="${k}"><b>${esc(t.titre)}</b><br><span class="petit muted">${t.etapes.length} étapes</span></div>`).join("") +
    `<div class="actions"><button class="btn" id="pc-fermer">Fermer</button></div>`);
  $("#pc-fermer").onclick = fermerModal;
  document.querySelectorAll("[data-t]").forEach(el => el.onclick = () => { fermerModal(); parcoursActif = {p: +el.dataset.t, k: 0}; appliquerEtape(); });
}
$("#b-parcours").onclick = choisirParcours;

// premier dessin si la vue demandée par l'adresse est l'une de celles-ci
if (etat.vue === "vies" || etat.vue === "matrice") changerVue(etat.vue);
