import { getAccessToken } from '../../shared/auth.js';
import { generateDpopPrivateKey } from '../../shared/dpop.js';
import { generateAssertionJwt } from '../../shared/generate-assertion.js';
import { getIpaUoApexInstitution } from '../../shared/ipa.js';
import { PdndCoreV3Client } from '../../shared/pdnd-core-v3.js';
import {
    getPrivateKey,
    getSelfcareApiKey,
} from '../../shared/secrets.js';
import {
    getSelfcareInstitution,
    getSelfcareInstitutionForUnit,
    SelfcareInstitutionNotFoundError,
} from '../../shared/self-care.js';
import { formatDuration } from '../../shared/time.js';

const SUPPORTED_ENVIRONMENTS = new Set(['prod', 'uat']);

function requireEnvironmentVariable(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function getConfiguration(dryRun) {
    const env = requireEnvironmentVariable('ENV');
    if (!SUPPORTED_ENVIRONMENTS.has(env)) {
        throw new Error(`ENV must be one of: ${[...SUPPORTED_ENVIRONMENTS].join(', ')}`);
    }

    return {
        env,
        baseUrl: requireEnvironmentVariable('BASE_URL'),
        serviceId: requireEnvironmentVariable('SERVICE_ID'),
        issuer: requireEnvironmentVariable('ISSUER'),
        producerId: requireEnvironmentVariable('PRODUCER_ID'),
        kid: requireEnvironmentVariable('KID'),
        maxDailyCalls: Number(process.env.MAX_DAILY_CALLS || 30000),
        dryRun,
    };
}

export function checkOnboarding(institution, products) {
    if (!Array.isArray(institution?.onboarding)) {
        return false;
    }
    return products.every(productId => institution.onboarding.some(
        onboarding => onboarding.productId === productId && onboarding.status === 'ACTIVE'
    ));
}

function checkPurpose(purpose, maxDailyCalls) {
    return Boolean(purpose?.waitingForApprovalVersion) &&
        purpose.waitingForApprovalVersion.dailyCalls <= maxDailyCalls;
}

function createExecutionReport() {
    return {
        pendingAgreementsSummary: undefined,
        agreementsToReview: [],
        agreementsActivated: [],
        agreementsNotActivated: [],
        purposesActivated: [],
        purposesNotActivated: [],
    };
}

function printItems(title, items, formatter) {
    console.log(`\n${title} (${items.length})`);
    if (items.length === 0) {
        console.log('- Nessuna');
        return;
    }
    for (const item of items) {
        console.log(`- ${formatter(item)}`);
    }
}

export function formatTenant(item) {
    return `consumerId=${item.consumerId || 'N/D'} | tenant=${item.tenantName || 'N/D'} ` +
        `| tenantKind=${item.tenantKind || 'N/D'}`;
}

export function isMissingSelfcareUnit(tenant, error) {
    return tenant?.subUnitType === 'UO' && error instanceof SelfcareInstitutionNotFoundError;
}

export async function resolveApexInstitution(tenant, {
    ipaLookup = getIpaUoApexInstitution,
} = {}) {
    const origin = tenant?.externalId?.origin?.toUpperCase();
    const originId = tenant?.externalId?.value;
    if (origin === 'IPA') {
        return ipaLookup(originId);
    }
    if (origin === 'SELC' && originId) {
        return {
            taxCode: originId,
            description: tenant.name,
        };
    }
    throw new Error(`unable to resolve apex institution for origin=${origin || 'N/D'}`);
}

function printExecutionReport(report, dryRun) {
    console.log(`\n==================== ${dryRun ? 'DRY-RUN' : 'EXECUTION'} REPORT V3 ====================`);
    if (report.pendingAgreementsSummary) {
        const summary = report.pendingAgreementsSummary;
        console.log('\nRIEPILOGO ACCORDI PENDING');
        console.log(`- Complessivi del producer: ${summary.producerTotal}`);
        console.log(`- Relativi a SEND: ${summary.sendTotal}`);
        console.log(`- Fuori dal SEND ordinario, da verificare manualmente: ${summary.toReviewTotal}`);
    }
    printItems('ACCORDI PENDING DA VERIFICARE MANUALMENTE', report.agreementsToReview,
        item => `${item.id} | ${formatTenant(item)} | eService=${item.eserviceName} [${item.eserviceId}]` +
            (item.metadataError ? ` | nota=${item.metadataError}` : ''));
    printItems('FRUIZIONI ATTIVATE', report.agreementsActivated,
        item => `${item.id} | ${formatTenant(item)} | institution=${item.institution}`);
    printItems('FINALITA ATTIVATE', report.purposesActivated,
        item => `${item.id} | ${formatTenant(item)} | title=${item.title} | description=${item.description}` +
            (item.metadataError ? ` | nota=${item.metadataError}` : ''));
    printItems('FRUIZIONI NON ATTIVATE', report.agreementsNotActivated,
        item => `${item.id} | ${formatTenant(item)} | motivo=${item.reason}`);
    printItems('FINALITA NON ATTIVATE', report.purposesNotActivated,
        item => `${item.id} | ${formatTenant(item)} | title=${item.title} | motivo=${item.reason}` +
            (item.metadataError ? ` | nota=${item.metadataError}` : ''));
    console.log('\n================================================================');
}

async function getTenantCached(client, tenantCache, consumerId) {
    if (!tenantCache.has(consumerId)) {
        tenantCache.set(consumerId, client.getTenant(consumerId));
    }
    return tenantCache.get(consumerId);
}

async function processPendingAgreements(client, configuration, selfcareApiKey, report, tenantCache) {
    const producerAgreements = await client.getAllProducerPendingAgreements(configuration.producerId);
    const agreements = await client.getAllPendingAgreements(
        configuration.serviceId,
        configuration.producerId
    );
    const agreementsToReview = producerAgreements.filter(
        agreement => agreement.eserviceId !== configuration.serviceId
    );
    report.pendingAgreementsSummary = {
        producerTotal: producerAgreements.length,
        sendTotal: agreements.length,
        toReviewTotal: agreementsToReview.length,
    };
    console.log(`Accordi PENDING complessivi del producer: ${report.pendingAgreementsSummary.producerTotal}`);
    console.log(`Accordi PENDING relativi a SEND: ${report.pendingAgreementsSummary.sendTotal}`);
    console.log(`Accordi PENDING fuori dal SEND ordinario, da verificare manualmente: ${report.pendingAgreementsSummary.toReviewTotal}`);

    const eserviceCache = new Map();
    for (const agreement of agreementsToReview) {
        let tenant;
        let eservice;
        let metadataError;
        try {
            tenant = await getTenantCached(client, tenantCache, agreement.consumerId);
            if (!eserviceCache.has(agreement.eserviceId)) {
                eserviceCache.set(agreement.eserviceId, await client.getEService(agreement.eserviceId));
            }
            eservice = eserviceCache.get(agreement.eserviceId);
        } catch (error) {
            metadataError = `metadati non disponibili: ${error.message}`;
        }
        report.agreementsToReview.push({
            id: agreement.id,
            consumerId: agreement.consumerId,
            tenantName: tenant?.name || 'N/D',
            tenantKind: tenant?.kind || 'N/D',
            eserviceId: agreement.eserviceId,
            eserviceName: eservice?.name || 'N/D',
            metadataError,
        });
    }

    for (const agreement of agreements) {
        let tenant;
        try {
            tenant = await getTenantCached(client, tenantCache, agreement.consumerId);
            if (!tenant?.externalId) {
                throw new Error('tenant data not available');
            }

            console.log(`Selfcare lookup externalId origin=${tenant.externalId.origin}, value=${tenant.externalId.value}`);
            let institution;
            try {
                institution = await getSelfcareInstitution(
                    tenant.externalId.origin,
                    tenant.externalId.value,
                    selfcareApiKey,
                    tenant.name
                );
            } catch (error) {
                if (!isMissingSelfcareUnit(tenant, error)) {
                    throw error;
                }
                const apexInstitution = await resolveApexInstitution(tenant);
                console.log(
                    `Resolved IPA UO ${tenant.externalId.value} to apex institution ` +
                    `${apexInstitution.description} [${apexInstitution.taxCode}]`
                );
                institution = await getSelfcareInstitutionForUnit(
                    apexInstitution.taxCode,
                    tenant.externalId.value,
                    selfcareApiKey
                );
            }
            if (!checkOnboarding(institution, ['prod-pn'])) {
                throw new Error('required prod-pn onboarding is not ACTIVE');
            }

            const institutionLabel = `${institution.id} - ${institution.description} [${institution.taxCode}]`;
            if (!configuration.dryRun) {
                await client.approveAgreement(agreement.id);
            } else {
                console.log(`[DRY-RUN] Accordo ${agreement.id} sarebbe approvato`);
            }
            report.agreementsActivated.push({
                id: agreement.id,
                consumerId: agreement.consumerId,
                tenantName: tenant?.name || 'N/D',
                tenantKind: tenant?.kind || 'N/D',
                institution: institutionLabel,
            });
        } catch (error) {
            console.warn(`Skip agreement ${agreement.id}: ${error.message}`);
            report.agreementsNotActivated.push({
                id: agreement.id,
                consumerId: agreement.consumerId,
                tenantName: tenant?.name || 'N/D',
                tenantKind: tenant?.kind || 'N/D',
                reason: error.message,
            });
        }
    }
}

async function processWaitingPurposes(client, configuration, report, tenantCache) {
    const purposes = await client.getAllWaitingPurposes(configuration.serviceId);
    console.log(`Recuperate ${purposes.length} finalita in attesa.`);

    for (const purpose of purposes) {
        let tenant;
        let metadataError;
        if (purpose.consumerId) {
            try {
                tenant = await getTenantCached(client, tenantCache, purpose.consumerId);
            } catch (error) {
                metadataError = `metadati tenant non disponibili: ${error.message}`;
            }
        } else {
            metadataError = 'consumerId non disponibile nella finalita';
        }

        try {
            if (!checkPurpose(purpose, configuration.maxDailyCalls)) {
                throw new Error(`dailyCalls supera il massimo ${configuration.maxDailyCalls}`);
            }

            if (!configuration.dryRun) {
                await client.approvePurpose(purpose.id);
            } else {
                console.log(`[DRY-RUN] Finalita ${purpose.id} sarebbe approvata`);
            }
            report.purposesActivated.push({
                id: purpose.id,
                consumerId: purpose.consumerId,
                tenantName: tenant?.name || 'N/D',
                tenantKind: tenant?.kind || 'N/D',
                title: purpose.title,
                description: purpose.description,
                metadataError,
            });
        } catch (error) {
            console.warn(`Skip purpose ${purpose.id}: ${error.message}`);
            report.purposesNotActivated.push({
                id: purpose.id,
                consumerId: purpose.consumerId,
                tenantName: tenant?.name || 'N/D',
                tenantKind: tenant?.kind || 'N/D',
                title: purpose.title,
                reason: error.message,
                metadataError,
            });
        }
    }
}

async function executeFruizioniFinalita({ dryRun = false } = {}) {
    const configuration = getConfiguration(dryRun);
    console.log(`ENV: ${configuration.env}`);
    console.log(`PDND Core API: https://api.${configuration.baseUrl}/v3`);
    console.log(`DRY_RUN: ${configuration.dryRun}`);

    const privateKey = await getPrivateKey();
    const dpopPrivateKey = await generateDpopPrivateKey();
    console.log('Chiave DPoP effimera generata per questa esecuzione.');
    const selfcareApiKey = await getSelfcareApiKey();
    const audience = `auth.${configuration.baseUrl}/client-assertion`;
    const assertion = await generateAssertionJwt(
        configuration.kid,
        configuration.issuer,
        audience,
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
    const report = createExecutionReport();
    const tenantCache = new Map();

    try {
        await processPendingAgreements(client, configuration, selfcareApiKey, report, tenantCache);
    } catch (error) {
        console.error(`Impossibile recuperare o processare gli accordi pendenti: ${error.message}`);
    }

    try {
        await processWaitingPurposes(client, configuration, report, tenantCache);
    } catch (error) {
        console.error(`Impossibile recuperare o processare le finalita in attesa: ${error.message}`);
    } finally {
        printExecutionReport(report, configuration.dryRun);
    }

    return report;
}

export async function runFruizioniFinalita(options = {}) {
    const startedAt = Date.now();
    try {
        const report = await executeFruizioniFinalita(options);
        return {
            ...report,
            durationMs: Date.now() - startedAt,
        };
    } finally {
        const durationMs = Date.now() - startedAt;
        console.log(`Durata totale fruizioni-finalita: ${formatDuration(durationMs)}`);
    }
}
