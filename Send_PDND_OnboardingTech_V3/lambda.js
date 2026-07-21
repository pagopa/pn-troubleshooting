import { runOnboardingTecnico } from './src/automations/onboarding-tecnico/index.js';

export async function handler() {
    return runOnboardingTecnico();
}
