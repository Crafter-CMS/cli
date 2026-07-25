import { Command } from '@oclif/core';
import { ConfigService } from '../../services/config.service';
import chalk from 'chalk';

export default class ConfigReset extends Command {
    static description = 'Tüm yapılandırmayı (API ve Storefront URL dahil) varsayılan ayarlara sıfırla';

    async run() {
        await ConfigService.resetConfig();
        this.log(chalk.green('✓ Tüm ayarlar başarıyla varsayılana sıfırlandı.'));
    }
}
