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

export class ConfigService {
    private static configPath = path.join(os.homedir(), '.crafter', 'config.json');
    private static defaultApiUrl = 'https://api.crafter.net.tr';
    private static defaultStorefrontUrl = 'https://origin.crafterdns.tech';

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

    static async setConfig(config: Config): Promise<void> {
        const currentConfig = await this.getConfig();
        const newConfig = { ...currentConfig, ...config };
        await fs.ensureDir(path.dirname(this.configPath));
        await fs.writeJson(this.configPath, newConfig, { spaces: 2 });
    }

    static async clearConfig(): Promise<void> {
        if (await fs.pathExists(this.configPath)) {
            const config = await this.getConfig();
            // Keep apiUrl and storefrontUrl, clear sensitive data
            await fs.writeJson(this.configPath, { 
                apiUrl: config.apiUrl,
                storefrontUrl: config.storefrontUrl 
            }, { spaces: 2 });
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
