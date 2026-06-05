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
const volumeSlider    = document.getElementById('volume-slider')       as HTMLInputElement;
const playerHandleArea = document.getElementById('player-handle-area') as HTMLElement;
const playerScroll    = document.getElementById('player-scroll')       as HTMLElement;

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

// Swipe-down-to-close on the handle + scroll detection
function initSheetGesture(): void {
    let startY = 0;
    let startScrollTop = 0;
    let dragging = false;
    let currentDY = 0;

    function onStart(y: number): void {
        startY = y;
        startScrollTop = playerScroll.scrollTop;
        dragging = false;
        currentDY = 0;
    }

    function onMove(y: number): void {
        const dy = y - startY;
        // Only drag the sheet when scroll is at top AND we're pulling down
        if (startScrollTop > 0) return;
        if (dy < 0) return;
        dragging = true;
        currentDY = dy;
        pagePlayer.classList.add('dragging');
        pagePlayer.style.transform = `translateY(${dy}px)`;
    }

    function onEnd(): void {
        pagePlayer.classList.remove('dragging');
        pagePlayer.style.transform = '';
        if (dragging && currentDY > 80) {
            closePlayer();
        }
        dragging = false;
        currentDY = 0;
    }

    // Touch
    playerHandleArea.addEventListener('touchstart', e => onStart(e.touches[0].clientY), { passive: true });
    playerHandleArea.addEventListener('touchmove',  e => onMove(e.touches[0].clientY),  { passive: true });
    playerHandleArea.addEventListener('touchend',   () => onEnd());

    // Mouse (desktop)
    playerHandleArea.addEventListener('mousedown', e => {
        onStart(e.clientY);
        const onMouseMove = (ev: MouseEvent) => onMove(ev.clientY);
        const onMouseUp   = () => { onEnd(); window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    // Scroll-to-top → swipe continues to close
    playerScroll.addEventListener('scroll', () => {
        if (playerScroll.scrollTop === 0 && playerOpen) {
            // already handled by drag
        }
    }, { passive: true });
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

    audio.addEventListener('timeupdate', () => {
        const pct = audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0;
        playerProgressFill.style.width = pct + '%';
        miniProgressBar.style.width = pct + '%';
        playerTimeCur.textContent = formatTime(audio.currentTime);
        playerTimeTot.textContent = formatTime(audio.duration);
    });

    // Click to seek
    playerProgressTrack.addEventListener('click', (e: MouseEvent) => {
        const rect = playerProgressTrack.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        const audio = player.getAudio();
        if (isFinite(audio.duration)) player.seek(ratio * audio.duration);
    });
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

        row.addEventListener('click', async () => {
            await player.play(index);
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
    mediaController.initialize();
    await restoreLibrary();

    initProgress();
    initSheetGesture();

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
        player.getAudio().loop = repeatOn;
    });

    // Volume
    player.setVolume(0.8);
    volumeSlider.addEventListener('input', () => {
        player.setVolume(Number(volumeSlider.value) / 100);
    });

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

    // Auto-advance
    player.getAudio().addEventListener('ended', () => {
        if (!repeatOn) {
            player.next();
            syncTrackUI();
        }
    });

    // Media session
    mediaController.initialize();
}

void initialize();