import { Command, Flags } from '@oclif/core';
import { ApiService } from '../services/api.service';
import { ConfigService } from '../services/config.service';
import { resolveThemeId } from '../utils/theme';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs-extra';
import chokidar from 'chokidar';
import httpProxy from 'http-proxy';
import * as http from 'http';
import { WebSocketServer } from 'ws';
import archiver from 'archiver';
import FormData from 'form-data';

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
        let themeId = await resolveThemeId(projectDir, flags.theme);

        if (fs.existsSync(localConfigPath) && !flags.website) {
            try {
                const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
                if (localConfig.websiteId) {
                    websiteId = localConfig.websiteId;
                }
            } catch (e) { }
        }

        if (!themeId) {
            this.error(chalk.red('Theme ID bulunamadı. Lütfen önce "npx @crafter-cms/cli init" komutunu çalıştırın veya -t <themeId> parametresini belirtin.'));
        }

        let api: any;
        try {
            api = await ApiService.getInstance();
        } catch (error: any) {
            this.error(chalk.red("API'ye bağlanılamadı: " + error.message));
        }

        // Generate crafter-manifest.json to ensure security features work
        const manifestPath = path.join(projectDir, 'crafter-manifest.json');
        let manifestData: any = { marketplaceThemeId: themeId };
        try {
            const res = await api.get(`/marketplace/themes/${themeId}/manifest`);
            if (res.data) {
                manifestData = res.data;
            }
        } catch (e) { }
        await fs.writeJSON(manifestPath, manifestData, { spaces: 2 });


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
                urlObj.searchParams.set('themeId', themeId as string);
                // urlObj.searchParams.set('preview_website_id', websiteId as string); // For Storefront to know which website data to load
                
                // Ayrıca header olarak da ekleyelim (Storefront nasıl okuyorsa)
                // req.headers['x-crafter-website-id'] = websiteId as string;
                req.headers['x-crafter-theme-id'] = themeId as string;
                req.headers['x-crafter-theme-version'] = 'dev';

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
        // 1. Temayı bellekte (Buffer olarak) ZIP'le
        const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
            const bufs: Buffer[] = [];
            const archive = (archiver as any)('zip', { zlib: { level: 6 } });

            archive.on('data', (chunk: Buffer) => bufs.push(chunk));
            archive.on('end', () => resolve(Buffer.concat(bufs)));
            archive.on('error', (err: any) => reject(err));

            // Hariç tutulacak dosyalar (gereksiz yüklemeleri önler)
            archive.glob('**/*', {
                cwd: projectDir,
                ignore: [
                    'node_modules/**',
                    '.git/**',
                    '.crafter',
                    '*.zip',
                    'dist/**',
                    '.DS_Store',
                    'desktop.ini'
                ],
                dot: true // .liquidrc, .env gibi dotfile'ları dahil eder (.git ve .crafter hariç)
            });

            archive.finalize();
        });

        // 2. Multipart FormData oluştur
        const form = new FormData();
        form.append('file', zipBuffer, {
            filename: 'theme.zip',
            contentType: 'application/zip',
        });

        // 3. Tek seferde backend'e gönder
        await api.post(`/marketplace/themes/${themeId}/sync`, form, {
            headers: form.getHeaders(),
        });
    }
}
