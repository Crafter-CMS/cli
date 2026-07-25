import { Command } from '@oclif/core';
import { ApiService } from '../services/api.service';
import { AuthGuard } from '../utils/auth.guard';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';

export default class WhoAmI extends Command {
    static description = 'Giriş yapmış olan kullanıcı bilgisini göster';

    async run() {
        await AuthGuard.check();

        const spinner = ora('Kullanıcı bilgileri alınıyor...').start();

        try {
            const api = await ApiService.getInstance();
            const response = await api.get('/users/me');
            const user = response.data;

            spinner.stop();
            
            const table = new Table({
                head: [chalk.cyan('Alan'), chalk.cyan('Değer')],
                chars: {
                    'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
                    'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
                    'left': '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼',
                    'right': '║', 'right-mid': '╢', 'middle': '│'
                }
            });

            table.push(
                { 'Ad Soyad': `${user.name} ${user.surname}` },
                { 'Kullanıcı Adı': user.username },
                { 'E-Posta': user.email },
                { 'Kullanıcı ID': user.id }
            );

            this.log('\n' + chalk.green.bold('✓ Başarıyla giriş yapıldı!') + '\n');
            this.log(table.toString());
            this.log(); // Boş satır
        } catch (error: any) {
            spinner.fail(chalk.red('Kullanıcı bilgileri alınamadı.'));
            this.error(error.response?.data?.message || error.message);
        }
    }
}
