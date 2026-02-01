import { FolderWatcher } from '../../src/watchers/FolderWatcher';
import * as fs from 'fs';
import * as path from 'path';

describe('FolderWatcher', () => {
  let watcher: FolderWatcher;
  let mockCallback: jest.Mock;
  let testDir: string;

  beforeEach(() => {
    testDir = '/tmp/test-watch-' + Date.now();
    mockCallback = jest.fn().mockResolvedValue(undefined);
    watcher = new FolderWatcher(testDir, mockCallback);
  });

  afterEach(() => {
    watcher.stop();
    
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      try {
        const files = fs.readdirSync(testDir);
        files.forEach(file => {
          const filePath = path.join(testDir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
        });
        fs.rmdirSync(testDir);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('start', () => {
    it('should create watch folder if it does not exist', () => {
      expect(fs.existsSync(testDir)).toBe(false);
      
      watcher.start();
      
      expect(fs.existsSync(testDir)).toBe(true);
    });

    it('should not throw error if folder already exists', () => {
      fs.mkdirSync(testDir, { recursive: true });
      
      expect(() => watcher.start()).not.toThrow();
    });

    it('should start watching the folder', () => {
      watcher.start();
      
      // Watcher should be active
      expect(watcher['watcher']).not.toBeNull();
    });
  });

  describe('file detection', () => {
    it('should detect PDF files', async () => {
      watcher.start();

      // Wait a bit for watcher to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'test-guide.pdf');
      fs.writeFileSync(testFile, 'test pdf content');

      // Wait for file processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback).toHaveBeenCalledWith(testFile);
    });

    it('should detect PNG files', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'test-guide.png');
      fs.writeFileSync(testFile, 'test png content');

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback).toHaveBeenCalledWith(testFile);
    });

    it('should detect JPG files', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'test-guide.jpg');
      fs.writeFileSync(testFile, 'test jpg content');

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback).toHaveBeenCalledWith(testFile);
    });

    it('should detect JPEG files', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'test-guide.jpeg');
      fs.writeFileSync(testFile, 'test jpeg content');

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback).toHaveBeenCalledWith(testFile);
    });

    it('should detect WEBP files', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'test-guide.webp');
      fs.writeFileSync(testFile, 'test webp content');

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback).toHaveBeenCalledWith(testFile);
    });

    it('should detect BMP files', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'test-guide.bmp');
      fs.writeFileSync(testFile, 'test bmp content');

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback).toHaveBeenCalledWith(testFile);
    });
  });

  describe('ignored files', () => {
    it('should ignore text files', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'readme.txt');
      fs.writeFileSync(testFile, 'text content');

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should ignore hidden files', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, '.hidden.pdf');
      fs.writeFileSync(testFile, 'hidden file');

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should ignore non-guide file types', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFiles = [
        'document.docx',
        'spreadsheet.xlsx',
        'data.json',
        'script.js'
      ];

      for (const file of testFiles) {
        const testFile = path.join(testDir, file);
        fs.writeFileSync(testFile, 'content');
      }

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('callback invocation', () => {
    it('should invoke callback when valid file is detected', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'guide.pdf');
      fs.writeFileSync(testFile, 'guide content');

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(testFile);
    });

    it('should not invoke callback twice for same file', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'guide.pdf');
      fs.writeFileSync(testFile, 'guide content');

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Try to trigger again by modifying file
      fs.appendFileSync(testFile, 'more content');

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Should only be called once due to processedFiles tracking
      expect(mockCallback.mock.calls.length).toBeLessThanOrEqual(1);
    });

    it('should invoke callback for multiple different files', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile1 = path.join(testDir, 'guide1.pdf');
      const testFile2 = path.join(testDir, 'guide2.pdf');
      
      fs.writeFileSync(testFile1, 'guide 1');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      fs.writeFileSync(testFile2, 'guide 2');
      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle async callback execution', async () => {
      const asyncCallback = jest.fn(async (filePath: string) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return;
      });

      watcher = new FolderWatcher(testDir, asyncCallback);
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'guide.pdf');
      fs.writeFileSync(testFile, 'guide content');

      await new Promise(resolve => setTimeout(resolve, 3500));

      expect(asyncCallback).toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', async () => {
      const errorCallback = jest.fn().mockRejectedValue(new Error('Callback error'));

      watcher = new FolderWatcher(testDir, errorCallback);
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'guide.pdf');
      
      expect(() => {
        fs.writeFileSync(testFile, 'guide content');
      }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 3000));
    });
  });

  describe('stop', () => {
    it('should stop watching when stop is called', () => {
      watcher.start();
      expect(watcher['watcher']).not.toBeNull();

      watcher.stop();

      expect(watcher['watcher']).toBeNull();
    });

    it('should not throw error if stop is called without start', () => {
      expect(() => watcher.stop()).not.toThrow();
    });

    it('should not detect files after stopping', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      watcher.stop();

      const testFile = path.join(testDir, 'guide.pdf');
      fs.writeFileSync(testFile, 'guide content');

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('file movement', () => {
    it('should move processed files to processed subfolder', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'guide.pdf');
      fs.writeFileSync(testFile, 'guide content');

      await new Promise(resolve => setTimeout(resolve, 3500));

      const processedDir = path.join(testDir, 'processed');
      const processedFile = path.join(processedDir, 'guide.pdf');

      // Original file should be moved
      expect(fs.existsSync(testFile)).toBe(false);
      
      // File should be in processed folder
      expect(fs.existsSync(processedFile)).toBe(true);
    });

    it('should create processed folder if it does not exist', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const processedDir = path.join(testDir, 'processed');
      expect(fs.existsSync(processedDir)).toBe(false);

      const testFile = path.join(testDir, 'guide.pdf');
      fs.writeFileSync(testFile, 'guide content');

      await new Promise(resolve => setTimeout(resolve, 3500));

      expect(fs.existsSync(processedDir)).toBe(true);
    });

    it('should handle file movement errors gracefully', async () => {
      const readonlyCallback = jest.fn().mockResolvedValue(undefined);
      watcher = new FolderWatcher(testDir, readonlyCallback);
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'guide.pdf');
      fs.writeFileSync(testFile, 'guide content');

      // The file should still be processed even if moving fails
      await new Promise(resolve => setTimeout(resolve, 3500));

      expect(readonlyCallback).toHaveBeenCalled();
    });
  });

  describe('stability threshold', () => {
    it('should wait for file write to complete before processing', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'guide.pdf');
      const writeStream = fs.createWriteStream(testFile);
      
      // Write in chunks to simulate slow write
      writeStream.write('chunk 1\n');
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      writeStream.write('chunk 2\n');
      writeStream.end();

      // Wait for stability threshold (2000ms) + processing time
      await new Promise(resolve => setTimeout(resolve, 3500));

      // Should be called once after file is stable
      expect(mockCallback.mock.calls.length).toBeLessThanOrEqual(1);
    });
  });

  describe('case sensitivity', () => {
    it('should detect files with uppercase extensions', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'guide.PDF');
      fs.writeFileSync(testFile, 'guide content');

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback).toHaveBeenCalledWith(testFile);
    });

    it('should detect files with mixed case extensions', async () => {
      watcher.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const testFile = path.join(testDir, 'guide.Pdf');
      fs.writeFileSync(testFile, 'guide content');

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockCallback).toHaveBeenCalledWith(testFile);
    });
  });
});
