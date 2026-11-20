import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as path from 'path';
import * as fs from 'fs-extra';
import { ConfigService } from '../src/services/config.service';
import { makeTempDir } from './helpers';

const isWindows = process.platform === 'win32';
let dir: string;
const prevEnv = process.env.CRAFTER_CONFIG_DIR;

beforeAll(async () => {
    dir = path.join(await makeTempDir(), 'nested', '.crafter');
    process.env.CRAFTER_CONFIG_DIR = dir;
});

afterAll(async () => {
    if (prevEnv === undefined) delete process.env.CRAFTER_CONFIG_DIR;
    else process.env.CRAFTER_CONFIG_DIR = prevEnv;
    await fs.remove(path.dirname(path.dirname(dir)));
});

const mode = async (p: string) => (await fs.stat(p)).mode & 0o777;

describe.skipIf(isWindows)('ConfigService dosya izinleri', () => {
    it('yeni config dosyasını 0600, klasörü 0700 ile oluşturur', async () => {
        await ConfigService.setConfig({ accessToken: 'test-access', refreshToken: 'test-refresh' });
        const file = path.join(dir, 'config.json');
        expect(ConfigService.configPath).toBe(file);
        expect(await mode(file)).toBe(0o600);
        expect(await mode(dir)).toBe(0o700);
        expect((await fs.readJson(file)).accessToken).toBe('test-access');
    });

    it('daha geniş izinli var olan dosyayı yazarken 0600 yapar', async () => {
        const file = path.join(dir, 'config.json');
        await fs.chmod(file, 0o644);
        await ConfigService.setConfig({ accessToken: 'test-access-2' });
        expect(await mode(file)).toBe(0o600);
    });

    it('clearConfig de 0600 korur ve token alanlarını siler', async () => {
        const file = path.join(dir, 'config.json');
        await fs.chmod(file, 0o666);
        await ConfigService.clearConfig();
        expect(await mode(file)).toBe(0o600);
        const data = await fs.readJson(file);
        expect(data.accessToken).toBeUndefined();
        expect(data.refreshToken).toBeUndefined();
    });
});
