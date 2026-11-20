import { Command, Flags } from '@oclif/core';
import { ApiService } from '../services/api.service';
import { resolveThemeId } from '../utils/theme';
import { syncThemeFiles } from '../utils/sync';
import { formatSkippedFiles } from '../utils/ignore';
import chalk from 'chalk';
import ora from 'ora';

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

            // Ortak yok sayma listesi ve sunucu izin listesiyle ZIP'le, tek istekte gönder
            const result = await syncThemeFiles(api, themeId as string, projectDir, (m) => { spinner.text = m; });

            const fileCount = result.data?.uploadedFiles ?? result.data?.fileCount ?? result.data?.count ?? result.fileCount;
            const countMsg = fileCount ? ` (${fileCount} dosya)` : '';
            spinner.succeed(chalk.green(`Başarılı! Tema API'ye başarıyla senkronize edildi${countMsg}.`));
            if (result.skipped.length > 0) {
                this.log(chalk.yellow(`${result.skipped.length} dosya gönderilmedi / ${result.skipped.length} file(s) not uploaded:`));
                formatSkippedFiles(result.skipped).forEach((l) => this.log(chalk.yellow(l)));
            }
        } catch (error: any) {
            spinner.fail(chalk.red('Yükleme işlemi başarısız oldu.'));
            this.error(error.response?.data?.message || error.message);
        }
    }
}
