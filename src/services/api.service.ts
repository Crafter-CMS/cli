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
        });

        this.instance.interceptors.request.use(async (axiosConfig) => {
            const currentConfig = await ConfigService.getConfig();
            if (currentConfig.accessToken) {
                if (this.isTokenExpired(currentConfig.accessToken)) {
                    if (currentConfig.refreshToken) {
                        try {
                            const response = await axios.post(`${apiUrl}/auth/refresh-token`, {
                                refreshToken: currentConfig.refreshToken,
                            });
                            const { accessToken } = response.data;
                            await ConfigService.setConfig({ accessToken });
                            axiosConfig.headers.Authorization = `Bearer ${accessToken}`;
                        } catch (error) {
                            console.error(chalk.red('\nOturumunuz sona erdi. Lütfen theme-kit login komutu ile tekrar giriş yapın.'));
                            await ConfigService.clearConfig();
                            process.exit(1);
                        }
                    } else {
                        console.error(chalk.red('\nOturumunuz sona erdi. Lütfen theme-kit login komutu ile tekrar giriş yapın.'));
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
                    console.error(chalk.red('\nOturumunuz sona erdi. Lütfen theme-kit login komutu ile tekrar giriş yapın.'));
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
