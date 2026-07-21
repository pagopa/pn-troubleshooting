import { pathToFileURL } from 'node:url';
import 'dotenv/config';
import { runFruizioniFinalita } from './src/automations/fruizioni-finalita/index.js';

function parseArguments(args) {
    const supported = new Set(['--dry-run']);
    const unknown = args.filter(argument => !supported.has(argument));
    if (unknown.length > 0) {
        throw new Error(`Unknown option: ${unknown.join(', ')}`);
    }
    return { dryRun: args.includes('--dry-run') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await runFruizioniFinalita(parseArguments(process.argv.slice(2)));
}
