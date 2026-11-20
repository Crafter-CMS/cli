import { describe, expect, it } from 'vitest';
import { isDevPreviewForbidden, previewUnavailableHtml, publishedPreviewUrl, PREVIEW_UNAVAILABLE_LINES } from '../src/utils/preview';

describe('preview yardımcıları', () => {
    it('403 dev önizleme reddi olarak algılanır', () => {
        expect(isDevPreviewForbidden(403)).toBe(true);
        expect(isDevPreviewForbidden(200)).toBe(false);
        expect(isDevPreviewForbidden(undefined)).toBe(false);
    });

    it('yayındaki önizleme bağlantısını üretir', () => {
        expect(publishedPreviewUrl('https://origin.crafter.web.tr', 'abc')).toBe('https://origin.crafter.web.tr/?themeId=abc');
    });

    it('mesaj TR ve EN içerir, CrafterCMS yazmaz', () => {
        const html = previewUnavailableHtml('https://origin.crafter.web.tr/?themeId=abc');
        expect(PREVIEW_UNAVAILABLE_LINES.join(' ')).toMatch(/güvenlik/);
        expect(PREVIEW_UNAVAILABLE_LINES.join(' ')).toMatch(/security update/);
        expect(html).toContain('themeId=abc');
        expect(html).not.toMatch(/CrafterCMS/);
    });
});
