import { Command, Flags } from '@oclif/core';
import { ApiService } from '../services/api.service';
import { resolveThemeId } from '../utils/theme';
import chalk from 'chalk';
import ora from 'ora';
import { syncManifestWithApi } from '../utils/manifest';
import { input } from '@inquirer/prompts';

export default class Publish extends Command {
    static description = "Geliştirme (dev) ortamındaki temanızı yayınlamak üzere onaya gönderir.";

    static flags = {
        theme: Flags.string({ char: 't', description: 'Theme ID (Opsiyonel, varsayılan olarak projedeki manifest kullanılır)' }),
        version: Flags.string({ char: 'v', description: 'Yayınlanacak sürüm (Örn: 1.0.1)' }),
        message: Flags.string({ char: 'm', description: 'Sürüm notları / Değişiklikler' }),
    };

    async run() {
        const { flags } = await this.parse(Publish);
        const projectDir = process.cwd();

        const themeId = await resolveThemeId(projectDir, flags.theme);

        if (!themeId) {
            this.error(chalk.red('Theme ID bulunamadı. Lütfen önce "npx @crafter-cms/cli init" komutunu çalıştırın veya -t <themeId> parametresini belirtin.'));
        }

        let api: any;
        try {
            api = await ApiService.getInstance();
        } catch (error: any) {
            this.error(chalk.red("API'ye bağlanılamadı: " + error.message));
        }

        // crafter-manifest.json yerel kalır: sunucu manifesti yalnızca eksik alanları doldurur, yazma onayla yapılır
        await syncManifestWithApi(projectDir, themeId as string, api, (m) => this.log(chalk.yellow(m)));

        let version = flags.version;
        if (!version) {
            version = await input({
                message: 'Yayınlanacak sürüm numarasını girin (Örn: 1.0.1):',
                validate: (value) => value.trim().length > 0 || 'Sürüm numarası zorunludur.',
            });
        }

        let releaseNotes = flags.message;
        if (!releaseNotes) {
            releaseNotes = await input({
                message: 'Sürüm notlarını girin (Opsiyonel):',
            });
        }

        const spinner = ora(`${version} sürümü yayınlanıyor...`).start();

        try {
            const payload = {
                version: version.trim(),
                releaseNotes: releaseNotes?.trim() || 'Güncelleme yayınlandı.',
            };

            const response = await api.post(`/marketplace/themes/${themeId}/publish`, payload);

            spinner.succeed(chalk.green(`Başarılı! ${version} sürümü onaya gönderildi.`));
            this.log(chalk.gray(response.data?.message || 'Yeni sürüm başarıyla oluşturuldu ve onay sürecine alındı.'));
        } catch (error: any) {
            spinner.fail(chalk.red('Yayınlama başarısız oldu.'));
            if (error.response?.data?.message) {
                this.error(chalk.red(error.response.data.message));
            } else {
                this.error(chalk.red(error.message));
            }
        }
    }
}
