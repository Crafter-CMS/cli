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
