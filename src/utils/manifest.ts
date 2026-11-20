import * as path from 'path';
import * as fs from 'fs-extra';

export const MANIFEST_FILE = 'crafter-manifest.json';

export type Manifest = Record<string, any>;

export type ReadManifestResult =
    | { status: 'missing' }
    | { status: 'invalid'; error: string }
    | { status: 'ok'; manifest: Manifest };

export async function readLocalManifest(projectDir: string): Promise<ReadManifestResult> {
    const manifestPath = path.join(projectDir, MANIFEST_FILE);
    if (!(await fs.pathExists(manifestPath))) return { status: 'missing' };
    try {
        const manifest = await fs.readJson(manifestPath);
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
            return { status: 'invalid', error: 'JSON nesnesi değil / not a JSON object' };
        }
        return { status: 'ok', manifest };
    } catch (e: any) {
        return { status: 'invalid', error: e?.message || String(e) };
    }
}

function isMissing(value: unknown): boolean {
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/**
 * Yerel manifesti sunucu manifestiyle birleştirir: yalnızca yerelde eksik (yok, null veya boş)
 * üst seviye alanlar doldurulur. Yerel değerler (themeVersion dahil) hiçbir zaman değişmez.
 */
export function mergeManifest(local: Manifest, server: Manifest): { merged: Manifest; added: string[] } {
    const merged: Manifest = { ...local };
    const added: string[] = [];
    for (const [key, value] of Object.entries(server || {})) {
        if (isMissing(value)) continue;
        if (isMissing(merged[key])) {
            merged[key] = value;
            added.push(key);
        }
    }
    return { merged, added };
}

export interface ManifestSyncOptions {
    /** Kullanıcıya evet/hayır sorusu sorar */
    confirm: (message: string, defaultValue: boolean) => Promise<boolean>;
    /** Etkileşimli terminal mi (değilse dosyaya hiç yazılmaz) */
    interactive: boolean;
    log: (message: string) => void;
    /**
     * Yerel marketplaceThemeId farklıysa güncelleme sorusunun varsayılan cevabı.
     * init'te kullanıcı temayı az önce seçtiği için true, dev/publish'te false.
     */
    preferThemeId?: boolean;
}

export type ManifestSyncOutcome = 'unchanged' | 'created' | 'updated' | 'declined' | 'skipped-non-interactive' | 'invalid';

/**
 * crafter-manifest.json dosyasını sunucu manifestiyle güvenli şekilde eşitler.
 * - Yerel dosyanın üzerine asla sunucu manifesti yazılmaz.
 * - Sunucu manifesti yalnızca eksik alanları doldurmak için kullanılır.
 * - Dosyaya yalnızca kullanıcı onay verirse yazılır.
 */
export async function syncManifest(
    projectDir: string,
    themeId: string,
    fetchServerManifest: () => Promise<Manifest | null>,
    options: ManifestSyncOptions,
): Promise<ManifestSyncOutcome> {
    const manifestPath = path.join(projectDir, MANIFEST_FILE);
    const local = await readLocalManifest(projectDir);

    if (local.status === 'invalid') {
        options.log(`${MANIFEST_FILE} okunamadı (${local.error}); dosyaya dokunulmadı. / Could not read ${MANIFEST_FILE}; the file was left untouched.`);
        return 'invalid';
    }

    let server: Manifest = {};
    try {
        const data = await fetchServerManifest();
        if (data && typeof data === 'object' && !Array.isArray(data)) server = data;
    } catch {
        // Sunucu manifesti alınamazsa yalnızca tema kimliğiyle devam edilir
    }
    const serverWithId: Manifest = { marketplaceThemeId: themeId, ...server };

    if (local.status === 'missing') {
        if (!options.interactive) {
            options.log(`${MANIFEST_FILE} bulunamadı; etkileşimli olmayan modda oluşturulmadı. / ${MANIFEST_FILE} not found; not created in non-interactive mode.`);
            return 'skipped-non-interactive';
        }
        const ok = await options.confirm(
            `${MANIFEST_FILE} bulunamadı. Sunucudaki bilgilerle oluşturulsun mu? / ${MANIFEST_FILE} not found. Create it from the server data?`,
            true,
        );
        if (!ok) return 'declined';
        await fs.writeJson(manifestPath, serverWithId, { spaces: 2 });
        return 'created';
    }

    const { merged, added } = mergeManifest(local.manifest, serverWithId);

    // Yerel manifest başka bir temaya işaret ediyorsa yalnızca kullanıcı onaylarsa kimlik güncellenir
    const localId = local.manifest.marketplaceThemeId;
    const idMismatch = typeof localId === 'string' && localId.trim() !== '' && localId.trim() !== themeId;
    let idChanged = false;
    if (idMismatch) {
        options.log(`${MANIFEST_FILE} başka bir temaya işaret ediyor (marketplaceThemeId: ${localId}, kullanılan: ${themeId}). / ${MANIFEST_FILE} points to another theme.`);
        if (options.interactive) {
            idChanged = await options.confirm(
                `${MANIFEST_FILE} içindeki marketplaceThemeId ${themeId} olarak güncellensin mi? Diğer alanlar değişmez. / Update marketplaceThemeId to ${themeId}? Other fields are kept.`,
                options.preferThemeId ?? false,
            );
            if (idChanged) merged.marketplaceThemeId = themeId;
        }
        // Kimlik değişmediyse başka bir temanın sunucu bilgileri bu manifeste eklenmez
        if (!idChanged) return 'unchanged';
    }

    if (added.length === 0) {
        if (!idChanged) return 'unchanged';
        await fs.writeJson(manifestPath, merged, { spaces: 2 });
        return 'updated';
    }

    if (!options.interactive) {
        options.log(`${MANIFEST_FILE} dosyasında eksik alanlar var (${added.join(', ')}); etkileşimli olmayan modda dosyaya yazılmadı. / Missing fields in ${MANIFEST_FILE} (${added.join(', ')}); not written in non-interactive mode.`);
        return 'skipped-non-interactive';
    }

    const ok = await options.confirm(
        `${MANIFEST_FILE} dosyasındaki eksik alanlar sunucudan doldurulsun mu? (${added.join(', ')}) Mevcut alanlar değişmez. / Fill missing fields from the server? Existing fields are kept.`,
        true,
    );
    if (!ok) {
        if (!idChanged) return 'declined';
        await fs.writeJson(manifestPath, { ...local.manifest, marketplaceThemeId: themeId }, { spaces: 2 });
        return 'updated';
    }
    await fs.writeJson(manifestPath, merged, { spaces: 2 });
    return 'updated';
}

/** Komutlar için: API üzerinden sunucu manifestini çekip yerel manifesti onaylı şekilde eşitler */
export async function syncManifestWithApi(
    projectDir: string,
    themeId: string,
    api: any,
    log: (message: string) => void,
    preferThemeId = false,
): Promise<ManifestSyncOutcome> {
    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    return syncManifest(
        projectDir,
        themeId,
        async () => {
            const res = await api.get(`/marketplace/themes/${themeId}/manifest`);
            return res?.data ?? null;
        },
        {
            interactive,
            log,
            preferThemeId,
            confirm: async (message, defaultValue) => {
                const { confirm } = await import('@inquirer/prompts');
                return confirm({ message, default: defaultValue });
            },
        },
    );
}
