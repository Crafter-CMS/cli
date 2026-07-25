import { Command } from '@oclif/core';
import { AuthGuard } from '../utils/auth.guard';
import { ApiService } from '../services/api.service';
import * as path from 'path';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';

export default class Versions extends Command {
    static description = 'Temanın versiyonlarını listele';

    async run() {
        await AuthGuard.check();

        const projectDir = process.cwd();
        const configPath = path.join(projectDir, 'theme.config.js');

        if (!(await fs.pathExists(configPath))) {
            this.error(chalk.red('theme.config.js bulunamadı.'));
        }

        const themeConfig = require(configPath);
        const themeId = themeConfig.themeId;

        if (!themeId) {
            this.error(chalk.red('themeId bulunamadı.'));
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
