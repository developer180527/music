import { player } from './player';
import { library } from './library';
import { mediaController } from './media';
import { musicDb } from './db';
import './app.css';

// ── DOM refs ──────────────────────────────────────────────

const fileInput       = document.getElementById('file-picker')         as HTMLInputElement;
const libraryEl       = document.getElementById('library')             as HTMLElement;
const trackCountEl    = document.getElementById('track-count')         as HTMLElement;
const emptyStateEl    = document.getElementById('empty-state')         as HTMLElement;

// Mini player
const miniPlayer      = document.getElementById('mini-player')         as HTMLElement;
const miniTitle       = document.getElementById('mini-title')          as HTMLElement;
const miniArt         = document.getElementById('mini-art')            as HTMLElement;
const miniPlayBtn     = document.getElementById('mini-play')           as HTMLButtonElement;
const miniPlayIcon    = document.getElementById('mini-play-icon')      as HTMLElement;
const miniNextBtn     = document.getElementById('mini-next')           as HTMLButtonElement;
const miniProgressBar = document.getElementById('mini-progress-bar')   as HTMLElement;

// Full player
const pagePlayer      = document.getElementById('page-player')         as HTMLElement;
const playerTitle     = document.getElementById('player-title')        as HTMLElement;
const playerArtist    = document.getElementById('player-artist')       as HTMLElement;
const playerCover     = document.getElementById('player-cover')        as HTMLElement;
const playerProgressTrack = document.getElementById('player-progress-track') as HTMLElement;
const playerProgressFill  = document.getElementById('player-progress-fill')  as HTMLElement;
const playerTimeCur   = document.getElementById('player-time-cur')     as HTMLElement;
const playerTimeTot   = document.getElementById('player-time-tot')     as HTMLElement;
const pPlayBtn        = document.getElementById('p-play')              as HTMLButtonElement;
const pPlayIcon       = document.getElementById('p-play-icon')         as HTMLElement;
const pPrevBtn        = document.getElementById('p-prev')              as HTMLButtonElement;
const pNextBtn        = document.getElementById('p-next')              as HTMLButtonElement;
const pShuffleBtn     = document.getElementById('p-shuffle')           as HTMLButtonElement;
const pRepeatBtn      = document.getElementById('p-repeat')            as HTMLButtonElement;
const playerHandleArea = document.getElementById('player-handle-area') as HTMLElement;
const playerScroll    = document.getElementById('player-scroll')       as HTMLElement;

// Settings
const settingsBtn        = document.getElementById('settings-btn')         as HTMLButtonElement;
const settingsClose      = document.getElementById('settings-close')       as HTMLButtonElement;
const pageSettings       = document.getElementById('page-settings')        as HTMLElement;
const settingsHandleArea = document.getElementById('settings-handle-area') as HTMLElement;
const themeGrid          = document.getElementById('theme-grid')           as HTMLElement;

// ── State ─────────────────────────────────────────────────

let playerOpen  = false;
let shuffleOn   = false;
let repeatOn    = false;

// ── Helpers ───────────────────────────────────────────────

function formatTime(s: number): string {
    if (!isFinite(s) || s < 0) return '--:--';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function resolveDuration(url: string): Promise<number> {
    return new Promise(resolve => {
        const a = new Audio();
        a.src = url;
        a.addEventListener('loadedmetadata', () => resolve(a.duration), { once: true });
        a.addEventListener('error', () => resolve(0), { once: true });
    });
}

// ── Player sheet open/close ───────────────────────────────

function openPlayer(): void {
    playerOpen = true;
    pagePlayer.classList.add('open');
    pagePlayer.setAttribute('aria-hidden', 'false');
    // Reset scroll to top when opening
    playerScroll.scrollTop = 0;
}

function closePlayer(): void {
    playerOpen = false;
    pagePlayer.classList.remove('open');
    pagePlayer.setAttribute('aria-hidden', 'true');
}

// Swipe-down-to-close — bound ONLY to the handle area at the very top of a
// sheet. Dragging anywhere else (cover, controls, scroll body) never closes it.
function initSheetClose(sheet: HTMLElement, handle: HTMLElement, close: () => void): void {
    let startY = 0;
    let dragging = false;
    let dy = 0;

    function start(y: number): void {
        startY = y;
        dragging = true;
        dy = 0;
        sheet.classList.add('dragging');
    }

    function move(y: number): void {
        if (!dragging) return;
        dy = Math.max(0, y - startY);
        sheet.style.transform = `translateY(${dy}px)`;
    }

    function end(): void {
        if (!dragging) return;
        dragging = false;
        sheet.classList.remove('dragging');
        sheet.style.transform = '';
        if (dy > 80) close();
        dy = 0;
    }

    handle.addEventListener('touchstart', e => start(e.touches[0].clientY), { passive: true });
    handle.addEventListener('touchmove',  e => { e.preventDefault(); move(e.touches[0].clientY); }, { passive: false });
    handle.addEventListener('touchend', end);
    handle.addEventListener('touchcancel', end);

    // Mouse (desktop)
    handle.addEventListener('mousedown', e => {
        start(e.clientY);
        const mm = (ev: MouseEvent) => move(ev.clientY);
        const mu = () => { end(); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
        window.addEventListener('mousemove', mm);
        window.addEventListener('mouseup', mu);
    });
}

// ── Settings sheet ────────────────────────────────────────

function openSettings(): void {
    pageSettings.classList.add('open');
    pageSettings.setAttribute('aria-hidden', 'false');
}

function closeSettings(): void {
    pageSettings.classList.remove('open');
    pageSettings.setAttribute('aria-hidden', 'true');
}

// ── Themes ────────────────────────────────────────────────

interface Theme { id: string; name: string; bg: string; accent: string; }

const THEMES: Theme[] = [
    { id: 'onyx',    name: 'Onyx',    bg: '#0e0e0e', accent: '#f0f0f0' },
    { id: 'indigo',  name: 'Indigo',  bg: '#0d0e14', accent: '#7c83ff' },
    { id: 'emerald', name: 'Emerald', bg: '#0a0f0d', accent: '#34d399' },
    { id: 'rose',    name: 'Rose',    bg: '#120c0e', accent: '#fb7185' },
    { id: 'light',   name: 'Light',   bg: '#f5f5f7', accent: '#1a1a22' },
];
const THEME_KEY = 'pulse-theme';

function applyTheme(id: string): void {
    const theme = THEMES.find(t => t.id === id) ?? THEMES[0];
    document.documentElement.setAttribute('data-theme', theme.id);
    try { localStorage.setItem(THEME_KEY, theme.id); } catch { /* private mode */ }

    // Keep the browser/PWA chrome colour in step with the palette.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.bg);

    themeGrid.querySelectorAll<HTMLElement>('.theme-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.theme === theme.id);
    });
}

function renderThemes(): void {
    let current = 'onyx';
    try { current = localStorage.getItem(THEME_KEY) || 'onyx'; } catch { /* private mode */ }

    themeGrid.innerHTML = THEMES.map(t => `
        <button class="theme-card${t.id === current ? ' selected' : ''}" data-theme="${t.id}">
            <span class="theme-swatch" style="background:${t.bg}">
                <span class="theme-dot" style="background:${t.accent}"></span>
            </span>
            <span class="theme-name">${t.name}</span>
            <i class="ti ti-check theme-check"></i>
        </button>
    `).join('');

    themeGrid.querySelectorAll<HTMLElement>('.theme-card').forEach(card => {
        card.addEventListener('click', () => applyTheme(card.dataset.theme || 'onyx'));
    });

    // Sync data-theme + meta colour with whatever was restored on load.
    applyTheme(current);
}

// ── UI sync ───────────────────────────────────────────────

function setPlayIcons(playing: boolean): void {
    const cls = playing ? 'ti ti-player-pause' : 'ti ti-player-play';
    pPlayIcon.className = cls;
    miniPlayIcon.className = cls;
}

function syncTrackUI(): void {
    const track = player.getCurrentTrack();
    if (!track) return;

    const name = track.name;

    // Mini player
    miniTitle.textContent = name;
    miniPlayer.classList.remove('hidden');

    // Full player
    playerTitle.textContent = name;
    playerArtist.textContent = 'Unknown Artist';

    setPlayIcons(player.isPlaying());
    refreshActiveRow();

    mediaController.update(track);
    mediaController.updatePlaybackState();
    mediaController.updatePositionState();
}

// Quick "tap registered" animation on a library row.
function animateRowTap(row: HTMLElement): void {
    row.classList.remove('tapped');
    void row.offsetWidth; // force reflow so the animation restarts on re-tap
    row.classList.add('tapped');
    row.addEventListener('animationend', () => row.classList.remove('tapped'), { once: true });
    // Harmless on iOS (unsupported); gives a subtle buzz on Android.
    navigator.vibrate?.(8);
}

function refreshActiveRow(): void {
    const current = player.getCurrentTrack();
    libraryEl.querySelectorAll<HTMLElement>('.track-row').forEach(row => {
        const isActive = row.dataset.trackId === current?.id;
        row.classList.toggle('active', isActive);
        const eqEl = row.querySelector<HTMLElement>('.track-thumb-eq');
        if (eqEl) eqEl.style.display = isActive ? 'flex' : 'none';
    });
}

// ── Progress ──────────────────────────────────────────────

function initProgress(): void {
    const audio = player.getAudio();
    let rafId = 0;
    let scrubbing = false;

    function paint(): void {
        const d = audio.duration;
        const pct = d > 0 ? (audio.currentTime / d) * 100 : 0;
        playerProgressFill.style.width = pct + '%';
        miniProgressBar.style.width = pct + '%';
        playerTimeCur.textContent = formatTime(audio.currentTime);
        playerTimeTot.textContent = formatTime(d);
    }

    // Animation-frame loop: paints the fill every frame while playing so the
    // bar glides smoothly instead of jumping on each 'timeupdate' (~4/sec).
    function loop(): void {
        rafId = 0;
        if (!scrubbing) paint();
        if (player.isPlaying() && !scrubbing) rafId = requestAnimationFrame(loop);
    }
    function startLoop(): void { if (!rafId) rafId = requestAnimationFrame(loop); }
    function stopLoop(): void { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }

    audio.addEventListener('play', startLoop);
    audio.addEventListener('playing', startLoop);
    audio.addEventListener('pause', () => { stopLoop(); paint(); });
    audio.addEventListener('ended', stopLoop);
    audio.addEventListener('loadedmetadata', () => { paint(); mediaController.updatePositionState(); });
    audio.addEventListener('timeupdate', () => {
        if (!player.isPlaying() && !scrubbing) paint();   // stay in sync while paused
        mediaController.updatePositionState();              // feed the lock-screen scrubber
    });

    // ── Scrubbing: pointer events cover mouse + touch with one code path ──
    function ratioFromX(clientX: number): number {
        const rect = playerProgressTrack.getBoundingClientRect();
        return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    }

    function previewAt(ratio: number): void {
        const pct = ratio * 100;
        playerProgressFill.style.width = pct + '%';
        miniProgressBar.style.width = pct + '%';
        const d = audio.duration;
        if (isFinite(d) && d > 0) playerTimeCur.textContent = formatTime(ratio * d);
    }

    playerProgressTrack.addEventListener('pointerdown', (e: PointerEvent) => {
        scrubbing = true;
        stopLoop();
        playerProgressTrack.classList.add('scrubbing');
        try { playerProgressTrack.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
        previewAt(ratioFromX(e.clientX));
    });

    playerProgressTrack.addEventListener('pointermove', (e: PointerEvent) => {
        if (scrubbing) previewAt(ratioFromX(e.clientX));
    });

    function endScrub(e: PointerEvent): void {
        if (!scrubbing) return;
        scrubbing = false;
        playerProgressTrack.classList.remove('scrubbing');
        const d = audio.duration;
        if (isFinite(d) && d > 0) {
            player.seek(ratioFromX(e.clientX) * d);   // commit the seek (also handles taps)
            mediaController.updatePositionState();
        }
        paint();
        if (player.isPlaying()) startLoop();
    }

    playerProgressTrack.addEventListener('pointerup', endScrub);
    playerProgressTrack.addEventListener('pointercancel', endScrub);
}

// ── Library render ────────────────────────────────────────

function renderLibrary(): void {
    libraryEl.innerHTML = '';
    const tracks = library.getAll();

    trackCountEl.textContent = `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`;
    emptyStateEl.classList.toggle('hidden', tracks.length > 0);

    const current = player.getCurrentTrack();

    tracks.forEach((track, index) => {
        const row = document.createElement('button');
        row.className = 'track-row';
        row.dataset.trackId = track.id;
        if (current?.id === track.id) row.classList.add('active');

        row.innerHTML = `
            <div class="track-thumb">
                <i class="ti ti-music"></i>
                <div class="track-thumb-eq" style="display:${current?.id === track.id ? 'flex' : 'none'}">
                    <div class="eq-bars">
                        <div class="bar"></div>
                        <div class="bar"></div>
                        <div class="bar"></div>
                    </div>
                </div>
            </div>
            <div class="track-row-info">
                <div class="track-row-name">${escapeHtml(track.name)}</div>
                <div class="track-row-artist">Unknown Artist</div>
            </div>
            <span class="track-row-dur mono">--:--</span>
        `;

        row.addEventListener('click', () => {
            // Acknowledge the tap and update the UI optimistically — play(index)
            // sets the current track + src synchronously, so the mini-player,
            // active row and icons all reflect the new track immediately rather
            // than waiting for the audio to actually start.
            animateRowTap(row);
            player.play(index).catch(() => {});
            syncTrackUI();
        });

        libraryEl.appendChild(row);

        // Resolve duration async
        resolveDuration(track.url).then(dur => {
            const durEl = row.querySelector('.track-row-dur');
            if (durEl) durEl.textContent = formatTime(dur);
        });
    });
}

// ── Restore from DB ───────────────────────────────────────

async function restoreLibrary(): Promise<void> {
    const stored = await musicDb.getTracks();
    for (const s of stored) {
        const t = player.addTrack(s.file);
        library.add(t);
    }
    renderLibrary();
}

// ── Main init ─────────────────────────────────────────────

async function initialize(): Promise<void> {
    await musicDb.initialize();
    // Lock-screen / hardware controls re-render the app via syncTrackUI.
    mediaController.onAction = syncTrackUI;
    mediaController.initialize();
    await restoreLibrary();

    initProgress();
    initSheetClose(pagePlayer, playerHandleArea, closePlayer);
    initSheetClose(pageSettings, settingsHandleArea, closeSettings);
    renderThemes();

    // ── Settings sheet open/close
    settingsBtn.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', closeSettings);

    // ── Mini player → open full player
    miniPlayer.addEventListener('click', (e: MouseEvent) => {
        // Don't open if clicking the control buttons
        if ((e.target as HTMLElement).closest('.mini-controls')) return;
        openPlayer();
    });

    // ── Mini player controls
    miniPlayBtn.addEventListener('click', async (e: MouseEvent) => {
        e.stopPropagation();
        await player.toggle();
        setPlayIcons(player.isPlaying());
        mediaController.updatePlaybackState();
    });

    miniNextBtn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        player.next();
        syncTrackUI();
    });

    // ── Full player controls
    pPlayBtn.addEventListener('click', async () => {
        await player.toggle();
        setPlayIcons(player.isPlaying());
        mediaController.updatePlaybackState();
    });

    pPrevBtn.addEventListener('click', () => {
        player.previous();
        syncTrackUI();
    });

    pNextBtn.addEventListener('click', () => {
        player.next();
        syncTrackUI();
    });

    pShuffleBtn.addEventListener('click', () => {
        shuffleOn = !shuffleOn;
        pShuffleBtn.classList.toggle('active', shuffleOn);
    });

    pRepeatBtn.addEventListener('click', () => {
        repeatOn = !repeatOn;
        pRepeatBtn.classList.toggle('active', repeatOn);
    });

    // Volume is governed by the device now that the in-app slider is gone.
    player.setVolume(1);

    // File picker
    fileInput.addEventListener('change', async () => {
        if (!fileInput.files?.length) return;

        const tracks = player.addTracks(fileInput.files);
        library.addMany(tracks);

        for (const track of tracks) {
            await musicDb.saveTrack(track);
        }

        renderLibrary();

        if (player.getCurrentTrack() === null && tracks.length > 0) {
            await player.play(0);
            syncTrackUI();
        }

        fileInput.value = '';
    });

    // Auto-advance (single source of truth for 'ended' — player no longer
    // advances on its own, which previously double-skipped tracks).
    player.getAudio().addEventListener('ended', () => {
        if (repeatOn) {
            player.seek(0);
            void player.play();   // replay same track from the start
            setPlayIcons(true);
            mediaController.updatePlaybackState();
        } else {
            player.next();
            syncTrackUI();
        }
    });
}

void initialize();

// ── Service Worker registration ───────────────────────────

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/service-worker.js')
            .catch((err) => console.warn('SW registration failed:', err));
    });
}