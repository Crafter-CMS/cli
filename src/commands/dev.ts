import { Command, Flags } from '@oclif/core';
import { ApiService } from '../services/api.service';
import { ConfigService } from '../services/config.service';
import { resolveThemeId } from '../utils/theme';
import { isIgnoredPath, getUploadSkipReason, describeSkipReason, formatSkippedFiles, toThemeKey, LOCAL_ONLY_FILES } from '../utils/ignore';
import { syncThemeFiles } from '../utils/sync';
import { syncManifestWithApi } from '../utils/manifest';
import {
    DEV_THEME_VERSION_HEADER,
    PREVIEW_UNAVAILABLE_LINES,
    isDevPreviewForbidden,
    isThemePublished,
    previewUnavailableHtml,
    probeDevPreview,
    publishedPreviewLines,
    publishedPreviewUrl,
} from '../utils/preview';
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

        // crafter-manifest.json yerel kalır: sunucu manifesti yalnızca eksik alanları doldurur, yazma onayla yapılır
        await syncManifestWithApi(projectDir, themeId as string, api, (m) => this.log(chalk.yellow(m)));

        // Hem yeni hem mevcut tema için başlangıçta tüm dosyaları senkronize et
        const pushSpinner = ora('Tüm dosyalar senkronize ediliyor (assets dahil)...').start();
        try {
            const result = await syncThemeFiles(api, themeId as string, projectDir, (m) => { pushSpinner.text = m; });
            pushSpinner.succeed(chalk.green(`Tüm dosyalar başarıyla yüklendi! (${result.fileCount} dosya)`));
            if (result.skipped.length > 0) {
                this.log(chalk.yellow(`${result.skipped.length} dosya gönderilmedi / ${result.skipped.length} file(s) not uploaded:`));
                formatSkippedFiles(result.skipped).forEach((l) => this.log(chalk.yellow(l)));
            }
        } catch (error: any) {
            pushSpinner.fail(chalk.red('Dosya senkronizasyonu başarısız: ' + (error.response?.data?.message || error.message)));
        }

        // ==========================================
        // LOCAL PROXY SERVER (Auto-Reload & Injection)
        // ==========================================
        const proxyPort = 9292;
        const targetStorefront = await ConfigService.getStorefrontUrl();

        // #319 sonrası dev kaynağı imzalı token olmadan 403 alır: önizlemeyi kapat, izleme ve senkronizasyon sürsün
        let previewUnavailableShown = false;
        let publishedUrl: string | undefined;
        const showPreviewUnavailable = async () => {
            if (previewUnavailableShown) return;
            previewUnavailableShown = true;
            if (await isThemePublished(api, themeId as string)) {
                publishedUrl = publishedPreviewUrl(targetStorefront, themeId as string);
            }
            this.log('');
            PREVIEW_UNAVAILABLE_LINES.forEach((l) => this.log(chalk.yellow(l)));
            if (publishedUrl) {
                publishedPreviewLines(publishedUrl).forEach((l) => this.log(chalk.cyan(l)));
            }
            this.log('');
        };

        const previewProbe = await probeDevPreview(targetStorefront, themeId as string);
        const previewEnabled = previewProbe !== 'forbidden';
        if (!previewEnabled) {
            await showPreviewUnavailable();
        }

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

        proxy.on('error', (err, _req, res) => {
            try {
                const out = res as http.ServerResponse;
                if (!out.headersSent) {
                    out.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
                }
                out.end('Storefront erişilemiyor / Storefront unreachable: ' + err.message);
            } catch (e) { }
        });

        proxy.on('proxyRes', (proxyRes, req, res) => {
            if (isDevPreviewForbidden(proxyRes.statusCode)) {
                // Token olmadan dev kaynağı reddedildi: yanıtı tüket, açıklayıcı sayfa göster, süreci sonlandırma
                proxyRes.resume();
                showPreviewUnavailable().finally(() => {
                    if (!res.headersSent) {
                        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                    }
                    res.end(previewUnavailableHtml(publishedUrl));
                });
                return;
            }
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
                req.headers[DEV_THEME_VERSION_HEADER] = 'dev';

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

        server.on('error', (err: any) => {
            this.log(chalk.yellow(`Önizleme sunucusu başlatılamadı (port ${proxyPort}): ${err.message}. Dosya izleme devam ediyor. / Preview server could not start; file watching continues.`));
        });

        if (previewEnabled) {
            server.listen(proxyPort, () => {
                this.log(chalk.cyan("\n🌍 Canlı Önizleme: " + chalk.underline("http://localhost:" + proxyPort) + "\n"));
            });
        }

        // ==========================================
        // CHOKIDAR WATCHER
        // ==========================================
        const watchSpinner = ora('Dosya değişiklikleri izleniyor (Watch Mode)...').start();

        const watcher = chokidar.watch(projectDir, {
            // zip ile aynı ortak yok sayma listesi (gizli dosyalar, node_modules, dist, .zip ...)
            ignored: (filePath: string) => isIgnoredPath(toThemeKey(projectDir, filePath)),
            persistent: true,
            ignoreInitial: true,
        });

        const uploadFile = async (filePath: string) => {
            const relativePath = toThemeKey(projectDir, filePath);
            if (LOCAL_ONLY_FILES.includes(relativePath)) return;

            let size: number | undefined;
            try {
                size = (await fs.stat(filePath)).size;
            } catch (e) { }
            const skipReason = getUploadSkipReason(relativePath, size);
            if (skipReason) {
                this.log(chalk.yellow(`Atlandı / Skipped: ${relativePath} (${describeSkipReason(skipReason)})`));
                return;
            }

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
                const status = error.response?.status;
                if (status === 400 || status === 413) {
                    console.error(chalk.yellow(`Sunucu dosyayı reddetti (${status}) / Server rejected the file: ` + (error.response?.data?.message || error.message)));
                } else {
                    console.error(error.response?.data?.message || error.message);
                }
            }
        };

        const deleteFile = async (filePath: string) => {
            const relativePath = toThemeKey(projectDir, filePath);
            // Sunucuya hiç gönderilmeyen dosyalar için silme isteği atılmaz
            if (LOCAL_ONLY_FILES.includes(relativePath) || getUploadSkipReason(relativePath)) return;
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
}
