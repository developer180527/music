

export interface Track {
    id: string;
    name: string;
    file: File;
    url: string;
}

export class Player {
    private audio: HTMLAudioElement;
    private tracks: Track[] = [];
    private currentIndex = -1;

    constructor() {
        this.audio = new Audio();

        this.audio.addEventListener('ended', () => {
            this.next();
            this.onTrackChange?.();
        });
    }
    onTrackChange: (() => void) | null = null;

    addTrack(file: File): Track {
        const track: Track = {
            id: crypto.randomUUID(),
            name: file.name,
            file,
            url: URL.createObjectURL(file),
        };

        this.tracks.push(track);

        return track;
    }

    addTracks(files: FileList): Track[] {
        const added: Track[] = [];

        for (const file of Array.from(files)) {
            added.push(this.addTrack(file));
        }

        return added;
    }

    play(index?: number): Promise<void> {
        if (typeof index === 'number') {
            if (index < 0 || index >= this.tracks.length) {
                return Promise.resolve();
            }

            this.currentIndex = index;
            this.audio.src = this.tracks[index].url;
        }

        return this.audio.play();
    }

    pause(): void {
        this.audio.pause();
    }

    async toggle(): Promise<void> {
        if (this.audio.paused) {
            await this.audio.play();
        } else {
            this.audio.pause();
        }
    }

    next(): void {
        if (!this.tracks.length) return;

        const nextIndex = (this.currentIndex + 1) % this.tracks.length;

        void this.play(nextIndex);
        this.onTrackChange?.();
    }

    previous(): void {
        if (!this.tracks.length) return;

        const previousIndex =
            (this.currentIndex - 1 + this.tracks.length) % this.tracks.length;

        void this.play(previousIndex);
        this.onTrackChange?.();
    }

    seek(seconds: number): void {
        this.audio.currentTime = seconds;
    }

    setVolume(volume: number): void {
        this.audio.volume = Math.max(0, Math.min(1, volume));
    }

    getCurrentTrack(): Track | null {
        if (this.currentIndex < 0) return null;

        return this.tracks[this.currentIndex] ?? null;
    }

    getTracks(): Track[] {
        return this.tracks;
    }

    getAudio(): HTMLAudioElement {
        return this.audio;
    }

    isPlaying(): boolean {
        return !this.audio.paused;
    }
}

export const player = new Player();