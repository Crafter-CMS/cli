import { Command, Flags } from '@oclif/core';
import { ApiService } from '../services/api.service';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs-extra';
import { glob } from 'glob';

export default class Push extends Command {
    static description = "Yerel klasördeki tüm dosyaları Crafter API'sine yükler (Sıfırdan senkronizasyon).";

    static flags = {
        theme: Flags.string({ char: 't', description: 'Theme ID (Eğer theme.config.js dosyasında yoksa zorunludur)' }),
    };

    async run() {
        const { flags } = await this.parse(Push);
        
        const projectDir = process.cwd();
        
        let themeId = flags.theme;

        const localConfigPath = path.join(projectDir, 'theme.config.js');
        if (fs.existsSync(localConfigPath) && !themeId) {
            try {
                const localConfig = require(localConfigPath);
                themeId = themeId || localConfig.themeId;
            } catch(e) {}
        }

        if (!themeId) {
            this.error(chalk.red('Theme ID belirtilmelidir. "theme-kit push -t <themeId>" komutunu kullanın veya projede init yapın.'));
        }

        const spinner = ora('Yerel dosyalar taranıyor...').start();

        try {
            const api = await ApiService.getInstance();
            
            // Collect files
            const filesToUpload: string[] = [];
            
            const scanDir = async (dir: string) => {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relativePath = path.relative(projectDir, fullPath).replace(/\\/g, '/');
                    
                    // Ignore some folders
                    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'theme.config.js' || entry.name === 'dist' || entry.name.endsWith('.zip')) {
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

            if (filesToUpload.length === 0) {
                spinner.warn(chalk.yellow('Yüklenecek dosya bulunamadı.'));
                return;
            }

            spinner.text = `${filesToUpload.length} dosya yükleniyor...`;

            let uploadedCount = 0;
            for (const fileKey of filesToUpload) {
                spinner.text = `Yükleniyor: ${fileKey}`;
                
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
                
                uploadedCount++;
            }

            spinner.succeed(chalk.green(`Başarılı! ${uploadedCount} dosya API'ye yüklendi.`));
        } catch (error: any) {
            spinner.fail(chalk.red('Yükleme işlemi başarısız oldu.'));
            this.error(error.response?.data?.message || error.message);
        }
    }
}
