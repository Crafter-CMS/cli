import { ConfigService } from '../services/config.service';
import chalk from 'chalk';

export class AuthGuard {
    static async check(): Promise<void> {
        const config = await ConfigService.getConfig();
        if (!config.accessToken) {
            console.error(chalk.red('\nBu komutu kullanmak için giriş yapmalısınız.'));
            console.error(chalk.yellow('Lütfen "npx @crafter-cms/cli login" komutunu çalıştırın.'));
            process.exit(1);
        }
    }
}
