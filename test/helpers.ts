import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';

export async function makeTempDir(prefix = 'crafter-cli-test-'): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeFiles(root: string, files: Record<string, string | Buffer>): Promise<void> {
    for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(root, rel);
        await fs.ensureDir(path.dirname(abs));
        await fs.writeFile(abs, content);
    }
}
