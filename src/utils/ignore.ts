import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * Tema dosyaları için tek ortak yok sayma ve izin listesi.
 * ZIP senkronizasyonu (dev, push), paketleme (pack) ve izleyici (dev watch) aynı kuralları kullanır.
 *
 * Sunucudaki kurallarla uyumludur (backend: src/modules/website/v2/theme/theme-file-path.ts):
 * izin verilen uzantılar, 10 MB tekil dosya sınırı ve dosya yolu doğrulaması.
 */

/** Her seviyede yok sayılan klasörler (nokta ile başlayan tüm klasörler de yok sayılır) */
export const IGNORED_DIRECTORIES = ['node_modules', 'dist'];

/** Her seviyede yok sayılan dosya adları (nokta ile başlayan tüm dosyalar da yok sayılır) */
export const IGNORED_FILE_NAMES = ['desktop.ini', 'Thumbs.db'];

/** Yok sayılan uzantılar */
export const IGNORED_EXTENSIONS = ['.zip'];

/** Yalnızca yerelde tutulan dosyalar: sunucu senkronizasyonda bunları zaten atlar */
export const LOCAL_ONLY_FILES = ['crafter-manifest.json'];

/** Sunucunun kabul ettiği tema dosyası uzantıları */
export const ALLOWED_THEME_EXTENSIONS = {
    assets: ['.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.otf', '.webp', '.gif', '.ico'],
    core: ['.liquid', '.json', '.html'],
};

/** Sunucunun tekil dosya için kabul ettiği üst sınır (10 MB) */
export const MAX_THEME_FILE_BYTES = 10 * 1024 * 1024;

const MAX_THEME_FILE_KEY_LENGTH = 512;

/** Mutlak dosya yolunu tema içindeki göreli, "/" ayraçlı anahtara çevirir */
export function toThemeKey(projectDir: string, filePath: string): string {
    return path.relative(projectDir, filePath).split(path.sep).join('/');
}

/**
 * Göreli yol (dosya veya klasör) hiç dikkate alınmamalı mı?
 * Gizli dosya/klasörler (.env, .git, .crafter, .DS_Store ...), node_modules, dist, .zip vb.
 */
export function isIgnoredPath(relPath: string): boolean {
    const normalized = relPath.replace(/\\/g, '/');
    if (!normalized || normalized === '.') return false;
    const parts = normalized.split('/').filter((p) => p.length > 0);
    for (const part of parts) {
        if (part === '..') continue;
        if (part.startsWith('.')) return true;
        if (IGNORED_DIRECTORIES.includes(part)) return true;
        if (IGNORED_FILE_NAMES.includes(part)) return true;
    }
    const ext = path.extname(normalized).toLowerCase();
    return IGNORED_EXTENSIONS.includes(ext);
}

export function isAllowedThemeExtension(relPath: string): boolean {
    const ext = path.extname(relPath).toLowerCase();
    return ALLOWED_THEME_EXTENSIONS.assets.includes(ext) || ALLOWED_THEME_EXTENSIONS.core.includes(ext);
}

export type SkipReason = 'extension' | 'size' | 'path';

export interface SkippedFile {
    key: string;
    reason: SkipReason;
}

/**
 * Dosya sunucuya gönderilebilir mi? Gönderilemiyorsa nedeni döner.
 * (Yok sayılan ve yalnızca yerel dosyalar bu kontrolden önce elenir.)
 */
export function getUploadSkipReason(key: string, sizeBytes?: number): SkipReason | null {
    // eslint-disable-next-line no-control-regex
    if (key.length > MAX_THEME_FILE_KEY_LENGTH || /[\u0000-\u001f\u007f%\\]/.test(key)) return 'path';
    if (!isAllowedThemeExtension(key)) return 'extension';
    if (sizeBytes !== undefined && sizeBytes > MAX_THEME_FILE_BYTES) return 'size';
    return null;
}

export function describeSkipReason(reason: SkipReason): string {
    switch (reason) {
        case 'extension':
            return 'sunucu bu dosya türünü kabul etmiyor / file type not allowed by the server';
        case 'size':
            return 'dosya 10 MB sınırını aşıyor / file exceeds the 10 MB limit';
        case 'path':
            return 'dosya yolu geçersiz karakter içeriyor veya çok uzun / invalid or too long file path';
    }
}

export interface CollectOptions {
    /** pack için: crafter-manifest.json pakete dahil edilsin mi */
    includeLocalOnly?: boolean;
}

export interface CollectResult {
    /** Gönderilecek dosyaların göreli anahtarları (sıralı) */
    files: string[];
    /** İzin listesi veya boyut nedeniyle atlanan dosyalar */
    skipped: SkippedFile[];
}

/**
 * Proje klasöründeki tema dosyalarını ortak kurallarla toplar.
 * Sembolik bağlantılar izlenmez (proje dışındaki dosyalar pakete girmesin).
 */
export async function collectThemeFiles(projectDir: string, options: CollectOptions = {}): Promise<CollectResult> {
    const files: string[] = [];
    const skipped: SkippedFile[] = [];

    const walk = async (dir: string) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const abs = path.join(dir, entry.name);
            const key = toThemeKey(projectDir, abs);
            if (isIgnoredPath(key)) continue;
            if (entry.isDirectory()) {
                await walk(abs);
                continue;
            }
            if (!entry.isFile()) continue;
            if (LOCAL_ONLY_FILES.includes(key) && !options.includeLocalOnly) continue;

            const stat = await fs.stat(abs);
            const reason = getUploadSkipReason(key, stat.size);
            if (reason) {
                skipped.push({ key, reason });
                continue;
            }
            files.push(key);
        }
    };

    await walk(projectDir);
    files.sort();
    skipped.sort((a, b) => a.key.localeCompare(b.key));
    return { files, skipped };
}

/** Atlanan dosyalar için kısa uyarı satırları (çok fazlaysa özetler) */
export function formatSkippedFiles(skipped: SkippedFile[], limit = 10): string[] {
    const lines = skipped.slice(0, limit).map((s) => `  - ${s.key}: ${describeSkipReason(s.reason)}`);
    if (skipped.length > limit) {
        lines.push(`  ... ve ${skipped.length - limit} dosya daha / and ${skipped.length - limit} more`);
    }
    return lines;
}
