import { Command } from '@oclif/core';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs-extra';
import { createZipArchive } from '../utils/zip';

export default class Pack extends Command {
    static description = 'Temayı dağıtmak veya satmak için .zip dosyası haline getirir.';

    async run() {
        const projectDir = process.cwd();
        const zipFileName = 'theme.zip';
        const zipFilePath = path.join(projectDir, zipFileName);

        const spinner = ora('Tema paketi oluşturuluyor...').start();

        try {
            // Delete existing zip if any
            if (fs.existsSync(zipFilePath)) {
                await fs.remove(zipFilePath);
            }

            const output = fs.createWriteStream(zipFilePath);
            const archive = createZipArchive({
                zlib: { level: 9 } // Sets the compression level.
            });

            return new Promise<void>((resolve, reject) => {
                output.on('close', () => {
                    spinner.succeed(chalk.green(`Başarılı! Tema paketi oluşturuldu: ${zipFileName} (${archive.pointer()} byte)`));
                    resolve();
                });

                archive.on('warning', (err: any) => {
                    if (err.code === 'ENOENT') {
                        spinner.warn(chalk.yellow(err.message));
                    } else {
                        reject(err);
                    }
                });

                archive.on('error', (err: any) => {
                    reject(err);
                });

                archive.pipe(output);

                // ignore files
                archive.glob('**/*', {
                    cwd: projectDir,
                    ignore: [
                        'node_modules/**',
                        '.git/**',
                        '.crafter',
                        zipFileName,
                        'dist/**'
                    ]
                });

                archive.finalize();
            });

        } catch (error: any) {
            spinner.fail(chalk.red('Paketleme işlemi başarısız oldu.'));
            this.error(error.message);
        }
    }
}
