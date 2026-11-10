const airportInput = document.getElementById('airportInput');
const clientIdInput = document.getElementById('clientIdInput');
const clientSecretInput = document.getElementById('clientSecretInput');
const configForm = document.getElementById('configForm');
const flightList = document.getElementById('flightList');
const planeLayer = document.getElementById('planeLayer');
const statusText = document.getElementById('statusText');
const atcMessage = document.getElementById('atcMessage');
const sourceBadge = document.getElementById('sourceBadge');

const state = {
  airport: 'KJFK',
  flights: [],
  animationId: null,
  lastFrame: 0,
};

const demoFlights = [
  { callsign: 'AAL241', origin: 'KJFK', destination: 'LAX', altitude: 5400, heading: 42, status: 'departing', source: 'demo' },
  { callsign: 'DAL118', origin: 'KJFK', destination: 'ATL', altitude: 6200, heading: 52, status: 'departing', source: 'demo' },
  { callsign: 'SWA877', origin: 'KJFK', destination: 'MIA', altitude: 4700, heading: 39, status: 'holding', source: 'demo' },
  { callsign: 'JBU121', origin: 'KJFK', destination: 'SFO', altitude: 6800, heading: 58, status: 'cleared', source: 'demo' },
];

function setStatus(label, tone = 'warn') {
  statusText.textContent = label;
  const dot = document.querySelector('.status-dot');
  if (dot) {
    dot.style.background = tone === 'ready' ? '#5dde8c' : tone === 'offline' ? '#ff6b6b' : '#f5bf4f';
    dot.style.boxShadow = tone === 'ready'
      ? '0 0 0 4px rgba(93, 222, 140, 0.25)'
      : tone === 'offline'
        ? '0 0 0 4px rgba(255, 107, 107, 0.2)'
        : '0 0 0 4px rgba(245, 191, 79, 0.2)';
  }
}

function formatFlightEntry(flight) {
  return {
    callsign: (flight.callsign || 'N/A').trim(),
    origin: (flight.origin || state.airport).toUpperCase(),
    destination: (flight.destination || 'LIVE').toUpperCase(),
    altitude: Number(flight.altitude || 0),
    heading: Number(flight.heading || 0),
    status: (flight.status || 'ready').toLowerCase(),
    source: flight.source || 'demo',
  };
}

function renderFlightList() {
  flightList.innerHTML = '';

  const flights = state.flights.length ? state.flights : demoFlights.map(formatFlightEntry);

  flights.slice(0, 6).forEach((flight) => {
    const item = document.createElement('li');
    item.className = 'flight-item';

    const statusClass = flight.source === 'demo'
      ? 'status-warn'
      : flight.status === 'departing' || flight.status === 'cleared'
        ? 'status-ready'
        : 'status-offline';

    item.innerHTML = `
      <div class="flight-row">
        <span class="flight-call">${flight.callsign}</span>
        <span class="flight-status ${statusClass}">${flight.status || 'ready'}</span>
      </div>
      <div class="flight-route">${flight.origin} → ${flight.destination}</div>
      <div class="flight-alt">
        <span>Alt ${flight.altitude.toLocaleString()} ft</span>
        <span>HDG ${flight.heading || 0}°</span>
      </div>
    `;

    flightList.appendChild(item);
  });
}

function renderPlanes() {
  planeLayer.innerHTML = '';

  const flights = state.flights.length ? state.flights : demoFlights.map(formatFlightEntry);

  flights.slice(0, 4).forEach((flight, index) => {
    const plane = document.createElement('div');
    plane.className = 'plane';
    plane.style.left = `${12 + index * 18}%`;
    plane.style.top = `${64 - index * 5}%`;
    plane.setAttribute('data-call', flight.callsign);
    plane.innerHTML = `
      <span class="tail"></span>
      <span class="body"></span>
      <span class="wing"></span>
      <span class="cockpit"></span>
      <span class="nose"></span>
    `;
    planeLayer.appendChild(plane);
  });
}

function animatePlanes(timestamp) {
  const planes = [...planeLayer.children];
  if (!planes.length) {
    state.animationId = requestAnimationFrame(animatePlanes);
    return;
  }

  const delta = timestamp - state.lastFrame || 16;
  state.lastFrame = timestamp;

  planes.forEach((plane, index) => {
    const baseX = 12 + index * 17;
    const baseY = 64 - index * 6;
    const cycle = ((timestamp * 0.03) + index * 120) % 100;
    const x = baseX + (cycle / 100) * 60;
    const y = baseY - Math.sin((cycle / 100) * Math.PI) * 26;
    const rotation = (index * 8) + 25 + Math.sin((cycle / 100) * Math.PI * 2) * 10;

    plane.style.left = `${x}%`;
    plane.style.top = `${y}%`;
    plane.style.transform = `rotate(${rotation}deg)`;
    plane.style.opacity = 0.85 + (cycle / 100) * 0.25;
  });

  state.animationId = requestAnimationFrame(animatePlanes);
}

async function loadFlights() {
  const airport = airportInput.value.trim().toUpperCase() || state.airport;
  state.airport = airport;

  try {
    setStatus('Connecting to OpenSky…', 'warn');
    const response = await fetch(`/api/live?airport=${encodeURIComponent(airport)}`);
    const payload = await response.json();

    const flights = Array.isArray(payload.flights) && payload.flights.length
      ? payload.flights.map(formatFlightEntry)
      : demoFlights.map(formatFlightEntry);

    state.flights = flights;
    renderFlightList();
    renderPlanes();

    if (payload.source === 'live') {
      setStatus('Live data online', 'ready');
      sourceBadge.textContent = 'live';
      sourceBadge.style.background = 'rgba(93, 222, 140, 0.2)';
      sourceBadge.style.color = '#116a3b';
      atcMessage.textContent = `Live traffic around ${airport} is active. Runway is clear for departure.`;
    } else {
      setStatus('Demo mode', 'offline');
      sourceBadge.textContent = 'demo';
      sourceBadge.style.background = 'rgba(245, 191, 79, 0.18)';
      sourceBadge.style.color = '#7f5b00';
      atcMessage.textContent = payload.message || 'Runway clear. Demo flights are animating for local preview.';
    }
  } catch (error) {
    state.flights = demoFlights.map(formatFlightEntry);
    renderFlightList();
    renderPlanes();
    setStatus('Demo mode', 'offline');
    sourceBadge.textContent = 'demo';
    sourceBadge.style.background = 'rgba(255, 107, 107, 0.14)';
    sourceBadge.style.color = '#8b2b2b';
    atcMessage.textContent = 'OpenSky connection failed. The airport is running in preview mode.';
  }
}

configForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  localStorage.setItem('opensky-client-id', clientIdInput.value.trim());
  localStorage.setItem('opensky-client-secret', clientSecretInput.value.trim());
  await loadFlights();
});

function preloadInputs() {
  const savedId = localStorage.getItem('opensky-client-id') || '';
  const savedSecret = localStorage.getItem('opensky-client-secret') || '';
  clientIdInput.value = savedId;
  clientSecretInput.value = savedSecret;
}

window.addEventListener('DOMContentLoaded', () => {
  preloadInputs();
  renderFlightList();
  renderPlanes();
  state.animationId = requestAnimationFrame(animatePlanes);
  loadFlights();
});
