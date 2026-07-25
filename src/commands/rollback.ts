import { Command, Flags } from '@oclif/core';
import { confirm } from '@inquirer/prompts';
import { AuthGuard } from '../utils/auth.guard';
import { ApiService } from '../services/api.service';
import * as path from 'path';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';

export default class Rollback extends Command {
    static description = 'Temayı belirli bir versiyona geri döndür';

    static flags = {
        version: Flags.string({ char: 'v', description: 'Geri dönülecek versiyon', required: true }),
    };

    async run() {
        await AuthGuard.check();
        const { flags } = await this.parse(Rollback);

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
