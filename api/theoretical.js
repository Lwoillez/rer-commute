// Proxy serverless : relaie vers l'API "fiches horaires" de Transilien (horaires théoriques,
// journée complète, sans correspondance) pour un couple gare de départ / gare d'arrivée direct.
// Sert de repli quand le temps réel PRIM (horizon ~2h30) ne couvre pas l'heure demandée.
// Pas de clé nécessaire ; on passe par le serveur uniquement pour contourner le CORS du site.
export default async function handler(req, res) {
  const { originId, originLabel, destId, destLabel, date } = req.query || {};

  if (!originId || !destId || !date) {
    res.status(400).json({ error: 'Paramètres manquants (originId, destId, date).' });
    return;
  }

  const body = {
    idUic7Departure: originId,
    departure: originLabel || '',
    idStopPointDestination: destId,
    destination: destLabel || '',
    date,
    completeDayResearch: true,
    returnDate: date,
  };

  try {
    const r = await fetch('https://www.transilien.com/api/timetablesheets/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
