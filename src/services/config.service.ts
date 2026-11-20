import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';

export interface Config {
    accessToken?: string;
    refreshToken?: string;
    apiUrl?: string;
    storefrontUrl?: string;
    userId?: string;
}

/** Config dosyası token içerdiği için yalnızca sahibi okuyup yazabilir */
export const CONFIG_FILE_MODE = 0o600;
export const CONFIG_DIR_MODE = 0o700;

export class ConfigService {
    /** CRAFTER_CONFIG_DIR ile farklı klasör seçilebilir (testler ve CI için) */
    static get configPath(): string {
        const dir = process.env.CRAFTER_CONFIG_DIR || path.join(os.homedir(), '.crafter');
        return path.join(dir, 'config.json');
    }

    private static defaultApiUrl = 'https://api.crafter.net.tr';
    private static defaultStorefrontUrl = 'https://origin.crafter.web.tr';

    static async getConfig(): Promise<Config> {
        try {
            if (await fs.pathExists(this.configPath)) {
                const config = await fs.readJson(this.configPath);
                return {
                    apiUrl: this.defaultApiUrl,
                    storefrontUrl: this.defaultStorefrontUrl,
                    ...config,
                };
            }
        } catch (error) {
            // Return default config if file is corrupted or unreadable
        }
        return { 
            apiUrl: this.defaultApiUrl,
            storefrontUrl: this.defaultStorefrontUrl
        };
    }

    /** Config dosyasını 0600 izinle yazar; dosya önceden daha geniş izinle varsa izni daraltır */
    private static async writeConfigFile(data: Config): Promise<void> {
        const configPath = this.configPath;
        await fs.ensureDir(path.dirname(configPath), { mode: CONFIG_DIR_MODE });
        await fs.writeJson(configPath, data, { spaces: 2, mode: CONFIG_FILE_MODE });
        // writeFile'daki mode yalnızca yeni dosyada uygulanır; var olan dosyanın izni de düzeltilir
        await fs.chmod(configPath, CONFIG_FILE_MODE);
    }

    static async setConfig(config: Config): Promise<void> {
        const currentConfig = await this.getConfig();
        const newConfig = { ...currentConfig, ...config };
        await this.writeConfigFile(newConfig);
    }

    static async clearConfig(): Promise<void> {
        if (await fs.pathExists(this.configPath)) {
            const config = await this.getConfig();
            // Keep apiUrl and storefrontUrl, clear sensitive data
            await this.writeConfigFile({
                apiUrl: config.apiUrl,
                storefrontUrl: config.storefrontUrl,
            });
        }
    }

    static async resetConfig(): Promise<void> {
        if (await fs.pathExists(this.configPath)) {
            await fs.remove(this.configPath);
        }
    }



    static async getApiUrl(): Promise<string> {
        const config = await this.getConfig();
        return config.apiUrl || this.defaultApiUrl;
    }

    static async getStorefrontUrl(): Promise<string> {
        const config = await this.getConfig();
        return config.storefrontUrl || this.defaultStorefrontUrl;
    }
}
