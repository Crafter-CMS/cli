import { Command } from '@oclif/core';
import { ConfigService } from '../../services/config.service';
import chalk from 'chalk';
import Table from 'cli-table3';

export default class ConfigList extends Command {
    static description = 'Mevcut yapılandırmayı listele';

    async run() {
        const config = await ConfigService.getConfig();

        const table = new Table({
            head: [chalk.blue('Ayar'), chalk.blue('Değer')],
        });

        table.push(
            ['apiUrl', config.apiUrl || 'https://api.crafter.net.tr'],
            ['storefrontUrl', config.storefrontUrl || 'https://origin.crafter.web.tr'],
            ['userId', config.userId || 'Giriş yapılmadı'],
            ['accessToken', config.accessToken ? `${config.accessToken.substring(0, 10)}...` : 'Yok'],
            ['refreshToken', config.refreshToken ? '********' : 'Yok']
        );

        this.log(table.toString());
    }
}
