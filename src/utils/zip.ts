import * as path from 'path';

/**
 * Archiver modülünün farklı sürümleriyle (v7 function vs v8 ZipArchive class)
 * ve CommonJS/ESM ortamlarıyla tam uyumlu ZIP arşivi oluşturucu.
 */
export function createZipArchive(options: any = { zlib: { level: 6 } }): any {
    const archiverModule = require('archiver');
    
    if (archiverModule.ZipArchive) {
        return new archiverModule.ZipArchive(options);
    }
    if (typeof archiverModule === 'function') {
        return archiverModule('zip', options);
    }
    if (archiverModule.default) {
        if (archiverModule.default.ZipArchive) {
            return new archiverModule.default.ZipArchive(options);
        }
        if (typeof archiverModule.default === 'function') {
            return archiverModule.default('zip', options);
        }
    }
    throw new Error('ZIP arşivleyici modülü başlatılamadı.');
}

/** Verilen tema dosyalarını (göreli anahtarlar) arşive ekler */
export function addThemeFiles(archive: any, projectDir: string, files: string[]): void {
    for (const key of files) {
        archive.file(path.join(projectDir, ...key.split('/')), { name: key });
    }
}

/** Verilen tema dosyalarını bellekte ZIP'ler */
export function createThemeZipBuffer(projectDir: string, files: string[], level = 6): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const bufs: Buffer[] = [];
        const archive = createZipArchive({ zlib: { level } });

        archive.on('data', (chunk: Buffer) => bufs.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(bufs)));
        archive.on('error', (err: any) => reject(err));

        addThemeFiles(archive, projectDir, files);
        archive.finalize();
    });
}
