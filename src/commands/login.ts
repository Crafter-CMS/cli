import { Command } from '@oclif/core';
import { ApiService } from '../services/api.service';
import { ConfigService } from '../services/config.service';
import chalk from 'chalk';
import ora from 'ora';
import * as http from 'http';
import open from 'open';
import { URL } from 'url';

export default class Login extends Command {
    static description = 'Tarayıcı üzerinden giriş yap';

    async run() {
        const spinner = ora('Giriş bekleniyor...').start();

        // 1. Create a local server to listen for callback
        const server = http.createServer();

        return new Promise<void>((resolve, reject) => {
            server.listen(0, '127.0.0.1', async () => {
                const address = server.address() as any;
                const port = address.port;

                try {
                    const api = await ApiService.getInstance();

                    // 2. Get login URL from backend
                    const response = await api.get(`/auth/cli?port=${port}`);
                    
                    const apiUrl = await ConfigService.getApiUrl();
                    let fallbackUrl = `https://crafter.net.tr/auth/cli?port=${port}`;
                    if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
                        fallbackUrl = `http://localhost:3000/auth/cli?port=${port}`;
                    }
                    
                    const loginUrl = response.data?.authUrl || fallbackUrl;

                    spinner.info(`Lütfen tarayıcı üzerinden giriş yapın.`);

                    // 3. Open browser
                    await open(loginUrl);
                    spinner.start('Tarayıcıdan yanıt bekleniyor...');
                } catch (error: any) {
                    server.close();
                    spinner.fail(chalk.red('Giriş işlemi başlatılamadı.'));
                    reject(error);
                }
            });

            server.on('request', async (req, res) => {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', '*');

                if (req.method === 'OPTIONS') {
                    res.writeHead(204);
                    res.end();
                    return;
                }

                const url = new URL(req.url || '', `http://${req.headers.host}`);

                if (url.pathname === '/callback') {
                    const accessToken = url.searchParams.get('accessToken');
                    const refreshToken = url.searchParams.get('refreshToken');
                    let userId = url.searchParams.get('userId');

                    if (accessToken && refreshToken) {
                        // Önce tokenları kaydedelim ki ApiService interceptor üzerinden kullanabilsin
                        await ConfigService.setConfig({
                            accessToken,
                            refreshToken,
                            userId: userId || undefined
                        });

                        try {
                            const api = await ApiService.getInstance();
                            const userResponse = await api.get('/users/me');
                            const user = userResponse.data;
                            
                            // Kullanıcı ID'sini güncelleyelim
                            await ConfigService.setConfig({
                                accessToken,
                                refreshToken,
                                userId: user.id
                            });

                            spinner.succeed(chalk.green(`Başarıyla giriş yapıldı! Hoş geldiniz, ${user.name} ${user.surname}`));
                        } catch (e) {
                            spinner.succeed(chalk.green('Başarıyla giriş yapıldı!'));
                        }

                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end('<h1>Giriş Başarılı!</h1><p>Şimdi CLI ekranına dönebilirsiniz.</p><script>setTimeout(() => window.close(), 3000)</script>');

                        server.close();
                        resolve();
                    } else {
                        res.writeHead(400);
                        res.end('Giriş başarısız: Tokenlar alınamadı.');
                        spinner.fail(chalk.red('Giriş başarısız: Tokenlar alınamadı.'));
                        server.close();
                        reject(new Error('Tokens not found in callback'));
                    }
                }
            });

            server.on('error', (err) => {
                spinner.fail(chalk.red('Sunucu hatası!'));
                reject(err);
            });
        });
    }
}
