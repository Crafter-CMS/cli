import { Command, Flags } from '@oclif/core';
import { ApiService } from '../services/api.service';
import { resolveThemeId } from '../utils/theme';
import { createZipArchive } from '../utils/zip';
import chalk from 'chalk';
import ora from 'ora';
import FormData from 'form-data';

export default class Push extends Command {
    static description = "Yerel klasördeki tüm dosyaları tek seferde Crafter API'sine yükler (Sıfırdan senkronizasyon).";

    static flags = {
        theme: Flags.string({ char: 't', description: 'Theme ID (Eğer crafter-manifest.json dosyasında yoksa zorunludur)' }),
    };

    async run() {
        const { flags } = await this.parse(Push);
        const projectDir = process.cwd();

        const themeId = await resolveThemeId(projectDir, flags.theme);

        if (!themeId) {
            this.error(chalk.red('Theme ID bulunamadı. "npx @crafter-cms/cli push -t <themeId>" komutunu kullanın veya "npx @crafter-cms/cli init" yapın.'));
        }

        const spinner = ora('Tema dosyaları paketleniyor (ZIP)...').start();

        try {
            const api = await ApiService.getInstance();

            // 1. Temayı bellekte (Buffer olarak) ZIP'le
            const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
                const bufs: Buffer[] = [];
                const archive = createZipArchive({ zlib: { level: 6 } });

                archive.on('data', (chunk: Buffer) => bufs.push(chunk));
                archive.on('end', () => resolve(Buffer.concat(bufs)));
                archive.on('error', (err: any) => reject(err));

                // Hariç tutulacak dosyalar (gereksiz yüklemeleri önler)
                archive.glob('**/*', {
                    cwd: projectDir,
                    ignore: [
                        'node_modules/**',
                        '.git/**',
                        '.crafter',
                        '*.zip',
                        'dist/**',
                        '.DS_Store',
                        'desktop.ini'
                    ],
                    dot: true // .liquidrc, .env gibi dotfile'ları dahil eder (.git ve .crafter hariç)
                });

                archive.finalize();
            });

            spinner.text = `Tema API'ye yükleniyor (${Math.round(zipBuffer.length / 1024)} KB)...`;

            // 2. Multipart FormData oluştur
            const form = new FormData();
            form.append('file', zipBuffer, {
                filename: 'theme.zip',
                contentType: 'application/zip',
            });

            // 3. Tek seferde backend'e gönder
            const response = await api.post(`/marketplace/themes/${themeId}/sync`, form, {
                headers: form.getHeaders(),
            });

            const fileCount = response.data?.fileCount || response.data?.count;
            const countMsg = fileCount ? ` (${fileCount} dosya)` : '';
            spinner.succeed(chalk.green(`Başarılı! Tema API'ye başarıyla senkronize edildi${countMsg}.`));
        } catch (error: any) {
            spinner.fail(chalk.red('Yükleme işlemi başarısız oldu.'));
            this.error(error.response?.data?.message || error.message);
        }
    }
}
