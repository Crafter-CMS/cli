import { afterEach, describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs-extra';
import { mergeManifest, syncManifest, MANIFEST_FILE } from '../src/utils/manifest';
import { makeTempDir } from './helpers';

const THEME_ID = '11111111-2222-3333-4444-555555555555';
const SERVER_MANIFEST = {
    marketplaceThemeId: THEME_ID,
    name: 'Sunucu Adı',
    description: 'Sunucu açıklaması',
    version: '1.0.0',
    author: { id: 'u1', name: 'Dev' },
};

const dirs: string[] = [];
afterEach(async () => {
    while (dirs.length) await fs.remove(dirs.pop() as string);
});

async function project(manifest?: unknown, raw?: string) {
    const root = await makeTempDir();
    dirs.push(root);
    if (raw !== undefined) await fs.writeFile(path.join(root, MANIFEST_FILE), raw);
    else if (manifest !== undefined) await fs.writeJson(path.join(root, MANIFEST_FILE), manifest, { spaces: 2 });
    return root;
}

const readManifest = (root: string) => fs.readJson(path.join(root, MANIFEST_FILE));
const rawManifest = (root: string) => fs.readFile(path.join(root, MANIFEST_FILE), 'utf8');

function opts(answer: boolean | ((m: string) => boolean), interactive = true) {
    const confirm = vi.fn(async (message: string) => (typeof answer === 'function' ? answer(message) : answer));
    const log = vi.fn();
    return { confirm, log, interactive };
}

describe('mergeManifest', () => {
    it('yalnızca eksik alanları doldurur, themeVersion ve mevcut alanları korur', () => {
        const local = { marketplaceThemeId: THEME_ID, themeVersion: 2, name: 'Yerel Ad', version: '2.3.0', description: '' };
        const { merged, added } = mergeManifest(local, SERVER_MANIFEST);
        expect(merged.themeVersion).toBe(2);
        expect(merged.name).toBe('Yerel Ad');
        expect(merged.version).toBe('2.3.0');
        expect(merged.description).toBe('Sunucu açıklaması');
        expect(merged.author).toEqual(SERVER_MANIFEST.author);
        expect(added.sort()).toEqual(['author', 'description']);
    });
});

describe('syncManifest: yerel manifest asla üzerine yazılmaz', () => {
    it('eksik alan yoksa dosyaya dokunmaz ve soru sormaz', async () => {
        const local = { ...SERVER_MANIFEST, themeVersion: 2, name: 'v2 Tema' };
        const root = await project(local);
        const before = await rawManifest(root);
        const o = opts(true);
        const outcome = await syncManifest(root, THEME_ID, async () => SERVER_MANIFEST, o);
        expect(outcome).toBe('unchanged');
        expect(o.confirm).not.toHaveBeenCalled();
        expect(await rawManifest(root)).toBe(before);
    });

    it('kullanıcı reddederse dosya değişmez (themeVersion kaybolmaz)', async () => {
        const root = await project({ marketplaceThemeId: THEME_ID, themeVersion: 2 });
        const before = await rawManifest(root);
        const o = opts(false);
        const outcome = await syncManifest(root, THEME_ID, async () => SERVER_MANIFEST, o);
        expect(outcome).toBe('declined');
        expect(o.confirm).toHaveBeenCalledTimes(1);
        expect(await rawManifest(root)).toBe(before);
    });

    it('kullanıcı onaylarsa yalnızca eksik alanlar eklenir, themeVersion kalır', async () => {
        const root = await project({ marketplaceThemeId: THEME_ID, themeVersion: 2, version: '2.0.0' });
        const outcome = await syncManifest(root, THEME_ID, async () => SERVER_MANIFEST, opts(true));
        expect(outcome).toBe('updated');
        const m = await readManifest(root);
        expect(m.themeVersion).toBe(2);
        expect(m.version).toBe('2.0.0');
        expect(m.name).toBe('Sunucu Adı');
    });

    it('etkileşimli olmayan modda hiçbir şey yazmaz', async () => {
        const root = await project({ marketplaceThemeId: THEME_ID, themeVersion: 2 });
        const before = await rawManifest(root);
        const o = opts(true, false);
        const outcome = await syncManifest(root, THEME_ID, async () => SERVER_MANIFEST, o);
        expect(outcome).toBe('skipped-non-interactive');
        expect(o.confirm).not.toHaveBeenCalled();
        expect(await rawManifest(root)).toBe(before);
    });

    it('bozuk JSON dosyasına dokunmaz', async () => {
        const root = await project(undefined, '{ "themeVersion": 2, ');
        const o = opts(true);
        const outcome = await syncManifest(root, THEME_ID, async () => SERVER_MANIFEST, o);
        expect(outcome).toBe('invalid');
        expect(await rawManifest(root)).toBe('{ "themeVersion": 2, ');
    });

    it('sunucu hata verirse dosyaya dokunmaz', async () => {
        const root = await project({ marketplaceThemeId: THEME_ID, themeVersion: 2, name: 'x', description: 'y', version: '1', author: {} });
        const before = await rawManifest(root);
        const outcome = await syncManifest(root, THEME_ID, async () => { throw new Error('500'); }, opts(true));
        expect(outcome).toBe('unchanged');
        expect(await rawManifest(root)).toBe(before);
    });

    it('dosya yoksa yalnızca onayla oluşturur', async () => {
        const declinedRoot = await project();
        expect(await syncManifest(declinedRoot, THEME_ID, async () => SERVER_MANIFEST, opts(false))).toBe('declined');
        expect(await fs.pathExists(path.join(declinedRoot, MANIFEST_FILE))).toBe(false);

        const root = await project();
        expect(await syncManifest(root, THEME_ID, async () => SERVER_MANIFEST, opts(true))).toBe('created');
        expect((await readManifest(root)).marketplaceThemeId).toBe(THEME_ID);
    });

    it('başka temaya ait manifestte kimliği onaysız değiştirmez ve o temanın bilgilerini eklemez', async () => {
        const other = { marketplaceThemeId: 'other-theme', themeVersion: 2 };
        const root = await project(other);
        const before = await rawManifest(root);
        const o = opts(false);
        expect(await syncManifest(root, THEME_ID, async () => SERVER_MANIFEST, o)).toBe('unchanged');
        expect(await rawManifest(root)).toBe(before);

        const o2 = opts((m) => m.includes('marketplaceThemeId'));
        expect(await syncManifest(root, THEME_ID, async () => SERVER_MANIFEST, o2)).toBe('updated');
        const m = await readManifest(root);
        expect(m.marketplaceThemeId).toBe(THEME_ID);
        expect(m.themeVersion).toBe(2);
        expect(m.name).toBeUndefined();
    });
});
