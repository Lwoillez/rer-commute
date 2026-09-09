// Configuration du trajet La Hacquinière <-> La Défense (correspondance à Châtelet-Les Halles)
// Ce fichier ne contient aucune donnée secrète : il est suivi par Git et servi tel quel.
// La clé API PRIM est ajoutée séparément par config.local.js (local, non commité) ou,
// en production, n'est pas nécessaire côté client (voir /api/prim.js).
const CONFIG = {
  stops: {
    // transilienId : identifiant utilisé par l'API "fiches horaires" de Transilien
    // (horaires théoriques, journée complète), en repli quand le temps réel PRIM
    // (horizon ~2h30) ne couvre pas l'heure demandée.
    hacquiniere: { ref: 'STIF:StopArea:SP:47046:', name: 'La Hacquinière', transilienId: 'stop_area:IDFM:62825' },
    chatelet: { ref: 'STIF:StopArea:SP:45102:', name: 'Châtelet - Les Halles', transilienId: 'stop_area:IDFM:474151' },
    ladefense: { ref: 'STIF:StopArea:SP:470549:', name: 'La Défense', transilienId: 'stop_area:IDFM:71517' },
  },

  lines: {
    A: { ref: 'STIF:Line::C01742:', idfmId: 'line:IDFM:C01742', label: 'RER A' },
    B: { ref: 'STIF:Line::C01743:', idfmId: 'line:IDFM:C01743', label: 'RER B' },
  },

  // Durées de trajet estimées (en minutes) entre les gares - ajustables dans les réglages de la page.
  defaultDurations: {
    hacquiniereToChatelet: 35,
    chateletToLadefense: 9,
  },

  // Terminus possibles par branche, utilisés pour déterminer le sens d'un train
  // (le champ DirectionRef renvoyé par l'API PRIM s'est révélé peu fiable pour le RER A :
  // des trains de branches opposées apparaissaient sous la même valeur "Aller"/"Retour").
  termini: {
    aWest: ['poissy', 'cergy', 'saint-germain-en-laye', 'st-germain-en-laye'], // vers/via La Défense
    aEast: ['boissy', 'marne-la-vallee', 'chessy', 'torcy', 'val de fontenay', 'noisy'], // à l'opposé de La Défense
    bNorth: ['aeroport charles de gaulle', 'roissy', 'mitry', 'aulnay', 'villepinte'], // vers Paris/nord, à l'opposé de La Hacquinière
    // Seuls les trains signés Saint-Rémy-lès-Chevreuse (ou Gif-sur-Yvette, terminus court rare) passent par La Hacquinière :
    // Robinson est une autre branche, et Massy-Palaiseau / Orsay-Ville / Le Guichet / Bures-sur-Yvette sont des terminus
    // situés avant La Hacquinière sur la branche - ces trains ne s'y arrêtent pas.
    bSouth: ['saint-remy', 'st-remy', 'gif-sur-yvette'], // vers/via La Hacquinière
  },

  routes: {
    aller: {
      label: 'Aller (matin) : La Hacquinière → La Défense',
      leg1: { stopKey: 'hacquiniere', lineKey: 'B', towardsKey: 'bNorth' },
      correspondanceKey: 'chatelet',
      leg2: { stopKey: 'chatelet', lineKey: 'A', towardsKey: 'aWest' },
      destinationKey: 'ladefense',
      durationKeys: { leg1: 'hacquiniereToChatelet', leg2: 'chateletToLadefense' },
      // RER A très fréquent à Châtelet : fenêtre resserrée autour de l'arrivée estimée.
      correspondanceWindow: { beforeMin: 10, afterMin: 15 },
    },
    retour: {
      label: 'Retour (soir) : La Défense → La Hacquinière',
      leg1: { stopKey: 'ladefense', lineKey: 'A', towardsKey: 'aEast' },
      correspondanceKey: 'chatelet',
      leg2: { stopKey: 'chatelet', lineKey: 'B', towardsKey: 'bSouth' },
      destinationKey: 'hacquiniere',
      durationKeys: { leg1: 'chateletToLadefense', leg2: 'hacquiniereToChatelet' },
      // RER B moins fréquent : fenêtre plus large pour garantir des options.
      correspondanceWindow: { beforeMin: 30, afterMin: 45 },
    },
  },

  // Nom des gares desservies par les RER A et B, indexé par identifiant StopArea numérique
  // (extrait de https://data.iledefrance-mobilites.fr, dataset "arrets-lignes").
  // Utilisé pour afficher le détail des arrêts de chaque train.
  stopNames: {
    '47897': 'Cergy Saint-Christophe', '46647': 'Achères Ville', '44801': 'Saint-Maur - Créteil',
    '43234': 'Le Parc de Saint-Maur', '43146': 'La Varenne - Chennevières', '47915': 'Achères Grand Cormier',
    '43191': 'Sartrouville', '43082': 'Houilles - Carrières-sur-Seine', '43171': 'Nanterre - Ville',
    '43170': 'Nanterre Université', '43135': 'Joinville-le-Pont', '473109': 'Maisons-Laffitte',
    '45873': 'Auber', '474082': "Noisy-le-Grand - Mont d'Est", '44559': 'Cergy Préfecture',
    '43237': 'Le Vésinet - Le Pecq', '58875': 'Rueil-Malmaison', '47238': 'Fontenay-sous-Bois',
    '47886': 'Nogent-sur-Marne', '58792': 'Sucy - Bonneuil', '43094': 'Boissy-Saint-Léger',
    '45102': 'Châtelet - Les Halles', '43172': 'Neuilly-Plaisance', '58937': 'Noisy - Champs',
    '43104': 'Cergy le Haut', '43198': 'Saint-Germain-en-Laye', '53783': 'Chatou - Croissy',
    '47874': 'Poissy', '470195': 'Gare de Lyon', '473875': 'Nation', '43224': 'Vincennes',
    '43101': 'Bry-sur-Marne', '43152': 'Lognes', '43207': 'Torcy', '58874': 'Bussy-Saint-Georges',
    '43213': "Val d'Europe", '47879': 'Neuville - Université', '43114': "Conflans Fin d'Oise",
    '53784': 'Le Vésinet - Centre', '58270': 'Champigny', '43169': 'Nanterre - Préfecture',
    '470549': 'La Défense', '58759': 'Charles de Gaulle - Étoile', '47900': 'Val de Fontenay',
    '44199': 'Noisiel', '43239': 'Marne-la-Vallée - Chessy',
    '43228': 'Les Baconnets', '474069': 'Lozère', '43232': 'Le Guichet', '47888': 'Gif-sur-Yvette',
    '473890': 'Denfert-Rochereau', '46163': 'Le Blanc-Mesnil', '43194': 'Sevran - Livry',
    '46007': 'La Croix de Berny', '47940': 'Massy - Verrières', '43103': 'Bures-sur-Yvette',
    '47052': 'Courcelle-sur-Yvette', '43125': 'Fontenay-aux-Roses', '44493': 'Bagneux',
    '43607': 'Laplace', '43231': 'Le Bourget', '43122': 'Drancy',
    '473364': 'Aéroport Charles de Gaulle 2 (Terminal 2)', '43175': 'Palaiseau - Villebon',
    '47889': 'Saint-Rémy-lès-Chevreuse', '44877': 'Saint-Michel Notre-Dame',
    '43140': 'La Courneuve - Aubervilliers', '43071': 'Aulnay-sous-Bois',
    '46725': 'Villeparisis - Mitry-le-Neuf', '43124': 'Fontaine Michalon', '58774': 'Massy - Palaiseau',
    '43086': 'Orsay - Ville', '47046': 'La Hacquinière', '43186': 'Robinson', '59206': 'Sceaux',
    '43067': 'Arcueil - Cachan', '473843': 'Cité Universitaire', '43833': 'Luxembourg',
    '43145': 'La Plaine Stade de France', '58793': 'Villepinte', '43177': 'Parc de Sceaux',
    '43066': 'Antony', '47009': 'Palaiseau', '43097': 'Bourg-la-Reine', '45877': 'Gentilly',
    '44500': 'Port Royal', '462394': 'Gare du Nord', '46222': 'Vert-Galant', '43164': 'Mitry - Claye',
    '43193': 'Sevran - Beaudottes', '47878': 'Parc des Expositions', '462398': 'Aéroport CDG 1 (Terminal 3) - RER',
  },

  trafficLinks: {
    A: [
      { label: 'RATP.fr', url: 'https://www.ratp.fr/infos-trafic' },
      { label: 'Transilien.com', url: 'https://www.transilien.com/fr#traffic-info-app' },
    ],
    B: [
      { label: 'RATP.fr', url: 'https://www.ratp.fr/infos-trafic' },
      { label: 'Transilien.com', url: 'https://www.transilien.com/fr#traffic-info-app' },
    ],
  },
};
