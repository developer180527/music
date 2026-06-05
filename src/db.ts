import type { Track } from './player';

const DB_NAME = 'pulse_music_db';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

interface StoredTrack {
    id: string;
    name: string;
    file: File;
}

export class MusicDatabase {
    private db: IDBDatabase | null = null;

    async initialize(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);

            request.onupgradeneeded = () => {
                const db = request.result;

                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, {
                        keyPath: 'id',
                    });
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
        });
    }

    async saveTrack(track: Track): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');

            tx.objectStore(STORE_NAME).put({
                id: track.id,
                name: track.name,
                file: track.file,
            });

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getTracks(): Promise<StoredTrack[]> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).getAll();

            request.onsuccess = () => {
                resolve(request.result as StoredTrack[]);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async deleteTrack(trackId: string): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');

            tx.objectStore(STORE_NAME).delete(trackId);

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async clear(): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');

            tx.objectStore(STORE_NAME).clear();

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
}

export const musicDb = new MusicDatabase();