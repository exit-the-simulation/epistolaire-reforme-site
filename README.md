# Navigateur épistolaire

Ouvrir `index.html` dans un navigateur (double-clic, ou servi par `python3 -m http.server`). Les données sont dans `data.js`, produit par `python3 scripts/construire_site.py` ; la logique est dans `app.js`. Une connexion est nécessaire pour les bibliothèques (sigma, graphology, Leaflet) et le fond de carte (Esri « Canvas », sans clé ; les serveurs d'openstreetmap.org refusent les pages ouvertes en `file://`).

## Vues
- **Graphe à trois niveaux** : 1. **Pôles** (vue d'ensemble : un cercle par pôle, un trait par paire de pôles) → clic → 2. **Figures clés** du pôle sur la carte schématique → « Voir tout son réseau » → 3. **cible** de la personne. Le niveau « Réseau complet » reste disponible.
- **Lignes de vie** : une ligne par personne dans le temps ; un arc par mois, trimestre ou année de lettres entre deux personnes (couleur de l'expéditeur) ; silences visibles.
- **Matrice** : expéditeurs en ligne, destinataires en colonne, par décennie ; figures clés ou pôles.
- **Parcours guidés** : Marbourg 1529, Calvin à Strasbourg, l'Intérim, Érasme et Luther, les exilés anglais. Chiffres calculés en direct.
- **Deux lectures du graphe** :
  - « **Figures clés** » (par défaut) : les 89 figures, placées par pôle sur une carte schématique fixe (Angleterre en haut à gauche, Wittenberg en haut à droite, Suisse au centre, catholiques en bas), reliées par les lettres échangées entre elles ;
  - « **Réseau complet** » : toutes les personnes.
  - Sur une fiche, « Voir tout son réseau » affiche le **réseau personnel en cible** : la personne au centre, ses correspondants groupés par pôle, d'autant plus près qu'ils ont échangé de lettres avec elle.
- **Graphe** : une personne par nœud (taille = lettres sur la période), un lien par paire de correspondants. Couleurs : pôles géographiques, ou communautés détectées automatiquement (algorithme de Louvain).
- **Lettres** : tableau de la sélection, triable et filtrable, exportable en CSV (avec une citation prête à l'emploi pour chaque lettre).
- **Carte** : lieux d'expédition et de réception (coordonnées GeoNames, `data/lieux_geo.csv`), trajets ; un clic sur un lieu donne ses lettres et ses personnes.

## Explorer
- **Personne** : frise à deux sens (lettres écrites en haut, reçues en bas), correspondants avec ↗ écrit / ↙ reçu, **réseau personnel** (la personne et ses correspondants, éventuellement leurs propres correspondants), **chemin** vers une autre personne (par qui passe le lien), ajout à une **comparaison**.
- **Lien** : rythme de l'échange dans les deux sens, première et dernière lettre, année la plus dense, **silences** de 3 ans ou plus, liste des lettres.
- **Comparer** : jusqu'à 4 personnes sur le même axe du temps, à la même échelle ou chacune à son échelle ; liens directs et correspondants communs.
- **Événements** : filtrables par thème (politique, théologique, personnel) ; un clic ouvre la fiche (source encyclopédique, personnes concernées).

## Citer, partager, vérifier
- « **⧉ Lien de cette vue** » copie une adresse qui restitue la période, la personne ou le lien sélectionné, les filtres et l'onglet.
- « **citer** » sous chaque lettre copie une référence complète ; « **page numérisée ↗** » ouvre la page du volume (ou une recherche de l'en-tête dans le volume quand le numéro de page n'est pas connu).
- **Fiabilité** : date exacte ; au mois ou à l'année près ; « ≈ » et italique pour une date estimée ou restituée ; ⚠ pour une extraction douteuse ; ✎ pour une lettre corrigée après relecture. Le menu « Fiabilité des données » exclut les dates estimées ou toutes les données douteuses ; la frise montre en teinte claire la part des dates estimées.
- **Limites du corpus** : page qui explique comment lire le réseau (sources inégales, lettres conservées et non réelles).

## Corriger
- « **signaler une erreur** » (sous une lettre ou sur une fiche) et « **Doublons** » (paires de personnes probablement identiques, à valider) enregistrent les décisions dans le navigateur.
- « **Corrections** » les exporte : `corrections.csv`, `fusions.csv`, `fusions_rejetees.csv`, à déposer dans `data/`, ou un ticket GitHub prérempli. `construire_site.py` les applique à la reconstruction suivante.
