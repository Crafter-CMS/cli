import { Command, Flags } from '@oclif/core';
import { ApiService } from '../services/api.service';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs-extra';

export default class Pull extends Command {
    static description = 'S3 üzerindeki temanın tüm dosyalarını yerel klasöre indirir.';

    static flags = {
        theme: Flags.string({ char: 't', description: 'Theme ID (Eğer theme.config.js dosyasında yoksa zorunludur)' }),
        force: Flags.boolean({ char: 'f', description: 'Var olan yerel dosyaların üzerine yazar', default: false }),
    };

    async run() {
        const { flags } = await this.parse(Pull);
        
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
            this.error(chalk.red('Theme ID belirtilmelidir. "theme-kit pull -t <themeId>" komutunu kullanın veya projede init yapın.'));
        }

        const spinner = ora('Tema dosyaları listeleniyor...').start();

        try {
            const api = await ApiService.getInstance();

            // 1. Dosya listesini al
            const filesRes = await api.get(`/marketplace/themes/${themeId}/files`);
            const files = filesRes.data.files as string[];

            if (!files || files.length === 0) {
                spinner.warn(chalk.yellow('Bu temada indirilecek dosya bulunamadı.'));
                return;
            }

            spinner.text = `${files.length} dosya indiriliyor...`;

            // 2. Her dosyayı indir ve kaydet
            let downloadedCount = 0;
            for (const fileKey of files) {
                const localFilePath = path.join(projectDir, fileKey);
                
                if (fs.existsSync(localFilePath) && !flags.force) {
                    this.log(chalk.gray(`Atlandı: ${fileKey} (Zaten var, üzerine yazmak için -f kullanın)`));
                    continue;
                }

                spinner.text = `İndiriliyor: ${fileKey}`;
                
                // Get file content
                let fileRes;
                try {
                    fileRes = await api.get(`/marketplace/themes/${themeId}/file`, {
                        params: { key: fileKey }
                    });
                } catch(e: any) {
                    spinner.warn(chalk.yellow(`Dosya alınamadı: ${fileKey}`));
                    continue;
                }

                let content = fileRes.data.content;
                
                if (fileRes.data.encoding === 'base64') {
                    content = Buffer.from(content, 'base64');
                }
                
                // Klasörü oluştur ve dosyayı yaz
                await fs.ensureDir(path.dirname(localFilePath));
                await fs.writeFile(localFilePath, content);
                
                downloadedCount++;
            }

            // (Artık config kaydetmiyoruz çünkü zaten theme.config.js init komutu ile oluşuyor)

            spinner.succeed(chalk.green(`Başarılı! ${downloadedCount} dosya indirildi.`));
            this.log(chalk.blue('Temanızı düzenlemeye başlayabilirsiniz. Senkronize etmek için "theme-kit dev" komutunu çalıştırın.'));

        } catch (error: any) {
            spinner.fail(chalk.red('İndirme işlemi başarısız oldu.'));
            this.error(error.response?.data?.message || error.message);
        }
    }
}
