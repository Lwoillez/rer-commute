# RER Hacquinière ↔ La Défense

Site personnel pour suivre le trajet La Hacquinière (RER B) ↔ La Défense (RER A), avec correspondance à Châtelet - Les Halles.

Affiche : les 4 prochains départs, les trains à la correspondance (-30 / +45 min autour de l'arrivée estimée), l'heure d'arrivée prévue, et l'état du trafic RER A / RER B. Rafraîchissement manuel uniquement (pas de polling automatique).

Données en temps réel : API officielle [PRIM (Île-de-France Mobilités)](https://prim.iledefrance-mobilites.fr).

## Installation locale

1. Copiez `config.example.js` en `config.local.js`.
2. Créez un compte gratuit sur [prim.iledefrance-mobilites.fr](https://prim.iledefrance-mobilites.fr), générez un jeton API, et collez-le dans `config.local.js` (`apiKey`).
3. Servez le dossier avec n'importe quel serveur statique, par exemple :
   ```bash
   npx serve .
   ```
4. Ouvrez la page servie dans votre navigateur.

`config.local.js` contient votre clé personnelle et n'est jamais commité (voir `.gitignore`).
