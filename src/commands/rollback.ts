import { Command, Flags } from '@oclif/core';
import { confirm } from '@inquirer/prompts';
import { AuthGuard } from '../utils/auth.guard';
import { resolveThemeId } from '../utils/theme';
import * as path from 'path';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';

export default class Rollback extends Command {
    static description = 'Temayı belirli bir versiyona geri döndür';

    static flags = {
        theme: Flags.string({ char: 't', description: 'Theme ID (Opsiyonel)' }),
        version: Flags.string({ char: 'v', description: 'Geri dönülecek versiyon', required: true }),
    };

    async run() {
        await AuthGuard.check();
        const { flags } = await this.parse(Rollback);

        const projectDir = process.cwd();
        const themeId = await resolveThemeId(projectDir, flags.theme);

        if (!themeId) {
            this.error(chalk.red('Theme ID bulunamadı. Lütfen "npx @crafter-cms/cli init" komutunu çalıştırın veya -t parametresi ile belirtin.'));
        }

        const confirmed = await confirm({
            message: `${flags.version} versiyonuna geri dönülecek. Onaylıyor musunuz?`,
            default: false,
        });

        if (!confirmed) {
            this.log('İşlem iptal edildi.');
            return;
        }

        const spinner = ora(`${flags.version} versiyonuna geri dönülüyor...`).start();

        try {
            this.log(chalk.yellow('\n[BILGI] Temayı eski versiyona döndürme (rollback) özelliği şu anda geliştirme aşamasındadır. Yeni Marketplace mimarisinde versiyon yönetimi yakında aktif edilecektir.\n'));
            spinner.stop();
        } catch (error: any) {
            spinner.fail(chalk.red('Rollback başarısız!'));
            this.error(error.message);
        }
    }
}
