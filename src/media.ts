

import type { Track } from './player';
import { player } from './player';

export class MediaController {
    /**
     * Called after a lock-screen / hardware media action so the in-app UI can
     * re-render from the new player state. App sets this to `syncTrackUI`.
     */
    onAction: (() => void) | null = null;

    initialize(): void {
        if (!('mediaSession' in navigator)) {
            return;
        }

        const ms = navigator.mediaSession;

        // Some Safari versions throw on unsupported actions — guard each one.
        const setHandler = (
            action: MediaSessionAction,
            handler: MediaSessionActionHandler | null,
        ): void => {
            try {
                ms.setActionHandler(action, handler);
            } catch {
                /* action not supported on this platform */
            }
        };

        setHandler('play', async () => {
            await player.play();
            this.afterAction();
        });

        setHandler('pause', () => {
            player.pause();
            this.afterAction();
        });

        setHandler('previoustrack', () => {
            player.previous();
            this.afterAction();
        });

        setHandler('nexttrack', () => {
            player.next();
            this.afterAction();
        });

        // Absolute scrub from the lock-screen progress bar.
        setHandler('seekto', (details) => {
            if (typeof details.seekTime !== 'number') return;
            player.seek(details.seekTime);
            this.afterAction();
        });

        // NOTE: intentionally NOT registering 'seekbackward' / 'seekforward'.
        // On iOS those replace the prev/next-track buttons with 15s skip
        // buttons; we want the track buttons plus the scrubber (seekto).

        setHandler('stop', () => {
            player.pause();
            this.afterAction();
        });
    }

    update(track: Track): void {
        if (!('mediaSession' in navigator)) {
            return;
        }

        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.name,
            artist: 'Unknown Artist',
            album: 'Local Library',
            artwork: [
                { src: '/icons/icon.png', sizes: '1024x1024', type: 'image/png' },
            ],
        });
    }

    updatePlaybackState(): void {
        if (!('mediaSession' in navigator)) {
            return;
        }

        navigator.mediaSession.playbackState =
            player.isPlaying() ? 'playing' : 'paused';
    }

    /**
     * Feeds the current position/duration to the OS so the lock-screen
     * scrubber tracks playback and seeking lands accurately.
     */
    updatePositionState(): void {
        if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) {
            return;
        }

        const audio = player.getAudio();
        const duration = audio.duration;

        // Bail until metadata has loaded; setPositionState throws on NaN/0.
        if (!isFinite(duration) || duration <= 0) {
            navigator.mediaSession.setPositionState();
            return;
        }

        const position = Math.min(Math.max(audio.currentTime, 0), duration);

        try {
            navigator.mediaSession.setPositionState({
                duration,
                playbackRate: audio.playbackRate || 1,
                position,
            });
        } catch {
            /* ignore invalid intermediate states during a track switch */
        }
    }

    private afterAction(): void {
        this.updatePlaybackState();
        this.updatePositionState();
        this.onAction?.();
    }
}

export const mediaController = new MediaController();
