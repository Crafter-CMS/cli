import { Command, Args } from '@oclif/core';
import { ConfigService } from '../../services/config.service';
import chalk from 'chalk';

export default class ConfigSet extends Command {
    static description = 'Yapılandırma ayarını güncelle';

    static args = {
        key: Args.string({ description: 'Ayar anahtarı (örn: apiUrl, storefrontUrl)', required: true }),
        value: Args.string({ description: 'Ayar değeri', required: true }),
    };

    async run() {
        const { args } = await this.parse(ConfigSet);

        if (args.key === 'api-url' || args.key === 'apiUrl') {
            await ConfigService.setConfig({ apiUrl: args.value });
            this.log(chalk.green(`apiUrl başarıyla güncellendi: ${args.value}`));
        } else if (args.key === 'storefront-url' || args.key === 'storefrontUrl') {
            await ConfigService.setConfig({ storefrontUrl: args.value });
            this.log(chalk.green(`storefrontUrl başarıyla güncellendi: ${args.value}`));
        } else {
            this.error(chalk.red(`Bilinmeyen ayar anahtarı: ${args.key}. Geçerli anahtarlar: apiUrl, storefrontUrl`));
        }
    }
}
