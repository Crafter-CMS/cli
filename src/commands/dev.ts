import { Command, Flags } from '@oclif/core';
import { ApiService } from '../services/api.service';
import { ConfigService } from '../services/config.service';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs-extra';
import chokidar from 'chokidar';
import httpProxy from 'http-proxy';
import * as http from 'http';
import { WebSocketServer } from 'ws';

export default class Dev extends Command {
    static description = "Akıllı senkronizasyon ve Development Theme izleme aracı.";

    static flags = {
        website: Flags.string({ char: 'w', description: 'Test edilecek Website ID (Belirtilmezse Demo Website kullanılır)' }),
        theme: Flags.string({ char: 't', description: 'Theme ID (Belirtilmezse init edilen tema kullanılır)' }),
    };

    async run() {
        const { flags } = await this.parse(Dev);
        const projectDir = process.cwd();
        const localConfigPath = path.join(projectDir, '.crafter');

        const DEMO_WEBSITE_ID = '5bfb758c-0bad-434b-94cd-f5cfd492d2a8';
        let websiteId = flags.website || DEMO_WEBSITE_ID;
        let themeId = flags.theme;

        if (fs.existsSync(localConfigPath)) {
            try {
                const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
                themeId = themeId || localConfig.themeId;
                if (!flags.website && localConfig.websiteId) {
                    websiteId = localConfig.websiteId;
                }
            } catch (e) { }
        }

        if (!themeId) {
            this.error(chalk.red('Theme ID bulunamadı. Lütfen önce "theme-kit init" komutunu çalıştırın.'));
        }

        let api: any;
        try {
            api = await ApiService.getInstance();
        } catch (error: any) {
            this.error(chalk.red("API'ye bağlanılamadı: " + error.message));
        }

        // Hem yeni hem mevcut tema için başlangıçta tüm dosyaları senkronize et
        const pushSpinner = ora('Tüm dosyalar senkronize ediliyor (assets dahil)...').start();
        try {
            await this.pushAllFiles(api, themeId as string, projectDir);
            pushSpinner.succeed(chalk.green('Tüm dosyalar başarıyla yüklendi!'));
        } catch (error: any) {
            pushSpinner.fail(chalk.red('Dosya senkronizasyonu başarısız: ' + (error.response?.data?.message || error.message)));
        }

        // ==========================================
        // LOCAL PROXY SERVER (Auto-Reload & Injection)
        // ==========================================
        const proxyPort = 9292;
        const targetStorefront = await ConfigService.getStorefrontUrl();

        const proxy = httpProxy.createProxyServer({
            target: targetStorefront,
            changeOrigin: true,
            selfHandleResponse: true
        });

        const wss = new WebSocketServer({ noServer: true });

        proxy.on('proxyReq', (proxyReq) => {
            // Remove gzip encoding so we can read raw HTML to inject script
            proxyReq.removeHeader('accept-encoding');
        });

        proxy.on('proxyRes', (proxyRes, req, res) => {
            let body = Buffer.alloc(0);
            proxyRes.on('data', (chunk) => {
                body = Buffer.concat([body, chunk]);
            });

            proxyRes.on('end', () => {
                const contentType = proxyRes.headers['content-type'];

                if (contentType && contentType.includes('text/html')) {
                    let responseStr = body.toString('utf8');
                    const script = `
<script>
    const ws = new WebSocket('ws://' + window.location.host);
    ws.onmessage = (event) => {
        if (event.data === 'reload') {
            console.log('Dosya değişti, sayfa yenileniyor...');
            window.location.reload();
        }
    };
</script>
`;
                    if (responseStr.includes('</body>')) {
                        responseStr = responseStr.replace('</body>', script + '</body>');
                    } else {
                        responseStr += script;
                    }

                    Object.keys(proxyRes.headers).forEach(key => {
                        if (key.toLowerCase() !== 'content-length') {
                            res.setHeader(key, proxyRes.headers[key] as string);
                        }
                    });

                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.statusCode = proxyRes.statusCode || 200;
                    res.end(responseStr);
                } else {
                    Object.keys(proxyRes.headers).forEach(key => {
                        res.setHeader(key, proxyRes.headers[key] as string | string[]);
                    });
                    res.statusCode = proxyRes.statusCode || 200;
                    res.end(body);
                }
            });
        });

        const server = http.createServer((req, res) => {
            try {
                const hostStr = req.headers.host || "localhost";
                const urlObj = new URL(req.url || '/', "http://" + hostStr);
                urlObj.searchParams.set('preview_theme_id', themeId as string);
                urlObj.searchParams.set('preview_website_id', websiteId as string); // For Storefront to know which website data to load
                
                // Ayrıca header olarak da ekleyelim (Storefront nasıl okuyorsa)
                req.headers['x-crafter-website-id'] = websiteId as string;
                req.headers['x-crafter-theme-id'] = themeId as string;

                req.url = urlObj.pathname + urlObj.search;

                proxy.web(req, res);
            } catch (e) {
                res.writeHead(500);
                res.end("Proxy error");
            }
        });

        server.on('upgrade', (request, socket, head) => {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        });

        server.listen(proxyPort, () => {
            this.log(chalk.cyan("\n🌍 Canlı Önizleme: " + chalk.underline("http://localhost:" + proxyPort) + "\n"));
        });

        // ==========================================
        // CHOKIDAR WATCHER
        // ==========================================
        const watchSpinner = ora('Dosya değişiklikleri izleniyor (Watch Mode)...').start();

        const watcher = chokidar.watch(projectDir, {
            ignored: [
                /(^|[\/\\])\../,
                /node_modules/,
                /dist/,
                /\.zip$/
            ],
            persistent: true,
            ignoreInitial: true,
        });

        const uploadFile = async (filePath: string) => {
            const relativePath = path.relative(projectDir, filePath).replace(/\\/g, '/');
            const fileSpinner = ora("Yükleniyor: " + relativePath).start();

            try {
                const ext = path.extname(filePath).toLowerCase();
                const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.otf'];
                const isBinary = binaryExtensions.includes(ext);

                const content = await fs.readFile(filePath, isBinary ? 'base64' : 'utf8');

                const payload: any = {
                    key: relativePath,
                    content: content
                };
                if (isBinary) {
                    payload.encoding = 'base64';
                }

                await api.put(`/marketplace/themes/${themeId}/file`, payload);

                fileSpinner.succeed(chalk.green("Yüklendi: " + relativePath));

                // Broadcast reload
                wss.clients.forEach(client => {
                    if (client.readyState === 1) {
                        client.send('reload');
                    }
                });

            } catch (error: any) {
                fileSpinner.fail(chalk.red("Hata: " + relativePath));
                console.error(error.response?.data?.message || error.message);
            }
        };

        const deleteFile = async (filePath: string) => {
            const relativePath = path.relative(projectDir, filePath).replace(/\\/g, '/');
            const fileSpinner = ora("Siliniyor: " + relativePath).start();
            try {
                await api.delete(`/marketplace/themes/${themeId}/file`, { data: { key: relativePath } });
                fileSpinner.succeed(chalk.yellow("Silindi: " + relativePath));
                
                // Broadcast reload
                wss.clients.forEach(client => {
                    if (client.readyState === 1) {
                        client.send('reload');
                    }
                });
            } catch (error: any) {
                fileSpinner.fail(chalk.red("Hata (Silme): " + relativePath));
                console.error(error.response?.data?.message || error.message);
            }
        };

        watcher
            .on('add', filePath => uploadFile(filePath))
            .on('change', filePath => uploadFile(filePath))
            .on('unlink', filePath => deleteFile(filePath));

        return new Promise(() => { });
    }

    private async pushAllFiles(api: any, themeId: string, projectDir: string) {
        const filesToUpload: string[] = [];

        const scanDir = async (dir: string) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.relative(projectDir, fullPath).replace(/\\/g, '/');

                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.crafter' || entry.name === 'dist' || entry.name.endsWith('.zip')) {
                    continue;
                }

                if (entry.isDirectory()) {
                    await scanDir(fullPath);
                } else {
                    filesToUpload.push(relativePath);
                }
            }
        };

        await scanDir(projectDir);

        let remoteFiles: string[] = [];
        try {
            const res = await api.get(`/marketplace/themes/${themeId}/files`);
            if (res.data && res.data.files) {
                remoteFiles = res.data.files;
            }
        } catch(e) {
            // Hata olursa (örn eski sürüm API), yok say
        }

        // Bulutta olup lokalde olmayanları sil
        const filesToDelete = remoteFiles.filter(f => !filesToUpload.includes(f));
        for (const fileKey of filesToDelete) {
            try {
                await api.delete(`/marketplace/themes/${themeId}/file`, { data: { key: fileKey } });
            } catch (e) {
                // Ignore delete errors during sync
            }
        }

        for (const fileKey of filesToUpload) {
            const localFilePath = path.join(projectDir, fileKey);

            const ext = path.extname(localFilePath).toLowerCase();
            const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.otf'];
            const isBinary = binaryExtensions.includes(ext);

            const content = await fs.readFile(localFilePath, isBinary ? 'base64' : 'utf8');

            const payload: any = {
                key: fileKey,
                content: content
            };
            if (isBinary) {
                payload.encoding = 'base64';
            }

            await api.put(`/marketplace/themes/${themeId}/file`, payload);
        }
    }
}
