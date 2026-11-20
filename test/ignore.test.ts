import { afterEach, describe, expect, it } from 'vitest';
import * as path from 'path';
import * as fs from 'fs-extra';
import AdmZipLike from './zip-reader';
import {
    collectThemeFiles,
    getUploadSkipReason,
    isIgnoredPath,
    MAX_THEME_FILE_BYTES,
    toThemeKey,
} from '../src/utils/ignore';
import { createThemeZipBuffer } from '../src/utils/zip';
import { makeTempDir, writeFiles } from './helpers';

const dirs: string[] = [];
afterEach(async () => {
    while (dirs.length) await fs.remove(dirs.pop() as string);
});

describe('isIgnoredPath (zip ve izleyici için ortak liste)', () => {
    it('gizli dosya ve klasörleri yok sayar', () => {
        expect(isIgnoredPath('.env')).toBe(true);
        expect(isIgnoredPath('.env.local')).toBe(true);
        expect(isIgnoredPath('.crafter')).toBe(true);
        expect(isIgnoredPath('.git/config')).toBe(true);
        expect(isIgnoredPath('assets/.DS_Store')).toBe(true);
        expect(isIgnoredPath('config/.secret/keys.json')).toBe(true);
        expect(isIgnoredPath('.temp-theme/layout/theme.liquid')).toBe(true);
    });

    it('node_modules, dist ve zip dosyalarını yok sayar', () => {
        expect(isIgnoredPath('node_modules/x/index.js')).toBe(true);
        expect(isIgnoredPath('dist/app.js')).toBe(true);
        expect(isIgnoredPath('theme.zip')).toBe(true);
        expect(isIgnoredPath('desktop.ini')).toBe(true);
    });

    it('normal tema dosyalarını ve adı "dist" içeren dosyaları yok saymaz', () => {
        expect(isIgnoredPath('')).toBe(false);
        expect(isIgnoredPath('layout/theme.liquid')).toBe(false);
        expect(isIgnoredPath('assets/distance.css')).toBe(false);
        expect(isIgnoredPath('templates/index.liquid')).toBe(false);
        expect(isIgnoredPath('assets')).toBe(false);
    });

    it('izleyicinin verdiği mutlak yolları da aynı kurala çevirir', () => {
        const root = path.resolve('/tmp/theme');
        expect(isIgnoredPath(toThemeKey(root, path.join(root, '.env')))).toBe(true);
        expect(isIgnoredPath(toThemeKey(root, path.join(root, 'assets', 'a.css')))).toBe(false);
        expect(isIgnoredPath(toThemeKey(root, root))).toBe(false);
    });
});

describe('getUploadSkipReason (sunucu izin listesi)', () => {
    it('izinli uzantıları kabul eder', () => {
        for (const key of ['layout/theme.liquid', 'config/settings_schema.json', 'assets/a.css', 'assets/a.JS', 'assets/logo.svg', 'assets/f.woff2', 'templates/x.html']) {
            expect(getUploadSkipReason(key)).toBeNull();
        }
    });

    it('izinsiz uzantıları reddeder', () => {
        for (const key of ['README.md', 'package-lock.txt', 'scripts/run.sh', 'assets/app.ts', 'LICENSE', 'assets/x.php']) {
            expect(getUploadSkipReason(key)).toBe('extension');
        }
    });

    it('10 MB üstünü reddeder', () => {
        expect(getUploadSkipReason('assets/big.png', MAX_THEME_FILE_BYTES)).toBeNull();
        expect(getUploadSkipReason('assets/big.png', MAX_THEME_FILE_BYTES + 1)).toBe('size');
    });

    it('sunucunun reddettiği yolları reddeder', () => {
        expect(getUploadSkipReason('assets/a%20b.css')).toBe('path');
        expect(getUploadSkipReason('a'.repeat(510) + '.css')).toBe('path');
    });
});

describe('collectThemeFiles', () => {
    it('gizli, izinsiz ve yalnızca yerel dosyaları ZIP listesine almaz', async () => {
        const root = await makeTempDir();
        dirs.push(root);
        await writeFiles(root, {
            '.env': 'SECRET=1',
            '.crafter': '{"themeId":"t"}',
            '.git/HEAD': 'ref',
            'assets/.DS_Store': 'x',
            'node_modules/pkg/index.js': 'x',
            'dist/out.js': 'x',
            'old.zip': 'x',
            'README.md': '# readme',
            'crafter-manifest.json': '{}',
            'layout/theme.liquid': '<html></html>',
            'assets/theme.css': 'body{}',
            'config/settings_schema.json': '[]',
        });

        const { files, skipped } = await collectThemeFiles(root);
        expect(files).toEqual(['assets/theme.css', 'config/settings_schema.json', 'layout/theme.liquid']);
        expect(skipped).toEqual([{ key: 'README.md', reason: 'extension' }]);

        const pack = await collectThemeFiles(root, { includeLocalOnly: true });
        expect(pack.files).toContain('crafter-manifest.json');
        expect(pack.files).not.toContain('.env');
    });

    it('üretilen ZIP içinde .env bulunmaz', async () => {
        const root = await makeTempDir();
        dirs.push(root);
        await writeFiles(root, {
            '.env': 'SECRET=1',
            'layout/theme.liquid': '<html></html>',
            'assets/theme.css': 'body{}',
        });
        const { files } = await collectThemeFiles(root);
        const zip = await createThemeZipBuffer(root, files);
        const names = AdmZipLike(zip);
        expect(names.sort()).toEqual(['assets/theme.css', 'layout/theme.liquid']);
    });
});
