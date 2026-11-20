import { Command, Flags } from '@oclif/core';
import { ApiService } from '../services/api.service';
import { resolveThemeId } from '../utils/theme';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Tema dosyalarını sunucudan indirme.
 *
 * Sunucuda (backend main/development) tema sahibinin dev/ dosyalarının içeriğini okuyabileceği bir uç nokta yok:
 * - GET /marketplace/themes/:id/files yalnızca dosya adlarını listeler (sahip/yönetici).
 * - Önceki sürümlerin çağırdığı GET /marketplace/themes/:id/file hiç var olmadı; her dosya atlanıp "0 dosya indirildi" deniyordu.
 * - İmzalı indirme bağlantısı veya dev/ ZIP indirme uç noktası da yok.
 * Bu yüzden pull, dosyaları listeleyip net bir hata ile sonlanır. İndirme, backend'e okuma uç noktası eklendiğinde geri gelecek.
 */
export default class Pull extends Command {
    static description = 'Temanın sunucudaki dosyalarını yerel klasöre indirir (sunucu desteği gelene kadar geçici olarak kullanılamıyor).';

    static flags = {
        theme: Flags.string({ char: 't', description: 'Theme ID (Eğer crafter-manifest.json dosyasında yoksa zorunludur)' }),
        force: Flags.boolean({ char: 'f', description: 'Var olan yerel dosyaların üzerine yazar', default: false }),
    };

    async run() {
        const { flags } = await this.parse(Pull);

        const projectDir = process.cwd();
        const themeId = await resolveThemeId(projectDir, flags.theme);

        if (!themeId) {
            this.error(chalk.red('Theme ID belirtilmelidir. "npx @crafter-cms/cli pull -t <themeId>" komutunu kullanın veya projede init yapın.'));
        }

        const spinner = ora('Tema dosyaları listeleniyor...').start();

        let fileCount: number | undefined;
        try {
            const api = await ApiService.getInstance();
            const filesRes = await api.get(`/marketplace/themes/${themeId}/files`);
            const files = filesRes.data?.files;
            fileCount = Array.isArray(files) ? files.length : undefined;
            spinner.stop();
        } catch (error: any) {
            spinner.fail(chalk.red('Tema dosyaları listelenemedi.'));
            if (error.response?.status === 403) {
                this.error(chalk.red('Bu temanın dosyalarına erişim yetkiniz yok (yalnızca tema sahibi). / You do not have access to this theme\'s files (theme owner only).'));
            }
            this.error(error.response?.data?.message || error.message);
        }

        const countInfo = fileCount !== undefined ? ` (${fileCount})` : '';
        this.error(chalk.red([
            `pull şu anda kullanılamıyor: sunucuda tema dosyalarının içeriğini indirmek için bir uç nokta yok. Dosyalarınız sunucuda duruyor${countInfo}; hiçbir yerel dosya değiştirilmedi.`,
            'Yerel dosyalarınız güncel kaynaktır: "crafter push" veya "crafter dev" ile sunucuya gönderebilirsiniz. İndirme desteği bir sonraki CLI güncellemesiyle gelecek.',
            `pull is currently unavailable: the server has no endpoint to download theme file contents. Your files are still on the server${countInfo}; no local files were changed.`,
            'Your local files are the source of truth: use "crafter push" or "crafter dev" to upload them. Download support will come with a later CLI update.',
        ].join('\n')), { exit: 1 });
    }
}
