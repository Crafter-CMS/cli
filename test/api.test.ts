import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs-extra';
import axios from 'axios';
import { ApiService } from '../src/services/api.service';
import { ConfigService } from '../src/services/config.service';
import { makeTempDir } from './helpers';

let root: string;
const prevEnv = process.env.CRAFTER_CONFIG_DIR;

beforeAll(async () => {
    root = await makeTempDir();
    process.env.CRAFTER_CONFIG_DIR = root;
});

afterAll(async () => {
    if (prevEnv === undefined) delete process.env.CRAFTER_CONFIG_DIR;
    else process.env.CRAFTER_CONFIG_DIR = prevEnv;
    vi.restoreAllMocks();
    await fs.remove(root);
});

describe('ApiService.refreshTokens', () => {
    it('yenilenen access ve refresh token\'ı config dosyasına kaydeder, eşzamanlı istekleri tek yenilemede toplar', async () => {
        await ConfigService.setConfig({ accessToken: 'old-access', refreshToken: 'old-refresh' });
        const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { accessToken: 'new-access', refreshToken: 'new-refresh' } });

        const [a, b] = await Promise.all([
            ApiService.refreshTokens('https://api.example.test', 'old-refresh'),
            ApiService.refreshTokens('https://api.example.test', 'old-refresh'),
        ]);

        expect(a).toBe('new-access');
        expect(b).toBe('new-access');
        expect(post).toHaveBeenCalledTimes(1);
        const saved = await fs.readJson(path.join(root, 'config.json'));
        expect(saved.accessToken).toBe('new-access');
        expect(saved.refreshToken).toBe('new-refresh');
    });

    it('sunucu refresh token döndürmezse eskisini korur', async () => {
        await ConfigService.setConfig({ accessToken: 'old-access', refreshToken: 'keep-refresh' });
        vi.spyOn(axios, 'post').mockResolvedValue({ data: { accessToken: 'only-access' } });
        await ApiService.refreshTokens('https://api.example.test', 'keep-refresh');
        const saved = await fs.readJson(path.join(root, 'config.json'));
        expect(saved.accessToken).toBe('only-access');
        expect(saved.refreshToken).toBe('keep-refresh');
    });
});
