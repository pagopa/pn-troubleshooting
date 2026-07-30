import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = resolve(projectRoot, 'dist');
const buildDirectory = resolve(distDirectory, 'lambda');
const zipPath = resolve(distDirectory, 'send-pdnd-onboarding-tech-v3.zip');

rmSync(buildDirectory, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(buildDirectory, { recursive: true });

for (const entry of ['lambda.js', 'package.json', 'package-lock.json', 'src']) {
    cpSync(resolve(projectRoot, entry), resolve(buildDirectory, entry), { recursive: true });
}

execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: buildDirectory,
    stdio: 'inherit',
});
execFileSync('zip', ['-qr', zipPath, '.'], {
    cwd: buildDirectory,
    stdio: 'inherit',
});

console.log(`Lambda artifact: ${zipPath}`);
