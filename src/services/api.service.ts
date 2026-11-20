import axios, { AxiosInstance, AxiosError } from 'axios';
import { ConfigService } from './config.service';
import { jwtDecode } from 'jwt-decode';
import chalk from 'chalk';

export class ApiService {
    private static instance: AxiosInstance;

    static async getInstance(): Promise<AxiosInstance> {
        if (this.instance) return this.instance;

        const apiUrl = await ConfigService.getApiUrl();

        this.instance = axios.create({
            baseURL: apiUrl,
            headers: {
                'Content-Type': 'application/json',
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        });

        this.instance.interceptors.request.use(async (axiosConfig) => {
            const currentConfig = await ConfigService.getConfig();
            if (currentConfig.accessToken) {
                if (this.isTokenExpired(currentConfig.accessToken)) {
                    if (currentConfig.refreshToken) {
                        try {
                            const accessToken = await this.refreshTokens(apiUrl, currentConfig.refreshToken);
                            axiosConfig.headers.Authorization = `Bearer ${accessToken}`;
                        } catch (error) {
                            console.error(chalk.red('\nOturumunuz sona erdi. Lütfen npx @crafter-cms/cli login komutu ile tekrar giriş yapın.'));
                            await ConfigService.clearConfig();
                            process.exit(1);
                        }
                    } else {
                        console.error(chalk.red('\nOturumunuz sona erdi. Lütfen npx @crafter-cms/cli login komutu ile tekrar giriş yapın.'));
                        process.exit(1);
                    }
                } else {
                    axiosConfig.headers.Authorization = `Bearer ${currentConfig.accessToken}`;
                }
            }
            return axiosConfig;
        });

        this.instance.interceptors.response.use(
            (response) => response,
            (error: AxiosError) => {
                if (error.response?.status === 401) {
                    console.error(chalk.red('\nOturumunuz sona erdi. Lütfen npx @crafter-cms/cli login komutu ile tekrar giriş yapın.'));
                    process.exit(1);
                }
                if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                    console.error(chalk.red('\nAPI servisine ulaşılamıyor. İnternet bağlantınızı kontrol edin.'));
                    process.exit(1);
                }
                return Promise.reject(error);
            }
        );

        return this.instance;
    }

    private static refreshInFlight: Promise<string> | null = null;

    /**
     * Token'ı yeniler ve yeni access/refresh token'ı config dosyasına kaydeder.
     * Aynı anda gelen istekler (dev izleyicisi) tek bir yenileme isteğini paylaşır.
     */
    static refreshTokens(apiUrl: string, refreshToken: string): Promise<string> {
        if (!this.refreshInFlight) {
            this.refreshInFlight = (async () => {
                const response = await axios.post(`${apiUrl}/auth/refresh-token`, { refreshToken });
                const data = response.data?.data ?? response.data;
                const newAccessToken: string | undefined = data?.accessToken;
                if (!newAccessToken) throw new Error('Token yenilenemedi.');
                const newRefreshToken: string | undefined = data?.refreshToken;
                await ConfigService.setConfig({
                    accessToken: newAccessToken,
                    ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}),
                });
                return newAccessToken;
            })().finally(() => {
                this.refreshInFlight = null;
            });
        }
        return this.refreshInFlight;
    }

    private static isTokenExpired(token: string): boolean {
        try {
            const decoded: any = jwtDecode(token);
            const currentTime = Date.now() / 1000;
            return decoded.exp < currentTime + 60; // Expired or expiring in less than 60 seconds
        } catch (error) {
            return true;
        }
    }
}
