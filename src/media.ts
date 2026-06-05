

import type { Track } from './player';
import { player } from './player';

export class MediaController {
    initialize(): void {
        if (!('mediaSession' in navigator)) {
            return;
        }

        navigator.mediaSession.setActionHandler('play', async () => {
            await player.play();
        });

        navigator.mediaSession.setActionHandler('pause', () => {
            player.pause();
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
            player.next();
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
            player.previous();
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
        });
    }

    updatePlaybackState(): void {
        if (!('mediaSession' in navigator)) {
            return;
        }

        navigator.mediaSession.playbackState =
            player.isPlaying() ? 'playing' : 'paused';
    }
}

export const mediaController = new MediaController();