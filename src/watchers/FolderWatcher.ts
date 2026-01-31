import * as fs from 'fs';
import * as path from 'path';
import chokidar from 'chokidar';

export class FolderWatcher {
    private watchPath: string;
    private onFile: (filePath: string) => Promise<void>;
    private watcher: chokidar.FSWatcher | null = null;
    private processedFiles: Set<string> = new Set();

    constructor(watchPath: string, onFile: (filePath: string) => Promise<void>) {
        this.watchPath = watchPath;
        this.onFile = onFile;
    }

    start(): void {
        // Ensure folder exists
        if (!fs.existsSync(this.watchPath)) {
            fs.mkdirSync(this.watchPath, { recursive: true });
        }

        // Start watching
        this.watcher = chokidar.watch(this.watchPath, {
            ignored: /(^|[\/\\])\../, // Ignore hidden files
            persistent: true,
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100
            }
        });

        this.watcher
            .on('add', async (filePath) => {
                if (this.isValidFile(filePath) && !this.processedFiles.has(filePath)) {
                    this.processedFiles.add(filePath);
                    await this.onFile(filePath);
                    
                    // Move to processed folder
                    this.moveToProcessed(filePath);
                }
            })
            .on('error', (error) => {
                console.error('Watcher error:', error);
            });

        console.log(`👁️ Watching folder: ${this.watchPath}`);
    }

    stop(): void {
        if (this.watcher) {
            this.watcher.close();
            console.log('🛑 Folder watcher stopped');
        }
    }

    private isValidFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ['.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(ext);
    }

    private moveToProcessed(filePath: string): void {
        const processedDir = path.join(this.watchPath, 'processed');
        if (!fs.existsSync(processedDir)) {
            fs.mkdirSync(processedDir, { recursive: true });
        }

        const newPath = path.join(processedDir, path.basename(filePath));
        fs.renameSync(filePath, newPath);
    }
}
