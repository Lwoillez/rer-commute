// Fonction serverless Vercel : relaie les appels vers l'API PRIM en injectant la clé
// côté serveur (variable d'environnement PRIM_API_KEY), pour ne jamais exposer la clé
// dans le code envoyé au navigateur.
const ALLOWED_PATHS = new Set([
  'stop-monitoring',
  'general-message',
  'estimated-timetable',
  'disruptions_bulk/disruptions/v2',
]);

export default async function handler(req, res) {
  const { path, ...query } = req.query || {};

  if (!path || Array.isArray(path) || !ALLOWED_PATHS.has(path)) {
    res.status(400).json({ error: 'Paramètre "path" manquant ou non autorisé.' });
    return;
  }

  if (!process.env.PRIM_API_KEY) {
    res.status(500).json({ error: "Variable d'environnement PRIM_API_KEY manquante." });
    return;
  }

  const qs = new URLSearchParams(query).toString();
  const url = `https://prim.iledefrance-mobilites.fr/marketplace/${path}${qs ? `?${qs}` : ''}`;

  try {
    const r = await fetch(url, { headers: { apiKey: process.env.PRIM_API_KEY } });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
