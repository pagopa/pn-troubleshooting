import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { getAccessToken } from '../../shared/auth.js';
import { getEnabledPdndApiKeys, getOnboardInstitutions } from '../../shared/dynamodb.js';
import { generateDpopPrivateKey } from '../../shared/dpop.js';
import { generateAssertionJwt } from '../../shared/generate-assertion.js';
import { PdndCoreV3Client } from '../../shared/pdnd-core-v3.js';
import { getPrivateKey } from '../../shared/secrets.js';
import { formatDuration } from '../../shared/time.js';

const ENVIRONMENTS = {
    prod: {
        baseUrl: 'interop.pagopa.it',
        serviceId: 'cfc8a94d-001a-4ab6-bb5c-2509b2a68af1',
        issuer: '0203fdcf-644d-40d3-8b0e-f780bbf4bcc1',
        kid: 'MBZ2A_albOEL9j5I4AzyVsFVPVPvaLKpTYRXAOXon6o',
    },
    uat: {
        baseUrl: 'uat.interop.pagopa.it',
        serviceId: '51799439-8575-48d4-8e95-906926ab8e47',
        issuer: 'abb90dee-56fa-4fb0-8875-e8f6b7ade4cb',
        kid: '3jn5y7WHAyHYBogmPzZgyXlZlfmthzm9NgJFiMfaeU4',
    },
};

function getConfiguration() {
    const env = process.env.ENV;
    if (!ENVIRONMENTS[env]) {
        throw new Error(`ENV must be one of: ${Object.keys(ENVIRONMENTS).join(', ')}`);
    }
    const defaultOutputPath = process.env.AWS_LAMBDA_FUNCTION_NAME
        ? '/tmp/out-onBoardingTech.csv'
        : resolve('reports/out-onBoardingTech.csv');

    return {
        env,
        baseUrl: process.env.BASE_URL || ENVIRONMENTS[env].baseUrl,
        serviceId: process.env.SERVICE_ID || ENVIRONMENTS[env].serviceId,
        issuer: process.env.ISSUER || ENVIRONMENTS[env].issuer,
        kid: process.env.KID || ENVIRONMENTS[env].kid,
        outputPath: resolve(process.env.ONBOARDING_REPORT_PATH || defaultOutputPath),
    };
}

function normalizeIpaCode(value) {
    return value?.trim().toLocaleLowerCase('it-IT');
}

export function getCandidateTenantIds({ institutions, apiKeys, tenants }) {
    const enabledPaIds = new Set(apiKeys.map(apiKey => apiKey.paId));
    const candidateIpaCodes = new Set(institutions
        .filter(institution => enabledPaIds.has(institution.id))
        .map(institution => normalizeIpaCode(institution.ipaCode))
        .filter(Boolean));

    return tenants.filter(tenant =>
        tenant.externalId?.origin === 'IPA' &&
        candidateIpaCodes.has(normalizeIpaCode(tenant.externalId.value))
    ).map(tenant => tenant.id);
}

async function getActivePurposesForBatch(client, serviceId, consumerIds) {
    const page = await client.getActivePurposesPage(serviceId, consumerIds);
    if (!page || !Array.isArray(page.results) || !page.pagination) {
        throw new Error('Invalid paginated response from /purposes');
    }
    if (page.pagination.totalCount <= page.results.length) {
        return page.results;
    }
    if (consumerIds.length === 1) {
        return client.getAllPages('/purposes', {
            states: ['ACTIVE'],
            eserviceIds: [serviceId],
            consumerIds,
        }, 50);
    }

    const middle = Math.ceil(consumerIds.length / 2);
    return [
        ...await getActivePurposesForBatch(client, serviceId, consumerIds.slice(0, middle)),
        ...await getActivePurposesForBatch(client, serviceId, consumerIds.slice(middle)),
    ];
}

export async function getActivePurposesForConsumers(client, serviceId, consumerIds, batchSize = 25) {
    const purposesById = new Map();
    for (let offset = 0; offset < consumerIds.length; offset += batchSize) {
        const batch = consumerIds.slice(offset, offset + batchSize);
        const purposes = await getActivePurposesForBatch(client, serviceId, batch);
        for (const purpose of purposes) {
            purposesById.set(purpose.id, purpose);
        }
        console.log(
            `Finalita PDND: analizzati ${Math.min(offset + batchSize, consumerIds.length)}/${consumerIds.length} tenant candidati`
        );
    }
    return [...purposesById.values()];
}

export function buildOnboardingReport({ institutions, apiKeys, purposes, tenants }) {
    const enabledPaIds = new Set(apiKeys.map(apiKey => apiKey.paId));
    const tenantsById = new Map(tenants.map(tenant => [tenant.id, tenant]));
    const activeIpaCodes = new Set();
    let purposesWithoutTenant = 0;

    for (const purpose of purposes) {
        const tenant = tenantsById.get(purpose.consumerId);
        const ipaCode = tenant?.externalId?.origin === 'IPA'
            ? normalizeIpaCode(tenant.externalId.value)
            : undefined;
        if (ipaCode) {
            activeIpaCodes.add(ipaCode);
        } else {
            purposesWithoutTenant += 1;
        }
    }

    const rows = institutions.filter(institution =>
        enabledPaIds.has(institution.id) &&
        activeIpaCodes.has(normalizeIpaCode(institution.ipaCode))
    ).map(institution => ({
        paId: institution.id,
        paDesc: institution.description || '',
        ipaCode: institution.ipaCode,
    })).sort((left, right) => left.paId.localeCompare(right.paId));

    return {
        rows,
        summary: {
            onboardInstitutions: institutions.length,
            enabledPdndApiKeys: apiKeys.length,
            activePurposes: purposes.length,
            activePurposeTenants: activeIpaCodes.size,
            purposesWithoutTenant,
            technicalOnboardingInstitutions: rows.length,
        },
    };
}

function escapeCsv(value) {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function createCsv(rows) {
    const lines = ['"paId","paDesc","ipaCode"'];
    for (const row of rows) {
        lines.push([row.paId, row.paDesc, row.ipaCode].map(escapeCsv).join(','));
    }
    return `${lines.join('\n')}\n`;
}

async function executeOnboardingTecnico() {
    const configuration = getConfiguration();
    console.log(`ENV: ${configuration.env}`);
    console.log(`PDND Core API: https://api.${configuration.baseUrl}/v3`);
    console.log('Automazione onboarding tecnico: sola lettura');

    const privateKey = await getPrivateKey();
    const dpopPrivateKey = await generateDpopPrivateKey();
    console.log('Chiave DPoP effimera generata per questa esecuzione.');
    const assertion = await generateAssertionJwt(
        configuration.kid,
        configuration.issuer,
        `auth.${configuration.baseUrl}/client-assertion`,
        privateKey
    );
    const accessToken = await getAccessToken(
        configuration.baseUrl,
        configuration.issuer,
        assertion,
        dpopPrivateKey
    );
    const client = new PdndCoreV3Client({
        baseUrl: configuration.baseUrl,
        accessToken,
        dpopPrivateKey,
    });

    console.log('Recupero catalogo tenant da PDND...');
    const tenants = await client.getAllTenants();
    console.log(`Tenant PDND recuperati: ${tenants.length}`);

    console.log('Scan enti onboarded e API key PDND abilitate da DynamoDB...');
    const institutions = await getOnboardInstitutions();
    const apiKeys = await getEnabledPdndApiKeys();

    const candidateTenantIds = getCandidateTenantIds({ institutions, apiKeys, tenants });
    console.log(`Tenant candidati con API key PDND abilitata: ${candidateTenantIds.length}`);
    console.log('Recupero finalita SEND attive per gruppi di tenant...');
    const purposes = await getActivePurposesForConsumers(
        client,
        configuration.serviceId,
        candidateTenantIds
    );
    console.log(`Finalita SEND attive dei tenant candidati: ${purposes.length}`);

    const report = buildOnboardingReport({ institutions, apiKeys, purposes, tenants });
    await mkdir(dirname(configuration.outputPath), { recursive: true });
    await writeFile(configuration.outputPath, createCsv(report.rows), 'utf8');

    console.log('\n================ ONBOARDING TECNICO REPORT ================');
    console.log(`Enti PN analizzati: ${report.summary.onboardInstitutions}`);
    console.log(`API key ENABLED con pdnd=true: ${report.summary.enabledPdndApiKeys}`);
    console.log(`Finalita SEND ACTIVE dei tenant candidati: ${report.summary.activePurposes}`);
    console.log(`Tenant IPA con finalita attiva: ${report.summary.activePurposeTenants}`);
    console.log(`Enti con onboarding tecnico: ${report.summary.technicalOnboardingInstitutions}`);
    console.log(`Finalita senza tenant IPA risolvibile: ${report.summary.purposesWithoutTenant}`);
    console.log(`CSV: ${configuration.outputPath}`);
    console.log('============================================================');

    return {
        automation: 'onboarding-tecnico',
        generatedAt: new Date().toISOString(),
        reportPath: configuration.outputPath,
        summary: report.summary,
    };
}

export async function runOnboardingTecnico() {
    const startedAt = Date.now();
    try {
        const result = await executeOnboardingTecnico();
        return {
            ...result,
            durationMs: Date.now() - startedAt,
        };
    } finally {
        const durationMs = Date.now() - startedAt;
        console.log(`Durata totale onboarding tecnico: ${formatDuration(durationMs)}`);
    }
}
