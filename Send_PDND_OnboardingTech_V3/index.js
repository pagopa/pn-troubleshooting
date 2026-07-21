import { pathToFileURL } from 'node:url';
import 'dotenv/config';
import { runOnboardingTecnico } from './src/automations/onboarding-tecnico/index.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.length > 2) {
        throw new Error(`Unknown option: ${process.argv.slice(2).join(', ')}`);
    }
    await runOnboardingTecnico();
}
