import FormData from 'form-data';
import { collectThemeFiles, SkippedFile } from './ignore';
import { createThemeZipBuffer } from './zip';

export interface SyncResult {
    /** ZIP'e eklenen dosya sayısı */
    fileCount: number;
    /** Ortak kurallar nedeniyle gönderilmeyen dosyalar */
    skipped: SkippedFile[];
    /** ZIP boyutu (byte) */
    zipBytes: number;
    /** Sunucu yanıtı */
    data: any;
}

/**
 * Tema klasörünü ortak yok sayma listesi ve sunucu izin listesiyle ZIP'leyip
 * tek istekte POST /marketplace/themes/:id/sync uç noktasına gönderir.
 */
export async function syncThemeFiles(
    api: any,
    themeId: string,
    projectDir: string,
    onProgress?: (message: string) => void,
): Promise<SyncResult> {
    const { files, skipped } = await collectThemeFiles(projectDir);
    if (files.length === 0) {
        throw new Error('Gönderilecek tema dosyası bulunamadı. / No theme files to upload.');
    }

    const zipBuffer = await createThemeZipBuffer(projectDir, files);
    onProgress?.(`Tema API'ye yükleniyor (${files.length} dosya, ${Math.round(zipBuffer.length / 1024)} KB)...`);

    const form = new FormData();
    form.append('file', zipBuffer, {
        filename: 'theme.zip',
        contentType: 'application/zip',
    });

    const response = await api.post(`/marketplace/themes/${themeId}/sync`, form, {
        headers: form.getHeaders(),
    });

    return { fileCount: files.length, skipped, zipBytes: zipBuffer.length, data: response.data };
}
