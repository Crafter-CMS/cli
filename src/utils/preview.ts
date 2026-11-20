import axios from 'axios';

/**
 * #319 güvenlik yamasından sonra storefront, onaydan geçmemiş dev/ dosyalarını
 * (x-crafter-theme-version: dev) imzalı önizleme token'ı olmadan 403 ile reddeder.
 * Token uç noktası CLI 2.0 ile gelecek; bu sürümde canlı önizleme devre dışı kalır,
 * dosya izleme ve senkronizasyon çalışmaya devam eder.
 */

export const DEV_THEME_VERSION_HEADER = 'x-crafter-theme-version';

export const PREVIEW_UNAVAILABLE_LINES = [
    'Canlı önizleme bir güvenlik güncellemesi nedeniyle geçici olarak kullanılamıyor.',
    'Dosyalarınız senkronize edilmeye devam ediyor. Önizleme bir sonraki CLI güncellemesiyle geri gelecek.',
    'Live preview is temporarily unavailable after a security update.',
    'Your files are still being synced. A CLI update will bring preview back.',
];

export function publishedPreviewUrl(storefrontUrl: string, themeId: string): string {
    const url = new URL('/', storefrontUrl);
    url.searchParams.set('themeId', themeId);
    return url.toString();
}

export function publishedPreviewLines(url: string): string[] {
    return [
        `Temanız yayında. Yayındaki sürümü önizleyebilirsiniz (yerel değişiklikleriniz görünmez): ${url}`,
        `Your theme is published. You can preview the published version (local changes are not shown): ${url}`,
    ];
}

/** Storefront yanıtı, dev kaynağının token olmadan reddedildiğini mi gösteriyor */
export function isDevPreviewForbidden(status: number | undefined): boolean {
    return status === 403;
}

export type PreviewProbeResult = 'available' | 'forbidden' | 'unknown';

/** Storefront'a dev kaynağıyla bir önizleme isteği atar; yanıtı sınıflandırır, hata fırlatmaz */
export async function probeDevPreview(storefrontUrl: string, themeId: string): Promise<PreviewProbeResult> {
    try {
        const res = await axios.get(publishedPreviewUrl(storefrontUrl, themeId), {
            headers: { [DEV_THEME_VERSION_HEADER]: 'dev', 'x-crafter-theme-id': themeId },
            timeout: 10000,
            maxRedirects: 0,
            validateStatus: () => true,
            responseType: 'text',
        });
        if (isDevPreviewForbidden(res.status)) return 'forbidden';
        if (res.status >= 200 && res.status < 400) return 'available';
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

/** Tema sunucuda yayında mı (sahibi için GET /marketplace/themes/:id tam kaydı döner) */
export async function isThemePublished(api: any, themeId: string): Promise<boolean> {
    try {
        const res = await api.get(`/marketplace/themes/${themeId}`);
        const theme = res?.data?.data ?? res?.data;
        return theme?.status === 'published';
    } catch {
        return false;
    }
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Yerel proxy 403 aldığında tarayıcıya gösterilecek sayfa */
export function previewUnavailableHtml(publishedUrl?: string): string {
    const lines = [...PREVIEW_UNAVAILABLE_LINES, ...(publishedUrl ? publishedPreviewLines(publishedUrl) : [])];
    const body = lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('\n');
    const link = publishedUrl ? `<p><a href="${escapeHtml(publishedUrl)}">${escapeHtml(publishedUrl)}</a></p>` : '';
    return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Crafter</title></head>` +
        `<body style="font-family:sans-serif;max-width:640px;margin:48px auto;padding:0 16px;line-height:1.5">` +
        `<h1>Crafter</h1>${body}${link}</body></html>`;
}
