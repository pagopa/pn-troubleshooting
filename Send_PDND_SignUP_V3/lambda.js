import { runFruizioniFinalita } from './src/automations/fruizioni-finalita/index.js';

export async function handler(event = {}) {
    return runFruizioniFinalita({ dryRun: event.dryRun === true });
}
