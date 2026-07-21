import { getAccessToken } from '../../shared/auth.js';
import { generateDpopPrivateKey } from '../../shared/dpop.js';
import { generateAssertionJwt } from '../../shared/generate-assertion.js';
import { PdndCoreV3Client } from '../../shared/pdnd-core-v3.js';
import { getPrivateKey, getSelfcareApiKey } from '../../shared/secrets.js';
import { getSelfcareInstitution } from '../../shared/self-care.js';
import { formatDuration } from '../../shared/time.js';

const ENVIRONMENTS = {
    prod: {
        baseUrl: 'interop.pagopa.it',
        serviceId: 'cfc8a94d-001a-4ab6-bb5c-2509b2a68af1',
        issuer: '0203fdcf-644d-40d3-8b0e-f780bbf4bcc1',
        producerId: '4a4149af-172e-4950-9cc8-63ccc9a6d865',
        kid: 'MBZ2A_albOEL9j5I4AzyVsFVPVPvaLKpTYRXAOXon6o',
    },
    uat: {
        baseUrl: 'uat.interop.pagopa.it',
        serviceId: '51799439-8575-48d4-8e95-906926ab8e47',
        issuer: 'abb90dee-56fa-4fb0-8875-e8f6b7ade4cb',
        producerId: '84871fd4-2fd7-46ab-9d22-f6b452f4b3c5',
        kid: '3jn5y7WHAyHYBogmPzZgyXlZlfmthzm9NgJFiMfaeU4',
    },
};

function getConfiguration(dryRun) {
    const env = process.env.ENV;
    if (!ENVIRONMENTS[env]) {
        throw new Error(`ENV must be one of: ${Object.keys(ENVIRONMENTS).join(', ')}`);
    }

    return {
        env,
        baseUrl: process.env.BASE_URL || ENVIRONMENTS[env].baseUrl,
        serviceId: process.env.SERVICE_ID || ENVIRONMENTS[env].serviceId,
        issuer: process.env.ISSUER || ENVIRONMENTS[env].issuer,
        producerId: process.env.PRODUCER_ID || ENVIRONMENTS[env].producerId,
        kid: process.env.KID || ENVIRONMENTS[env].kid,
        maxDailyCalls: Number(process.env.MAX_DAILY_CALLS || 30000),
        dryRun,
    };
}

function checkOnboarding(institution, products) {
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
        item => `${item.id} | consumerId=${item.consumerId} | tenant=${item.tenantName} ` +
            `| tenantKind=${item.tenantKind} | eService=${item.eserviceName} [${item.eserviceId}]` +
            (item.metadataError ? ` | nota=${item.metadataError}` : ''));
    printItems('FRUIZIONI ATTIVATE', report.agreementsActivated,
        item => `${item.id} | consumerId=${item.consumerId} | institution=${item.institution}`);
    printItems('FINALITA ATTIVATE', report.purposesActivated,
        item => `${item.id} | title=${item.title} | description=${item.description}`);
    printItems('FRUIZIONI NON ATTIVATE', report.agreementsNotActivated,
        item => `${item.id} | consumerId=${item.consumerId} | motivo=${item.reason}`);
    printItems('FINALITA NON ATTIVATE', report.purposesNotActivated,
        item => `${item.id} | title=${item.title} | motivo=${item.reason}`);
    console.log('\n================================================================');
}

async function processPendingAgreements(client, configuration, selfcareApiKey, report) {
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
            tenant = await client.getTenant(agreement.consumerId);
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
        try {
            const tenant = await client.getTenant(agreement.consumerId);
            if (!tenant?.externalId) {
                throw new Error('tenant data not available');
            }

            console.log(`Selfcare lookup externalId origin=${tenant.externalId.origin}, value=${tenant.externalId.value}`);
            const institution = await getSelfcareInstitution(
                tenant.externalId.origin,
                tenant.externalId.value,
                selfcareApiKey,
                tenant.name
            );
            if (!checkOnboarding(institution, ['prod-pn', 'prod-interop'])) {
                throw new Error('required onboarding products are not ACTIVE');
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
                institution: institutionLabel,
            });
        } catch (error) {
            console.warn(`Skip agreement ${agreement.id}: ${error.message}`);
            report.agreementsNotActivated.push({
                id: agreement.id,
                consumerId: agreement.consumerId,
                reason: error.message,
            });
        }
    }
}

async function processWaitingPurposes(client, configuration, report) {
    const purposes = await client.getAllWaitingPurposes(configuration.serviceId);
    console.log(`Recuperate ${purposes.length} finalita in attesa.`);

    for (const purpose of purposes) {
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
                title: purpose.title,
                description: purpose.description,
            });
        } catch (error) {
            console.warn(`Skip purpose ${purpose.id}: ${error.message}`);
            report.purposesNotActivated.push({
                id: purpose.id,
                title: purpose.title,
                reason: error.message,
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

    try {
        await processPendingAgreements(client, configuration, selfcareApiKey, report);
    } catch (error) {
        console.error(`Impossibile recuperare o processare gli accordi pendenti: ${error.message}`);
    }

    try {
        await processWaitingPurposes(client, configuration, report);
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
