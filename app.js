document.addEventListener('DOMContentLoaded', () => {
    // ---------------------------
    // View mode (public profile)
    // ---------------------------
    const urlParams = new URLSearchParams(window.location.search);
    const viewUid = urlParams.get('view');
    window.isViewMode = !!viewUid;

    // ---------------------------
    // Map setup
    // ---------------------------
    const map = L.map('map');
  
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);
  
    // Venues
    const venues = [
      { name: "The Salt Shed", coords: [41.906709, -87.659004] },
      { name: "United Center", coords: [41.8807, -87.6742] },
      { name: "Chicago Theatre", coords: [41.8855, -87.6272] },
      { name: "Thalia Hall", coords: [41.857687, -87.657278] },
      { name: "Aragon Ballroom", coords: [41.969461, -87.658058] },
      { name: "Riviera Theatre", coords: [41.968589, -87.659796] },
      { name: "The Vic", coords: [41.939502, -87.653850] },
      { name: "Empty Bottle", coords: [41.900432, -87.686670] },
      { name: "Lincoln Hall", coords: [41.926005, -87.649721] },
      { name: "Park West", coords: [41.918597, -87.637443] },
      { name: "House of Blues", coords: [41.888361, -87.629399] },
      { name: "The Hideout", coords: [41.913803, -87.662547] },
      { name: "Bottom Lounge", coords: [41.885319, -87.661775] },
      { name: "Metro", coords: [41.949839, -87.658832] },
      { name: "Joe's Bar", coords: [41.909919, -87.652171] },
      { name: "Schubas", coords: [41.939647, -87.663647] },
      { name: "Wrigley Field", coords: [41.948463, -87.655800] },
      { name: "Soldier Field", coords: [41.862366, -87.617256] },
      { name: "Huntington Bank Pavilion at Northerly Island", coords: [41.8647, -87.6066] },
      { name: "Concord Music Hall", coords: [41.9318, -87.7081] },
      { name: "Credit Union 1 Arena", coords: [41.8748, -87.6505] },
      { name: "Auditorium Theatre", coords: [41.8763, -87.6247] },
      { name: "The Outset", coords: [41.9119, -87.6486] },
      { name: "Reggies", coords: [41.8539792, -87.6269125] },
      { name: "Lollapalooza (Grant Park)", coords: [41.88273, -87.6185578] },
      { name: "Credit Union 1 Amphitheatre", coords: [41.5694, -87.7873] },
      { name: "Winnetka Music Festival", coords: [42.1081, -87.7394] },
      { name: "The Sphere (Las Vegas)", coords: [36.1219, -115.1639], outOfRegion: true }
    ];
  
    venues.sort((a, b) => a.name.localeCompare(b.name));
  
    // ---------------------------
    // Data (loaded from Firestore after login)
    // ---------------------------
    let showsByVenue = {};

    function saveShowsToFirestore() {
      const user = window.currentUser;
      const db = window.db;
      if (!user || !db || !window._fs) return;
      const ref = window._fs.doc(db, 'users', user.uid, 'data', 'shows');
      window._fs.setDoc(ref, { showsByVenue }).catch(err => {
        console.error('Failed to save shows:', err);
      });
    }

    window.onUserLogin = async function(user) {
      const db = window.db;
      if (!db || !window._fs) return;
      try {
        const ref = window._fs.doc(db, 'users', user.uid, 'data', 'shows');
        const snap = await window._fs.getDoc(ref);
        showsByVenue = snap.exists() ? (snap.data().showsByVenue || {}) : {};
      } catch (err) {
        console.error('Failed to load shows:', err);
        showsByVenue = {};
      }
      ensureShowIds();
      refreshAllPopups();
      renderUpcomingWidget();
      renderStatsPanel();
    };

    window.onUserLogout = function() {
      showsByVenue = {};
      refreshAllPopups();
      renderUpcomingWidget();
      renderStatsPanel();
    };

    window.initViewMode = async function() {
      const db = window.db;
      if (!db || !window._fs || !viewUid) return;
      try {
        const ref = window._fs.doc(db, 'users', viewUid, 'data', 'shows');
        const snap = await window._fs.getDoc(ref);
        showsByVenue = snap.exists() ? (snap.data().showsByVenue || {}) : {};
      } catch (err) {
        showsByVenue = {};
      }
      ensureShowIds();
      refreshAllPopups();
      renderUpcomingWidget();
      renderStatsPanel();
    };
  
    // ---------------------------
    // Helpers
    // ---------------------------
    function makeShowId() {
      return `show_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
  
    function ensureShowIds() {
      let changed = false;
  
      Object.keys(showsByVenue).forEach(venueName => {
        const shows = showsByVenue[venueName] || [];
        shows.forEach(show => {
          if (!show.id) {
            show.id = makeShowId();
            changed = true;
          }
        });
      });
  
      if (changed) {
        saveShowsToFirestore();
      }
    }
  
    ensureShowIds();
  
    function getCurrentYear() {
      return String(new Date().getFullYear());
    }
  
    function formatDateShort(yyyyMmDd) {
      if (!yyyyMmDd) return '';
      const d = new Date(`${yyyyMmDd}T00:00:00`);
      if (Number.isNaN(d.getTime())) return yyyyMmDd;
      return d.toLocaleDateString();
    }
  
    function escapeHtml(str) {
      return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
  
    function sanitizeUrl(value) {
      const raw = (value || '').trim();
      if (!raw) return '';
  
      try {
        const url = new URL(raw, window.location.href);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          return url.href;
        }
        return '';
      } catch (e) {
        return '';
      }
    }
  
    function getTodayKey() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  
    function isUpcomingShow(show) {
      if (!show || !show.date) return false;
      return show.date >= getTodayKey();
    }
  
    function isPastShow(show) {
      if (!show || !show.date) return false;
      return show.date < getTodayKey();
    }
  
    function yearsForVenue(venueName) {
      const shows = showsByVenue[venueName] || [];
      const years = new Set();
  
      shows.forEach(s => {
        if (s.date && typeof s.date === 'string' && s.date.length >= 4) {
          years.add(s.date.slice(0, 4));
        }
      });
  
      return Array.from(years).sort((a, b) => b.localeCompare(a));
    }
  
    function getAllShowYears() {
      const years = new Set([getCurrentYear()]);
  
      Object.keys(showsByVenue).forEach(venueName => {
        const shows = showsByVenue[venueName] || [];
        shows.forEach(show => {
          if (show.date && typeof show.date === 'string' && show.date.length >= 4) {
            years.add(show.date.slice(0, 4));
          }
        });
      });
  
      return Array.from(years).sort((a, b) => b.localeCompare(a));
    }
  
    function getDefaultYearForVenue(venueName) {
      const currentYear = getCurrentYear();
      const years = yearsForVenue(venueName);
      return years.includes(currentYear) ? currentYear : 'All';
    }
  
    function filteredShows(venueName, year) {
      const all = showsByVenue[venueName] || [];
      if (year === 'All') return all;
      return all.filter(s => (s.date || '').startsWith(year));
    }
  
    function computeStats(shows) {
      const count = shows.length;
      const priced = shows
        .map(s => s.ticketPrice)
        .filter(p => p !== undefined && p !== null && p !== '' && !Number.isNaN(Number(p)))
        .map(p => Number(p));
  
      let avg = null;
      if (priced.length) {
        const sum = priced.reduce((a, b) => a + b, 0);
        avg = Math.round(sum / priced.length);
      }
  
      return { count, avg };
    }
  
    function findShowById(showId) {
      for (const venueName of Object.keys(showsByVenue)) {
        const shows = showsByVenue[venueName] || [];
        const show = shows.find(s => s.id === showId);
        if (show) {
          return { venueName, show };
        }
      }
      return null;
    }
  
    function buildSetlistSearchUrl(show, venueName) {
      const parts = [
        show.artist || '',
        venueName || '',
        show.date || '',
        'setlist.fm'
      ].filter(Boolean);
  
      const query = parts.join(' ');
      return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }
  
    function getUpcomingShows() {
      const upcoming = [];
  
      Object.keys(showsByVenue).forEach(venueName => {
        const shows = showsByVenue[venueName] || [];
  
        shows.forEach(show => {
          if (isUpcomingShow(show)) {
            upcoming.push({
              venue: venueName,
              ...show
            });
          }
        });
      });
  
      upcoming.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      return upcoming;
    }
  
    function getPastShowsForYear(year) {
      const pastShows = [];
  
      Object.keys(showsByVenue).forEach(venueName => {
        const shows = showsByVenue[venueName] || [];
  
        shows.forEach(show => {
          if ((show.date || '').startsWith(year) && isPastShow(show)) {
            pastShows.push({
              venue: venueName,
              ...show
            });
          }
        });
      });
  
      pastShows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return pastShows;
    }
  
    function getVenueBreakdownForYear(year) {
      const shows = getPastShowsForYear(year);
      const counts = new Map();
  
      shows.forEach(show => {
        counts.set(show.venue, (counts.get(show.venue) || 0) + 1);
      });
  
      return Array.from(counts.entries())
        .map(([venue, count]) => ({ venue, count }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.venue.localeCompare(b.venue);
        });
    }
  
    function computeYearStats(year) {
      const shows = getPastShowsForYear(year);
      const venueCount = new Set(shows.map(show => show.venue)).size;
  
      const priced = shows
        .map(show => show.ticketPrice)
        .filter(price => price !== undefined && price !== null && price !== '' && !Number.isNaN(Number(price)))
        .map(price => Number(price));
  
      const totalSpent = priced.reduce((sum, price) => sum + price, 0);
  
      return {
        shows,
        showCount: shows.length,
        venueCount,
        totalSpent
      };
    }
  
    function cleanOptionalText(value) {
      return (value || '').trim();
    }
  
    function parseOptionalWholeNumber(value) {
      if (value === undefined || value === null || value === '') return '';
      const num = Number(value);
      if (!Number.isFinite(num)) return '';
      return Math.round(num);
    }
  
    function parseOptionalRating(value) {
      if (value === undefined || value === null || value === '') return '';
      const num = Number(value);
      if (!Number.isFinite(num)) return '';
      return Math.min(10, Math.max(1, Math.round(num)));
    }
  
    function removeVenueIfEmpty(venueName) {
      if (!showsByVenue[venueName] || showsByVenue[venueName].length === 0) {
        delete showsByVenue[venueName];
      }
    }
  
    function closeVenuePanel() {
      const panel = document.getElementById('panel');
      if (panel) {
        panel.open = false;
      }
    }
  
    function buildShowDetailsHtml(show, venueName) {
      const details = [];
      const safeSetlistUrl = sanitizeUrl(show.setlistUrl);
      const safePosterUrl = sanitizeUrl(show.posterUrl);
  
      if (show.ticketPrice !== undefined && show.ticketPrice !== null && show.ticketPrice !== '') {
        details.push(`<span class="detail-pill">$${escapeHtml(show.ticketPrice)}</span>`);
      }
  
      if (show.section && String(show.section).trim() !== '') {
        details.push(`<span class="detail-pill">Seat: ${escapeHtml(show.section)}</span>`);
      }
  
      if (show.friends && String(show.friends).trim() !== '') {
        details.push(`<span class="detail-pill">With: ${escapeHtml(show.friends)}</span>`);
      }
  
      if (show.rating && String(show.rating).trim() !== '') {
        details.push(`<span class="detail-pill">Rating: ${escapeHtml(show.rating)}/10</span>`);
      }
  
      if (show.notes && String(show.notes).trim() !== '') {
        details.push(`<span class="detail-pill">Notes: ${escapeHtml(show.notes)}</span>`);
      }
  
      if (safeSetlistUrl) {
        details.push(
          `<a class="detail-link popup-action-link" href="${escapeHtml(safeSetlistUrl)}" target="_blank" rel="noopener">Setlist</a>`
        );
      }
  
      details.push(
        `<button class="detail-link find-setlist-btn" type="button" data-show-id="${escapeHtml(show.id)}" data-venue="${escapeHtml(venueName)}">Find Setlist</button>`
      );
  
      if (safePosterUrl) {
        details.push(
          `<a class="detail-link popup-action-link" href="${escapeHtml(safePosterUrl)}" target="_blank" rel="noopener" title="Open poster">
            <img class="poster-thumb" src="${escapeHtml(safePosterUrl)}" alt="Poster" />
          </a>`
        );
      }
  
      if (!window.isViewMode) {
        details.push(
          `<button class="detail-link edit-show-btn" type="button" data-show-id="${escapeHtml(show.id)}">Edit</button>`
        );
        details.push(
          `<button class="detail-link delete-show-btn" type="button" data-show-id="${escapeHtml(show.id)}">Delete</button>`
        );
      }
  
      return details.join('');
    }
  
    function buildPopupHtml(venueName, selectedYear = null) {
      const effectiveYear = selectedYear || getDefaultYearForVenue(venueName);
  
      const years = yearsForVenue(venueName);
      const options = ['All', ...years]
        .map(y => `<option value="${y}" ${y === effectiveYear ? 'selected' : ''}>${y}</option>`)
        .join('');
  
      const shows = filteredShows(venueName, effectiveYear);
      const stats = computeStats(shows);
      const avgText = (stats.avg === null) ? '—' : `$${stats.avg}`;
  
      let listHtml = '';
      if (!shows.length) {
        listHtml = `<div class="empty-note">No shows added yet.</div>`;
      } else {
        const items = shows
  .slice()
  .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  .map((s) => {
            const artist = escapeHtml(s.artist || '');
            const date = s.date ? escapeHtml(formatDateShort(s.date)) : '';
            const upcoming = isUpcomingShow(s);
  
            return `
              <div class="show-item ${upcoming ? 'show-item-upcoming' : ''}" data-show-id="${escapeHtml(s.id)}">
                <div class="show-topline">
                  <div class="show-artist-row">
                    <div class="show-artist">${artist}</div>
                    ${upcoming ? '<span class="upcoming-badge">Upcoming</span>' : ''}
                  </div>
                  <div class="show-date ${upcoming ? 'show-date-upcoming' : ''}">${date}</div>
                </div>
                <div class="show-details" data-details-id="${escapeHtml(s.id)}">
                  ${buildShowDetailsHtml(s, venueName)}
                </div>
              </div>
            `;
          })
          .join('');
  
        listHtml = `<div class="show-list">${items}</div>`;
      }
  
      return `
        <div class="popup-title">${escapeHtml(venueName)}</div>
  
        <div class="popup-subrow">
          <div class="popup-label">Year</div>
          <select class="popup-select year-select" data-venue="${escapeHtml(venueName)}">
            ${options}
          </select>
          <div class="popup-stat">Shows: ${stats.count} • Avg: ${avgText}</div>
        </div>
  
        ${listHtml}
  
        <hr class="popup-divider" />
  
        ${!window.isViewMode ? `<button class="add-toggle open-add-panel-btn" type="button" data-venue="${escapeHtml(venueName)}">Add show</button>` : ''}
      `;
    }
  
    // ---------------------------
    // Markers + map helpers
    // ---------------------------
    const markersByName = {};
  
    function refreshVenuePopup(venueName, selectedYear = null, reopen = false) {
      const marker = markersByName[venueName];
      if (!marker) return;
  
      marker.bindPopup(buildPopupHtml(venueName, selectedYear));
  
      if (reopen) {
        marker.openPopup();
      }
    }
  
    function refreshAllPopups() {
      venues.forEach(v => {
        refreshVenuePopup(v.name, null, false);
      });
    }
  
    function flyToVenue(venueName, reopenPopup = true) {
      const venueObj = venues.find(v => v.name === venueName);
      if (!venueObj) return;
  
      map.flyTo(venueObj.coords, 15, { duration: 0.8 });
  
      if (reopenPopup) {
        refreshVenuePopup(venueName, null, true);
      }
    }
  
    function renderUpcomingWidget() {
      const container = document.getElementById('upcoming-list');
      if (!container) return;
  
      const upcoming = getUpcomingShows();
  
      if (!upcoming.length) {
        container.innerHTML = `<div style="opacity:0.7;font-size:12px;">No upcoming concerts</div>`;
        return;
      }
  
      container.innerHTML = upcoming.map(show => {
        const date = formatDateShort(show.date);
  
        return `
          <div class="upcoming-item"
               data-venue="${escapeHtml(show.venue)}"
               data-show-id="${escapeHtml(show.id)}">
            ${date} — ${escapeHtml(show.artist)} — ${escapeHtml(show.venue)}
          </div>
        `;
      }).join('');
    }
  
    let statsSelectedYear = getCurrentYear();
    let statsShowsExpanded = false;
    let statsVenuesExpanded = false;
  
    function renderStatsPanel() {
      const yearSelect = document.getElementById('stats-year-select');
      const statsContent = document.getElementById('stats-content');
      if (!yearSelect || !statsContent) return;
  
      const availableYears = getAllShowYears();
  
      if (!availableYears.includes(statsSelectedYear)) {
        statsSelectedYear = availableYears[0] || getCurrentYear();
      }
  
      yearSelect.innerHTML = availableYears
        .map(year => `<option value="${year}" ${year === statsSelectedYear ? 'selected' : ''}>${year}</option>`)
        .join('');
  
      const stats = computeYearStats(statsSelectedYear);
      const venueBreakdown = getVenueBreakdownForYear(statsSelectedYear);
      const totalText = `$${stats.totalSpent}`;
  
      let attendedListHtml = '';
      if (statsShowsExpanded) {
        if (!stats.shows.length) {
          attendedListHtml = `<div class="stats-list"><div class="stats-empty">No attended shows for ${escapeHtml(statsSelectedYear)}.</div></div>`;
        } else {
          attendedListHtml = `
            <div class="stats-list">
              ${stats.shows.map(show => `
                <div class="stats-show-item"
                     data-venue="${escapeHtml(show.venue)}"
                     data-show-id="${escapeHtml(show.id)}">
                  ${escapeHtml(show.artist)} — ${escapeHtml(formatDateShort(show.date))} — ${escapeHtml(show.venue)}
                </div>
              `).join('')}
            </div>
          `;
        }
      }
  
      let venueListHtml = '';
      if (statsVenuesExpanded) {
        if (!venueBreakdown.length) {
          venueListHtml = `<div class="stats-list"><div class="stats-empty">No venues for ${escapeHtml(statsSelectedYear)}.</div></div>`;
        } else {
          venueListHtml = `
            <div class="stats-list">
              ${venueBreakdown.map(item => `
                <div class="stats-show-item"
                     data-venue-only="${escapeHtml(item.venue)}">
                  ${escapeHtml(item.venue)} — ${escapeHtml(item.count)}
                </div>
              `).join('')}
            </div>
          `;
        }
      }
  
      statsContent.innerHTML = `
        <div class="stats-grid">
          <div class="stats-row stats-row-clickable" id="stats-shows-row">
            <div class="stats-row-top">
              <div class="stats-row-label">Shows Attended</div>
              <div class="stats-row-value">${stats.showCount}</div>
            </div>
            ${attendedListHtml}
          </div>
  
          <div class="stats-row stats-row-clickable" id="stats-venues-row">
            <div class="stats-row-top">
              <div class="stats-row-label">Venues Visited</div>
              <div class="stats-row-value">${stats.venueCount}</div>
            </div>
            ${venueListHtml}
          </div>
  
          <div class="stats-row">
            <div class="stats-row-top">
              <div class="stats-row-label">Total Spent</div>
              <div class="stats-row-value">${totalText}</div>
            </div>
          </div>
        </div>
      `;
    }
  
    venues.forEach(v => {
      const marker = L.marker(v.coords).addTo(map);
      markersByName[v.name] = marker;
  
      refreshVenuePopup(v.name, null, false);
  
      marker.on('click', () => {
        map.flyTo(v.coords, 15, { duration: 0.8 });
        refreshVenuePopup(v.name, null, true);
        closeAddPanel();
        closeStatsPanel();
        closeVenuePanel();
      });
  
      marker.on('popupopen', (e) => {
        const popupEl = e.popup.getElement();
        if (!popupEl) return;
  
        L.DomEvent.disableClickPropagation(popupEl);
        L.DomEvent.disableScrollPropagation(popupEl);
      });
    });
  
    const bounds = L.latLngBounds(venues.filter(v => !v.outOfRegion).map(v => v.coords));
    map.fitBounds(bounds, { padding: [30, 30] });
  
    // ---------------------------
    // Add / Edit Side Panel
    // ---------------------------
    let activeVenueForAdd = null;
    let activeEditShowId = null;
  
    const addPanel = document.getElementById('add-show-panel');
    const addVenueTitle = document.getElementById('add-venue-title');
    const addCloseBtn = document.getElementById('add-close');
    const sideForm = document.getElementById('side-add-form');
    const sideSubmitBtn = sideForm.querySelector('button[type="submit"]');
  
    const sideVenueEl = document.getElementById('side-venue');

    venues.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.name;
      sideVenueEl.appendChild(opt);
    });

    const sideArtistEl = document.getElementById('side-artist');
    const sideDateEl = document.getElementById('side-date');
    const sidePriceEl = document.getElementById('side-price');
    const sideSectionEl = document.getElementById('side-section');
    const sideFriendsEl = document.getElementById('side-friends');
    const sideRatingEl = document.getElementById('side-rating');
    const sideSetlistEl = document.getElementById('side-setlist');
    const sidePosterEl = document.getElementById('side-poster');
    const sideNotesEl = document.getElementById('side-notes');
  
    function setAddPanelState(isOpen) {
      addPanel.classList.toggle('open', isOpen);
      addPanel.setAttribute('aria-hidden', String(!isOpen));
    }
  
    function resetSideForm() {
      sideForm.reset();
      activeVenueForAdd = null;
      activeEditShowId = null;
      sideSubmitBtn.textContent = 'Save show';
      sideVenueEl.style.display = 'none';
      sideVenueEl.value = '';
    }

    function openAddPanel(venueName) {
      resetSideForm();
      activeVenueForAdd = venueName;
      addVenueTitle.textContent = `Add show • ${venueName}`;
      sideSubmitBtn.textContent = 'Save show';
      sideVenueEl.style.display = 'none';
      closeStatsPanel();
      closeVenuePanel();
      setAddPanelState(true);
      sideArtistEl.focus();
    }

    function openAddPanelGlobal() {
      resetSideForm();
      addVenueTitle.textContent = 'Add Show';
      sideVenueEl.style.display = '';
      closeStatsPanel();
      closeVenuePanel();
      setAddPanelState(true);
    }
  
    function openEditPanel(showId) {
      const result = findShowById(showId);
      if (!result) return;
  
      const { venueName, show } = result;
  
      resetSideForm();
      activeVenueForAdd = venueName;
      activeEditShowId = showId;
  
      addVenueTitle.textContent = `Edit show • ${venueName}`;
      sideSubmitBtn.textContent = 'Update show';
  
      sideArtistEl.value = show.artist || '';
      sideDateEl.value = show.date || '';
      sidePriceEl.value = show.ticketPrice || '';
      sideSectionEl.value = show.section || '';
      sideFriendsEl.value = show.friends || '';
      sideRatingEl.value = show.rating || '';
      sideSetlistEl.value = show.setlistUrl || '';
      sidePosterEl.value = show.posterUrl || '';
      sideNotesEl.value = show.notes || '';
  
      closeStatsPanel();
      closeVenuePanel();
      setAddPanelState(true);
      sideArtistEl.focus();
    }
  
    function closeAddPanel() {
      setAddPanelState(false);
      resetSideForm();
    }
  
    addCloseBtn.addEventListener('click', closeAddPanel);

    if (window.isViewMode) {
      document.getElementById('global-add-btn').style.display = 'none';
    } else {
      document.getElementById('global-add-btn').addEventListener('click', () => {
        openAddPanelGlobal();
      });

      document.getElementById('share-profile-btn').addEventListener('click', () => {
        const user = window.currentUser;
        if (!user) return;
        const url = `${window.location.origin}${window.location.pathname}?view=${user.uid}`;
        const btn = document.getElementById('share-profile-btn');
        const orig = btn.textContent;

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(() => {
            btn.textContent = 'Link copied!';
            setTimeout(() => { btn.textContent = orig; }, 2000);
          }).catch(() => {
            window.prompt('Copy your profile link:', url);
          });
        } else {
          window.prompt('Copy your profile link:', url);
        }
      });
    }
  
    // ---------------------------
    // Stats panel
    // ---------------------------
    const statsButton = document.getElementById('stats-button');
    const statsPanel = document.getElementById('stats-panel');
    const statsClose = document.getElementById('stats-close');
    const statsYearSelect = document.getElementById('stats-year-select');
  
    function setStatsPanelState(isOpen) {
      statsPanel.classList.toggle('open', isOpen);
      statsPanel.setAttribute('aria-hidden', String(!isOpen));
      statsButton.setAttribute('aria-expanded', String(isOpen));
    }
  
    function openStatsPanel() {
      closeAddPanel();
      closeVenuePanel();
      setStatsPanelState(true);
      renderStatsPanel();
    }
  
    function closeStatsPanel() {
      setStatsPanelState(false);
    }
  
    function toggleStatsPanel() {
      if (statsPanel.classList.contains('open')) {
        closeStatsPanel();
      } else {
        openStatsPanel();
      }
    }
  
    statsButton.addEventListener('click', toggleStatsPanel);
    statsClose.addEventListener('click', closeStatsPanel);
  
    statsYearSelect.addEventListener('change', () => {
      statsSelectedYear = statsYearSelect.value;
      statsShowsExpanded = false;
      statsVenuesExpanded = false;
      renderStatsPanel();
    });
  
    // ---------------------------
    // Venue list
    // ---------------------------
    const venueListEl = document.getElementById('venue-list');
  
    venues.forEach(v => {
      const item = document.createElement('div');
      item.textContent = v.name;
  
      item.addEventListener('click', () => {
        flyToVenue(v.name, true);
        closeAddPanel();
        closeStatsPanel();
        closeVenuePanel();
      });
  
      venueListEl.appendChild(item);
    });
  
    // Search filter
    const venueSearchEl = document.getElementById('venue-search');
    venueSearchEl.addEventListener('input', () => {
      const q = venueSearchEl.value.trim().toLowerCase();
      const items = venueListEl.querySelectorAll('div');
  
      items.forEach(item => {
        const name = item.textContent.toLowerCase();
        item.style.display = name.includes(q) ? '' : 'none';
      });
    });
  
    // ---------------------------
    // Global click / change handling
    // ---------------------------
    document.addEventListener('click', (evt) => {
      const actionLink = evt.target.closest('.popup-action-link');
      if (actionLink) {
        evt.stopPropagation();
        return;
      }
  
      const findSetlistBtn = evt.target.closest('.find-setlist-btn');
      if (findSetlistBtn) {
        evt.preventDefault();
        evt.stopPropagation();
  
        const showId = findSetlistBtn.dataset.showId;
        const result = findShowById(showId);
        if (!result) return;
  
        const { venueName, show } = result;
        const searchUrl = buildSetlistSearchUrl(show, venueName);
        window.open(searchUrl, '_blank', 'noopener');
        return;
      }
  
      const venueOnlyItem = evt.target.closest('[data-venue-only]');
      if (venueOnlyItem) {
        evt.preventDefault();
        evt.stopPropagation();
  
        const venue = venueOnlyItem.dataset.venueOnly;
        flyToVenue(venue, true);
        closeStatsPanel();
        return;
      }
  
      const statsShowItem = evt.target.closest('.stats-show-item[data-show-id]');
      if (statsShowItem) {
        evt.preventDefault();
        evt.stopPropagation();
  
        const venue = statsShowItem.dataset.venue;
        flyToVenue(venue, true);
        closeStatsPanel();
        return;
      }
  
      const statsShowsRow = evt.target.closest('#stats-shows-row');
      if (statsShowsRow && !evt.target.closest('.stats-show-item')) {
        evt.preventDefault();
        evt.stopPropagation();
        statsShowsExpanded = !statsShowsExpanded;
        renderStatsPanel();
        return;
      }
  
      const statsVenuesRow = evt.target.closest('#stats-venues-row');
      if (statsVenuesRow && !evt.target.closest('[data-venue-only]')) {
        evt.preventDefault();
        evt.stopPropagation();
        statsVenuesExpanded = !statsVenuesExpanded;
        renderStatsPanel();
        return;
      }
  
      const widgetItem = evt.target.closest('.upcoming-item');
      if (widgetItem) {
        evt.preventDefault();
        evt.stopPropagation();
  
        const venue = widgetItem.dataset.venue;
        flyToVenue(venue, true);
        closeStatsPanel();
        closeAddPanel();
        return;
      }
  
      const addBtn = evt.target.closest('.open-add-panel-btn');
      if (addBtn) {
        evt.preventDefault();
        evt.stopPropagation();
  
        const venueName = addBtn.dataset.venue;
        if (venueName) {
          openAddPanel(venueName);
        }
        return;
      }
  
      const editBtn = evt.target.closest('.edit-show-btn');
      if (editBtn) {
        evt.preventDefault();
        evt.stopPropagation();
  
        const showId = editBtn.dataset.showId;
        if (showId) {
          openEditPanel(showId);
        }
        return;
      }
  
      const deleteBtn = evt.target.closest('.delete-show-btn');
      if (deleteBtn) {
        evt.preventDefault();
        evt.stopPropagation();
  
        const showId = deleteBtn.dataset.showId;
        if (!showId) return;
  
        const result = findShowById(showId);
        if (!result) return;
  
        const confirmed = window.confirm('Delete this show? This cannot be undone.');
        if (!confirmed) return;
  
        const { venueName, show } = result;
        const currentYear = show?.date ? show.date.slice(0, 4) : null;
        const defaultYear = getDefaultYearForVenue(venueName);
        const reopenYear = currentYear && currentYear === defaultYear ? currentYear : defaultYear;
  
        showsByVenue[venueName] = (showsByVenue[venueName] || []).filter(existingShow => existingShow.id !== showId);
        removeVenueIfEmpty(venueName);
        saveShowsToFirestore();
        refreshVenuePopup(venueName, reopenYear, true);
        renderUpcomingWidget();
        renderStatsPanel();
        return;
      }
  
      const showItem = evt.target.closest('.show-item');
      if (showItem) {
        if (evt.target.closest('.popup-action-link')) return;
        if (evt.target.closest('.edit-show-btn')) return;
        if (evt.target.closest('.delete-show-btn')) return;
        if (evt.target.closest('.find-setlist-btn')) return;
  
        evt.preventDefault();
        evt.stopPropagation();
  
        const showId = showItem.dataset.showId;
        const details = showItem.querySelector(`.show-details[data-details-id="${showId}"]`);
        if (details) {
          details.classList.toggle('open');
        }
        return;
      }
    });
  
    document.addEventListener('change', (evt) => {
      const yearSelect = evt.target.closest('.year-select');
      if (!yearSelect) return;
  
      const venueName = yearSelect.dataset.venue;
      const chosenYear = yearSelect.value;
  
      if (!venueName) return;
  
      evt.stopPropagation();
      refreshVenuePopup(venueName, chosenYear, true);
    });
  
    document.addEventListener('keydown', (evt) => {
      if (evt.key === 'Escape') {
        closeAddPanel();
        closeStatsPanel();
      }
    });
  
    // ---------------------------
    // Side panel form submit
    // ---------------------------
    sideForm.addEventListener('submit', (evt) => {
      evt.preventDefault();
  
      const venueToUse = activeVenueForAdd || sideVenueEl.value;
      if (!venueToUse) return;

      const artist = cleanOptionalText(sideArtistEl.value);
      const date = sideDateEl.value;

      if (!artist || !date) return;

      const showPayload = {
        artist,
        date,
        ticketPrice: parseOptionalWholeNumber(sidePriceEl.value),
        section: cleanOptionalText(sideSectionEl.value),
        friends: cleanOptionalText(sideFriendsEl.value),
        rating: parseOptionalRating(sideRatingEl.value),
        setlistUrl: sanitizeUrl(sideSetlistEl.value),
        posterUrl: sanitizeUrl(sidePosterEl.value),
        notes: cleanOptionalText(sideNotesEl.value)
      };

      if (!showsByVenue[venueToUse]) {
        showsByVenue[venueToUse] = [];
      }

      if (activeEditShowId) {
        showsByVenue[venueToUse] = showsByVenue[venueToUse].map(show => {
          if (show.id === activeEditShowId) {
            return { ...show, ...showPayload, id: show.id };
          }
          return show;
        });
      } else {
        showsByVenue[venueToUse].push({
          id: makeShowId(),
          ...showPayload
        });
      }

      saveShowsToFirestore();

      const savedYear = date ? date.slice(0, 4) : null;
      const defaultYear = getDefaultYearForVenue(venueToUse);
      const reopenYear = savedYear && savedYear === defaultYear ? savedYear : defaultYear;

      refreshVenuePopup(venueToUse, reopenYear, true);
      renderUpcomingWidget();
      renderStatsPanel();
      closeAddPanel();
    });
  
    renderUpcomingWidget();
    renderStatsPanel();

  });
