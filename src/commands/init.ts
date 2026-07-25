import { Command } from '@oclif/core';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs-extra';
import { select, input, confirm } from '@inquirer/prompts';
import { execSync } from 'child_process';
import { ApiService } from '../services/api.service';

export default class Init extends Command {
    static description = 'Sıfırdan geliştirme yapmak için yerel klasörde Marketplace temasını init eder.';

    async run() {
        const projectDir = process.cwd();
        const localConfigPath = path.join(projectDir, '.crafter');
        
        let api: any;
        try {
            api = await ApiService.getInstance();
        } catch (error: any) {
            this.error(chalk.red("API'ye bağlanılamadı: " + error.message));
        }

        this.log(chalk.cyan('Crafter CMS Tema Geliştirme (Marketplace)'));

        const action = await select({
            message: 'Ne yapmak istiyorsunuz?',
            choices: [
                {
                    name: 'Yeni bir tema oluştur',
                    value: 'new',
                },
                {
                    name: 'Var olan bir temamı seç',
                    value: 'existing',
                },
            ],
        });

        let themeId: string | null = null;

        if (action === 'new') {
            const name = await input({ message: 'Tema adı:', required: true });
            const description = await input({ message: 'Açıklama (opsiyonel):' });
            const version = await input({ message: 'Versiyon:', default: '1.0.0' });

            const spinner = ora('Geliştirici teması oluşturuluyor...').start();
            try {
                const res = await api.post('/marketplace/themes/dev-theme', {
                    name,
                    description,
                    version
                });
                themeId = res.data.data.id;
                spinner.succeed(chalk.green(`Tema başarıyla oluşturuldu! (ID: ${themeId})`));
            } catch (error: any) {
                spinner.fail(chalk.red('Tema oluşturulamadı.'));
                this.error(error.response?.data?.message || error.message);
            }
        } else {
            const spinner = ora('Temalarınız getiriliyor...').start();
            try {
                const res = await api.get('/marketplace/themes/my-themes/list');
                const themes = res.data;
                spinner.stop();

                if (!themes || themes.length === 0) {
                    this.error(chalk.red('Hesabınıza kayıtlı bir tema bulunamadı. Lütfen yeni tema oluşturun.'));
                }

                themeId = await select({
                    message: 'Geliştirmek istediğiniz temayı seçin:',
                    choices: themes.map((t: any) => ({
                        name: `${t.name} (v${t.version || '1.0.0'})`,
                        value: t.id
                    }))
                });
            } catch (error: any) {
                spinner.fail(chalk.red('Temalar getirilirken hata oluştu.'));
                this.error(error.response?.data?.message || error.message);
            }
        }

        if (themeId) {
            // Save to .crafter
            let currentConfig = {};
            if (fs.existsSync(localConfigPath)) {
                try {
                    currentConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
                } catch (e) { }
            }
            await fs.writeJSON(localConfigPath, { ...currentConfig, themeId }, { spaces: 2 });
            
            // Sadece dizin boşsa veya iskelet yoksa boilerplate dosyaları oluştur
            if (!fs.existsSync(path.join(projectDir, 'layout', 'theme.liquid'))) {
                
                const pullTemplate = await confirm({
                    message: 'Varsayılan başlangıç şablonunu (Crafter-CMS/Liquided-Theme) indirmek ister misiniz?',
                    default: true
                });

                if (pullTemplate) {
                    const cloneSpinner = ora('Şablon indiriliyor (https://github.com/Crafter-CMS/Liquided-Theme)...').start();
                    try {
                        const tempDir = path.join(projectDir, '.temp-theme');
                        
                        // Önceki temp klasörü kaldıysa temizle
                        if (fs.existsSync(tempDir)) {
                            await fs.remove(tempDir);
                        }

                        execSync(`git clone https://github.com/Crafter-CMS/Liquided-Theme.git "${tempDir}"`, { stdio: 'ignore' });
                        
                        const items = await fs.readdir(tempDir);
                        for (const item of items) {
                            if (item === '.git') continue;
                            await fs.move(path.join(tempDir, item), path.join(projectDir, item), { overwrite: true });
                        }
                        
                        await fs.remove(tempDir);
                        cloneSpinner.succeed(chalk.green('Şablon başarıyla indirildi!'));
                    } catch (e: any) {
                        cloneSpinner.fail(chalk.red('Şablon indirilirken bir hata oluştu: ' + e.message));
                        this.log(chalk.yellow('Boş tema iskeleti oluşturuluyor...'));
                        await this.createBoilerplate(projectDir);
                    }
                } else {
                    this.log(chalk.gray('Boş tema iskeleti dosyaları oluşturuluyor...'));
                    await this.createBoilerplate(projectDir);
                }
            }

            this.log(chalk.green('\n✅ Init işlemi tamamlandı!'));
            this.log(chalk.blue('Şimdi "theme-kit dev" komutunu çalıştırarak geliştirmeye başlayabilirsiniz.'));
        }
    }

    private async createBoilerplate(projectDir: string) {
        const filesToCreate = {
            'layout/theme.liquid': `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>{{ shop.name }}</title>\n    {{ content_for_header }}\n    <link rel="stylesheet" href="{{ 'theme.css' | asset_url }}">\n</head>\n<body>\n    <header>\n        <h1>{{ shop.name }}</h1>\n    </header>\n\n    <main id="MainContent">\n        {{ content_for_layout }}\n    </main>\n\n    <footer>\n        <p>&copy; {{ 'now' | date: "%Y" }} {{ shop.name }}</p>\n    </footer>\n</body>\n</html>`,
            'templates/index.liquid': `<h2>Hoş Geldiniz</h2>\n<p>Bu sizin yeni Crafter temanızın ana sayfasıdır.</p>`,
            'assets/theme.css': `body {\n    font-family: sans-serif;\n    margin: 0;\n    padding: 0;\n}\nheader, footer {\n    background-color: #f4f4f4;\n    padding: 20px;\n    text-align: center;\n}\nmain {\n    padding: 20px;\n    min-height: 50vh;\n}\n`,
            'config/settings_schema.json': `[]`
        };

        for (const [filePath, content] of Object.entries(filesToCreate)) {
            const fullPath = path.join(projectDir, filePath);
            await fs.ensureDir(path.dirname(fullPath));
            if (!fs.existsSync(fullPath)) {
                await fs.writeFile(fullPath, content);
            }
        }
    }
}
