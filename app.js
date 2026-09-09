const PRIM_BASE = 'https://prim.iledefrance-mobilites.fr/marketplace';
const TRANSFER_BUFFER_MIN = 3; // temps minimum pour changer de quai à la correspondance
const PARIS_TZ = 'Europe/Paris';

// En local (npx serve), on appelle directement l'API PRIM avec la clé de config.local.js.
// Une fois déployé (Vercel), on passe par /api/prim, qui garde la clé côté serveur.
const IS_LOCAL_DEV = ['localhost', '127.0.0.1'].includes(location.hostname)
  && typeof CONFIG !== 'undefined' && !!CONFIG.apiKey;

async function primFetch(path, params) {
  if (IS_LOCAL_DEV) {
    const qs = new URLSearchParams(params).toString();
    return fetch(`${PRIM_BASE}/${path}${qs ? `?${qs}` : ''}`, { headers: { apiKey: CONFIG.apiKey } });
  }
  const qs = new URLSearchParams({ path, ...params }).toString();
  return fetch(`/api/prim?${qs}`);
}

const state = {
  sens: localStorage.getItem('rer.sens') || defaultSens(),
  durations: loadDurations(),
};

function defaultSens() {
  const hour = new Date().getHours();
  return hour < 14 ? 'aller' : 'retour';
}

function loadDurations() {
  const stored = localStorage.getItem('rer.durations');
  if (stored) {
    try { return { ...CONFIG.defaultDurations, ...JSON.parse(stored) }; } catch (e) { /* ignore */ }
  }
  return { ...CONFIG.defaultDurations };
}

function saveDurations() {
  localStorage.setItem('rer.durations', JSON.stringify(state.durations));
}

function fmtTime(dateLike) {
  if (!dateLike) return '--:--';
  const d = (dateLike instanceof Date) ? dateLike : new Date(dateLike);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: PARIS_TZ });
}

function fmtDayTime(dateLike) {
  if (!dateLike) return '';
  const d = (dateLike instanceof Date) ? dateLike : new Date(dateLike);
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: PARIS_TZ });
}

function stopIdFromRef(ref) {
  return (ref || '').replace(/^STIF:StopArea:SP:/, '').replace(/:$/, '');
}

async function fetchStopMonitoring(stopRef, lineRef) {
  const res = await primFetch('stop-monitoring', { MonitoringRef: stopRef, LineRef: lineRef });
  if (!res.ok) throw new Error(`Horaires indisponibles (HTTP ${res.status})`);
  const data = await res.json();
  const visits = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
  return visits
    .map((v) => {
      const mvj = v.MonitoredVehicleJourney || {};
      const call = mvj.MonitoredCall || {};
      return {
        direction: mvj.DirectionRef?.value || '',
        destination: mvj.DestinationName?.[0]?.value || mvj.DirectionName?.[0]?.value || '',
        expectedDeparture: call.ExpectedDepartureTime || call.AimedDepartureTime || null,
        platform: call.DeparturePlatformName?.value || '',
        status: call.DepartureStatus || '',
        journeyRef: mvj.FramedVehicleJourneyRef?.DatedVehicleJourneyRef || null,
      };
    })
    .filter((t) => t.expectedDeparture);
}

async function fetchEstimatedTimetable(lineRef) {
  const res = await primFetch('estimated-timetable', { LineRef: lineRef });
  if (!res.ok) throw new Error(`Détail des arrêts indisponible (HTTP ${res.status})`);
  const data = await res.json();
  const frames = data?.Siri?.ServiceDelivery?.EstimatedTimetableDelivery?.[0]?.EstimatedJourneyVersionFrame || [];
  const map = new Map();
  frames.forEach((frame) => {
    (frame.EstimatedVehicleJourney || []).forEach((j) => {
      const ref = j.DatedVehicleJourneyRef?.value;
      if (!ref) return;
      const calls = (j.EstimatedCalls?.EstimatedCall || [])
        .map((c) => {
          const id = stopIdFromRef(c.StopPointRef?.value);
          return {
            name: CONFIG.stopNames[id] || c.StopPointRef?.value || 'Arrêt inconnu',
            time: c.ExpectedArrivalTime || c.AimedArrivalTime || c.ExpectedDepartureTime || c.AimedDepartureTime || null,
          };
        })
        // L'ordre renvoyé par l'API n'est pas garanti chronologique : on trie par horaire.
        .sort((a, b) => new Date(a.time) - new Date(b.time));
      map.set(ref, calls);
    });
  });
  return map;
}

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function matchesTermini(destination, terminiList) {
  const norm = normalize(destination);
  return terminiList.some((t) => norm.includes(normalize(t)));
}

function towardsDestination(trains, terminiList) {
  const now = Date.now();
  return trains
    .filter((t) => matchesTermini(t.destination, terminiList))
    // Ne garder que les départs strictement après l'heure actuelle.
    .filter((t) => new Date(t.expectedDeparture).getTime() > now)
    .sort((a, b) => new Date(a.expectedDeparture) - new Date(b.expectedDeparture));
}

async function fetchTraffic(lineRef) {
  const res = await primFetch('general-message', { LineRef: lineRef });
  if (!res.ok) throw new Error(`Trafic indisponible (HTTP ${res.status})`);
  const data = await res.json();
  const msgs = data?.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
  return msgs.map((m) => {
    const content = m.Content || {};
    const messages = content.Message || [];
    const short = messages.find((x) => x.MessageType === 'SHORT_MESSAGE') || messages[0] || {};
    return {
      channel: m.InfoChannelRef?.value || '',
      text: short.MessageText?.value || '',
      validUntil: m.ValidUntilTime || null,
    };
  });
}

function parseNaiveLocal(str) {
  // Format "20260912T070000", exprimé en heure locale de Paris (pas de suffixe timezone).
  if (!str || str.length < 15) return null;
  const y = +str.slice(0, 4);
  const mo = +str.slice(4, 6) - 1;
  const d = +str.slice(6, 8);
  const h = +str.slice(9, 11);
  const mi = +str.slice(11, 13);
  const s = +str.slice(13, 15);
  return new Date(y, mo, d, h, mi, s);
}

async function fetchDisruptionsBulk() {
  const res = await primFetch('disruptions_bulk/disruptions/v2', {});
  if (!res.ok) throw new Error(`Perturbations indisponibles (HTTP ${res.status})`);
  const data = await res.json();
  return data.disruptions || [];
}

// Ne garde que les perturbations dont la ligne est concernée ET dont l'une des
// périodes d'application couvre l'instant présent (statut réellement "en cours").
function activeDisruptionsForLine(all, idfmLineId) {
  const now = Date.now();
  return all
    .filter((d) => JSON.stringify(d).includes(idfmLineId))
    .filter((d) => (d.applicationPeriods || []).some((p) => {
      const begin = parseNaiveLocal(p.begin)?.getTime();
      const end = parseNaiveLocal(p.end)?.getTime();
      return begin != null && end != null && now >= begin && now <= end;
    }))
    .map((d) => ({
      title: d.title || d.shortMessage || '',
      text: d.shortMessage || d.title || '',
      severity: d.severity || '',
      cause: d.cause || '',
    }));
}

function statusLabel(status) {
  if (status === 'onTime') return { text: 'à l\'heure', className: 'status-ontime' };
  if (status === 'delayed') return { text: 'retardé', className: 'status-delayed' };
  if (status === 'cancelled') return { text: 'supprimé', className: 'status-cancelled' };
  return status ? { text: status, className: '' } : null;
}

function callsBetween(calls, fromName, toName) {
  if (!calls) return null;
  const fromIdx = calls.findIndex((c) => normalize(c.name) === normalize(fromName));
  const toIdx = calls.findIndex((c) => normalize(c.name) === normalize(toName));
  // Si l'arrêt d'arrivée n'apparaît pas dans les données disponibles pour ce train
  // (horizon temps réel limité), on ne peut pas fiabiliser le décompte : on l'ignore
  // plutôt que d'afficher un chiffre trompeur (ex: "0 arrêt").
  if (toIdx < 0) return null;
  // Inclut la gare de départ et la gare d'arrivée dans le décompte
  // (ex : La Défense -> Charles de Gaulle-Étoile -> Auber -> Châtelet = 4 arrêts).
  const start = fromIdx >= 0 ? fromIdx : 0;
  const end = toIdx + 1;
  return end > start ? calls.slice(start, end) : [];
}

function renderTrainList(el, trains, { emptyText, highlightRef, etMap, fromName, toName }) {
  el.innerHTML = '';
  if (!trains.length) {
    el.innerHTML = `<p class="muted">${emptyText}</p>`;
    return;
  }
  const ul = document.createElement('ul');
  ul.className = 'train-list';
  trains.forEach((t) => {
    const li = document.createElement('li');
    li.className = 'train-item';
    if (highlightRef && t === highlightRef) li.classList.add('highlight');
    const st = statusLabel(t.status);
    const allCalls = t.journeyRef && etMap ? etMap.get(t.journeyRef) : null;
    const calls = callsBetween(allCalls, fromName, toName);
    const stopCount = calls ? calls.length : null;
    const arrivalAtTarget = calls && calls.length ? calls[calls.length - 1] : null;

    const row = document.createElement('div');
    row.className = 'train-row';
    row.innerHTML = `
      <span class="train-time">${fmtTime(t.expectedDeparture)}</span>
      <span class="train-dest">${t.destination}${arrivalAtTarget ? ` <span class="train-eta">(${toName} ${fmtTime(arrivalAtTarget.time)})</span>` : ''}</span>
      ${t.platform ? `<span class="train-platform">V${t.platform}</span>` : ''}
      <span class="train-right">
        ${stopCount != null ? `<span class="train-stopcount">${stopCount} arrêt${stopCount > 1 ? 's' : ''}</span>` : ''}
        ${st ? `<span class="train-status ${st.className}">${st.text}</span>` : ''}
      </span>
    `;
    li.appendChild(row);

    const detail = document.createElement('ul');
    detail.className = 'stop-detail';
    detail.hidden = true;
    if (calls && calls.length) {
      detail.innerHTML = calls.map((c) => `<li><span class="stop-detail-time">${fmtTime(c.time)}</span> ${c.name}</li>`).join('');
    } else {
      detail.innerHTML = `<li class="muted">Détail des arrêts indisponible pour ce train.</li>`;
    }
    li.appendChild(detail);

    row.addEventListener('click', () => {
      detail.hidden = !detail.hidden;
    });

    ul.appendChild(li);
  });
  el.appendChild(ul);
}

// Le statut OK/KO reflète uniquement les perturbations EN COURS (live), pas les
// informations/travaux programmés à venir.
function trafficPillInfo(live, error) {
  if (error) return { className: 'pill-error', text: 'Erreur' };
  if (!live.length) return { className: 'pill-ok', text: 'OK' };
  return { className: 'pill-warn', text: `KO (${live.length})` };
}

function renderTraffic(el, live, messages, links, error) {
  el.innerHTML = '';
  const info = trafficPillInfo(live, error);
  const header = document.createElement('div');
  header.className = 'traffic-header';
  header.innerHTML = `<span class="pill ${info.className}">${error ? 'Erreur' : (live.length ? `${live.length} perturbation(s) en cours` : 'Trafic normal en ce moment')}</span>`;
  el.appendChild(header);

  if (error) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = String(error.message || error);
    el.appendChild(p);
  }

  if (live.length) {
    const ul = document.createElement('ul');
    ul.className = 'traffic-list';
    live.forEach((d) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="traffic-channel">${d.cause || 'En cours'}</span> ${d.title}`;
      ul.appendChild(li);
    });
    el.appendChild(ul);
  }

  if (messages.length) {
    const details = document.createElement('details');
    details.className = 'traffic-upcoming';
    const summary = document.createElement('summary');
    summary.textContent = `Informations et travaux programmés (${messages.length})`;
    details.appendChild(summary);
    const ul = document.createElement('ul');
    ul.className = 'traffic-list';
    messages.forEach((m) => {
      const li = document.createElement('li');
      li.innerHTML = `${m.text}${m.validUntil ? ` <span class="muted">(jusqu'au ${fmtDayTime(m.validUntil)})</span>` : ''}`;
      ul.appendChild(li);
    });
    details.appendChild(ul);
    el.appendChild(details);
  }

  const linksDiv = document.createElement('div');
  linksDiv.className = 'source-links';
  linksDiv.innerHTML = `<span class="muted">Vérifier aussi :</span> ` + links.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join(' · ');
  el.appendChild(linksDiv);
}

function renderStatusPill(el, label, live, error) {
  const info = trafficPillInfo(live, error);
  el.textContent = `${label} : ${info.text}`;
  el.className = `pill ${info.className}`;
}

function setStatus(text) {
  document.getElementById('status').textContent = text;
}

async function loadData() {
  const route = CONFIG.routes[state.sens];
  const stop1 = CONFIG.stops[route.leg1.stopKey];
  const line1 = CONFIG.lines[route.leg1.lineKey];
  const stop2 = CONFIG.stops[route.correspondanceKey];
  const line2 = CONFIG.lines[route.leg2.lineKey];
  const destStop = CONFIG.stops[route.destinationKey];
  const leg1DurationMin = state.durations[route.durationKeys.leg1];
  const leg2DurationMin = state.durations[route.durationKeys.leg2];

  document.getElementById('route-label').textContent = route.label;
  document.getElementById('leg1-title').textContent = `Prochains départs — ${stop1.name} (${line1.label})`;
  document.getElementById('leg2-title').textContent = `Correspondance — ${stop2.name} (${line2.label})`;

  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.disabled = true;
  setStatus('Chargement…');

  const leg1El = document.getElementById('leg1-trains');
  const leg2El = document.getElementById('leg2-trains');
  const trafficAEl = document.getElementById('traffic-a');
  const trafficBEl = document.getElementById('traffic-b');

  let leg1Trains = [];
  let leg1Error = null;
  let leg2AllTrains = [];
  let leg2Error = null;
  let trafficA = [];
  let trafficAError = null;
  let trafficB = [];
  let trafficBError = null;
  let etMapA = null;
  let etMapB = null;
  let liveA = [];
  let liveB = [];
  let liveError = null;

  const results = await Promise.allSettled([
    fetchStopMonitoring(stop1.ref, line1.ref),
    fetchStopMonitoring(stop2.ref, line2.ref),
    fetchTraffic(CONFIG.lines.A.ref),
    fetchTraffic(CONFIG.lines.B.ref),
    fetchEstimatedTimetable(CONFIG.lines.A.ref),
    fetchEstimatedTimetable(CONFIG.lines.B.ref),
    fetchDisruptionsBulk(),
  ]);

  if (results[0].status === 'fulfilled') leg1Trains = towardsDestination(results[0].value, CONFIG.termini[route.leg1.towardsKey]);
  else leg1Error = results[0].reason;

  if (results[1].status === 'fulfilled') leg2AllTrains = towardsDestination(results[1].value, CONFIG.termini[route.leg2.towardsKey]);
  else leg2Error = results[1].reason;

  if (results[2].status === 'fulfilled') trafficA = results[2].value;
  else trafficAError = results[2].reason;

  if (results[3].status === 'fulfilled') trafficB = results[3].value;
  else trafficBError = results[3].reason;

  if (results[4].status === 'fulfilled') etMapA = results[4].value;
  if (results[5].status === 'fulfilled') etMapB = results[5].value;

  if (results[6].status === 'fulfilled') {
    liveA = activeDisruptionsForLine(results[6].value, CONFIG.lines.A.idfmId);
    liveB = activeDisruptionsForLine(results[6].value, CONFIG.lines.B.idfmId);
  } else {
    liveError = results[6].reason;
  }

  const etMap1 = route.leg1.lineKey === 'A' ? etMapA : etMapB;
  const etMap2 = route.leg2.lineKey === 'A' ? etMapA : etMapB;

  // Prochains 4 trains au départ
  if (leg1Error) {
    leg1El.innerHTML = `<p class="error">${leg1Error.message || leg1Error}</p>`;
  } else {
    renderTrainList(leg1El, leg1Trains.slice(0, 4), { emptyText: 'Aucun train trouvé.', etMap: etMap1, fromName: stop1.name, toName: stop2.name });
  }

  // Fenêtre de correspondance + heure d'arrivée finale
  let etaCorrespondance = null;
  let etaCorrespondanceIsReal = false;
  let chosenLeg2 = null;
  let etaFinal = null;
  let etaFinalIsReal = false;
  let leg2Window = [];

  if (!leg1Error && leg1Trains.length) {
    const nextTrain = leg1Trains[0];
    // On privilégie l'horaire réel de CE train à la correspondance (via le détail des
    // arrêts déjà récupéré) plutôt qu'une durée moyenne estimée, plus fiable.
    const nextTrainCalls = callsBetween(nextTrain.journeyRef && etMap1 ? etMap1.get(nextTrain.journeyRef) : null, stop1.name, stop2.name);
    const realArrival = nextTrainCalls && nextTrainCalls.length ? nextTrainCalls[nextTrainCalls.length - 1].time : null;
    if (realArrival) {
      etaCorrespondance = new Date(realArrival);
      etaCorrespondanceIsReal = true;
    } else {
      etaCorrespondance = new Date(new Date(nextTrain.expectedDeparture).getTime() + leg1DurationMin * 60000);
    }
    const { beforeMin, afterMin } = route.correspondanceWindow;
    const windowStart = new Date(etaCorrespondance.getTime() - beforeMin * 60000);
    const windowEnd = new Date(etaCorrespondance.getTime() + afterMin * 60000);

    if (!leg2Error) {
      leg2Window = leg2AllTrains.filter((t) => {
        const d = new Date(t.expectedDeparture);
        return d >= windowStart && d <= windowEnd;
      });
      // La correspondance retenue est la toute première du trajet complet qui part après
      // l'arrivée estimée (+ marge de transfert) — pas seulement parmi celles affichées
      // dans la fenêtre ci-dessus, pour ne jamais rater la bonne correspondance.
      const bufferMs = TRANSFER_BUFFER_MIN * 60000;
      chosenLeg2 = leg2AllTrains.find((t) => new Date(t.expectedDeparture).getTime() >= etaCorrespondance.getTime() + bufferMs) || null;
      if (chosenLeg2) {
        const chosenLeg2Calls = callsBetween(chosenLeg2.journeyRef && etMap2 ? etMap2.get(chosenLeg2.journeyRef) : null, stop2.name, destStop.name);
        const realFinal = chosenLeg2Calls && chosenLeg2Calls.length ? chosenLeg2Calls[chosenLeg2Calls.length - 1].time : null;
        if (realFinal) {
          etaFinal = new Date(realFinal);
          etaFinalIsReal = true;
        } else {
          etaFinal = new Date(new Date(chosenLeg2.expectedDeparture).getTime() + leg2DurationMin * 60000);
        }
      }
    }
  }

  document.getElementById('correspondance-info').textContent = etaCorrespondance
    ? `Arrivée à la correspondance : ${fmtTime(etaCorrespondance)} (${etaCorrespondanceIsReal ? 'horaire réel du premier train ci-dessus' : `estimation : premier train ci-dessus + ${leg1DurationMin} min`})`
    : '';

  if (leg2Error) {
    leg2El.innerHTML = `<p class="error">${leg2Error.message || leg2Error}</p>`;
  } else if (!etaCorrespondance) {
    leg2El.innerHTML = `<p class="muted">En attente des horaires du premier trajet.</p>`;
  } else {
    renderTrainList(leg2El, leg2Window, { emptyText: `Aucun train dans la fenêtre (-${route.correspondanceWindow.beforeMin} / +${route.correspondanceWindow.afterMin} min).`, highlightRef: chosenLeg2, etMap: etMap2, fromName: stop2.name, toName: destStop.name });
  }

  // Résumé en haut de page : départ / arrivée + statut trafic
  document.getElementById('summary-depart-time').textContent = fmtTime(leg1Trains[0]?.expectedDeparture);
  document.getElementById('summary-depart-station').textContent = stop1.name;
  document.getElementById('summary-arrivee-time').textContent = etaFinal ? fmtTime(etaFinal) : '--:--';
  document.getElementById('summary-arrivee-station').textContent = destStop.name + (etaFinal && !etaFinalIsReal ? ' (estimation)' : '');
  renderStatusPill(document.getElementById('status-pill-a'), 'RER A', liveA, liveError);
  renderStatusPill(document.getElementById('status-pill-b'), 'RER B', liveB, liveError);

  // Trafic détaillé : perturbations en cours (live) + informations/travaux programmés
  renderTraffic(trafficAEl, liveA, trafficA, CONFIG.trafficLinks.A, liveError || trafficAError);
  renderTraffic(trafficBEl, liveB, trafficB, CONFIG.trafficLinks.B, liveError || trafficBError);

  refreshBtn.disabled = false;
  setStatus(`Dernière mise à jour : ${fmtTime(new Date())}`);
}

function tickClock() {
  document.getElementById('current-time').textContent = fmtTime(new Date());
}

function initSettings() {
  const leg1Input = document.getElementById('duration-hacquiniere-chatelet');
  const leg2Input = document.getElementById('duration-chatelet-defense');
  leg1Input.value = state.durations.hacquiniereToChatelet;
  leg2Input.value = state.durations.chateletToLadefense;
  leg1Input.addEventListener('change', () => {
    state.durations.hacquiniereToChatelet = Number(leg1Input.value) || CONFIG.defaultDurations.hacquiniereToChatelet;
    saveDurations();
  });
  leg2Input.addEventListener('change', () => {
    state.durations.chateletToLadefense = Number(leg2Input.value) || CONFIG.defaultDurations.chateletToLadefense;
    saveDurations();
  });
}

function initSensToggle() {
  const btnAller = document.getElementById('btn-aller');
  const btnRetour = document.getElementById('btn-retour');
  function applySens() {
    btnAller.classList.toggle('active', state.sens === 'aller');
    btnRetour.classList.toggle('active', state.sens === 'retour');
  }
  btnAller.addEventListener('click', () => {
    if (state.sens === 'aller') return;
    state.sens = 'aller';
    localStorage.setItem('rer.sens', 'aller');
    applySens();
    loadData();
  });
  btnRetour.addEventListener('click', () => {
    if (state.sens === 'retour') return;
    state.sens = 'retour';
    localStorage.setItem('rer.sens', 'retour');
    applySens();
    loadData();
  });
  applySens();
}

function init() {
  initSensToggle();
  initSettings();
  document.getElementById('refresh-btn').addEventListener('click', loadData);
  tickClock();
  setInterval(tickClock, 1000);
  loadData();
}

document.addEventListener('DOMContentLoaded', init);
