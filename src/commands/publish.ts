import { Command, Flags } from '@oclif/core';
import { ApiService } from '../services/api.service';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs-extra';
import { input } from '@inquirer/prompts';

export default class Publish extends Command {
    static description = "Geliştirme (dev) ortamındaki temanızı yayınlamak üzere onaya gönderir.";

    static flags = {
        version: Flags.string({ char: 'v', description: 'Yayınlanacak sürüm (Örn: 1.0.1)' }),
        message: Flags.string({ char: 'm', description: 'Sürüm notları / Değişiklikler' }),
    };

    async run() {
        const { flags } = await this.parse(Publish);
        const projectDir = process.cwd();
        const localConfigPath = path.join(projectDir, '.crafter');

        let themeId: string | undefined;

        if (fs.existsSync(localConfigPath)) {
            try {
                const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
                themeId = localConfig.themeId;
            } catch (e) { }
        }

        if (!themeId) {
            this.error(chalk.red('Theme ID bulunamadı. Lütfen önce "theme-kit init" komutunu çalıştırın.'));
        }

        let api: any;
        try {
            api = await ApiService.getInstance();
        } catch (error: any) {
            this.error(chalk.red("API'ye bağlanılamadı: " + error.message));
        }

        // Generate crafter-manifest.json to ensure security features work
        const manifestPath = path.join(projectDir, 'crafter-manifest.json');
        let manifestData: any = { marketplaceThemeId: themeId };
        try {
            const res = await api.get(`/marketplace/themes/${themeId}/manifest`);
            if (res.data) {
                manifestData = res.data;
            }
        } catch (e) { }
        await fs.writeJSON(manifestPath, manifestData, { spaces: 2 });


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
