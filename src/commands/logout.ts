import { Command } from '@oclif/core';
import { ConfigService } from '../services/config.service';
import chalk from 'chalk';

export default class Logout extends Command {
    static description = 'Oturumu kapat';

    async run() {
        await ConfigService.clearConfig();
        this.log(chalk.green('Başarıyla çıkış yapıldı.'));
    }
}
