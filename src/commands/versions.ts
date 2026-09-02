import { Command, Flags } from '@oclif/core';
import { AuthGuard } from '../utils/auth.guard';
import { resolveThemeId } from '../utils/theme';
import * as path from 'path';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';

export default class Versions extends Command {
    static description = 'Temanın versiyonlarını listele';

    static flags = {
        theme: Flags.string({ char: 't', description: 'Theme ID (Opsiyonel)' }),
    };

    async run() {
        await AuthGuard.check();
        const { flags } = await this.parse(Versions);

        const projectDir = process.cwd();
        const themeId = await resolveThemeId(projectDir, flags.theme);

        if (!themeId) {
            this.error(chalk.red('Theme ID bulunamadı. Lütfen "npx @crafter-cms/cli init" komutunu çalıştırın veya -t parametresi ile belirtin.'));
        }

        const spinner = ora('Versiyonlar listeleniyor...').start();

        try {
            this.log(chalk.yellow('\n[BILGI] Tema versiyonlama (versions) özelliği şu anda geliştirme aşamasındadır. Yeni Marketplace mimarisinde versiyon geçmişleri yakında aktif edilecektir.\n'));
            spinner.stop();
        } catch (error: any) {
            spinner.fail(chalk.red('Versiyonlar alınamadı.'));
            this.error(error.message);
        }
    }
}
