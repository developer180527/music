

import type { Track } from './player';

export class Library {
    private tracks: Track[] = [];

    add(track: Track): void {
        this.tracks.push(track);
    }

    addMany(tracks: Track[]): void {
        this.tracks.push(...tracks);
    }

    remove(trackId: string): void {
        this.tracks = this.tracks.filter(track => track.id !== trackId);
    }

    clear(): void {
        this.tracks = [];
    }

    getAll(): Track[] {
        return [...this.tracks];
    }

    get(trackId: string): Track | undefined {
        return this.tracks.find(track => track.id === trackId);
    }

    size(): number {
        return this.tracks.length;
    }

    isEmpty(): boolean {
        return this.tracks.length === 0;
    }

    search(query: string): Track[] {
        const normalized = query.toLowerCase().trim();

        return this.tracks.filter(track =>
            track.name.toLowerCase().includes(normalized)
        );
    }
}

export const library = new Library();