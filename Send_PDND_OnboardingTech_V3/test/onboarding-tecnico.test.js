import assert from 'node:assert/strict';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import test from 'node:test';
import {
    buildOnboardingReport,
    createCsv,
    getActivePurposesForConsumers,
    getCandidateTenantIds,
    writeOnboardingReport,
} from '../src/automations/onboarding-tecnico/index.js';
import { getOnboardInstitutions } from '../src/shared/dynamodb.js';

test('technical onboarding report joins enabled PDND keys and active IPA tenants', () => {
    const report = buildOnboardingReport({
        institutions: [
            { id: 'pa-1', description: 'Comune Uno', ipaCode: 'c_a001' },
            { id: 'pa-2', description: 'Comune Due', ipaCode: 'c_a002' },
            { id: 'pa-3', description: 'Comune Tre', ipaCode: 'c_a003' },
        ],
        apiKeys: [
            { id: 'key-1', paId: 'pa-1', pdnd: true },
            { id: 'key-2', paId: 'pa-2', pdnd: true },
        ],
        purposes: [
            { id: 'purpose-1', consumerId: 'tenant-1' },
            { id: 'purpose-2', consumerId: 'tenant-private' },
        ],
        tenants: [
            { id: 'tenant-1', externalId: { origin: 'IPA', value: 'C_A001' } },
            { id: 'tenant-private', externalId: { origin: 'ANAC', value: '123' } },
        ],
    });

    assert.deepEqual(report.rows, [
        { paId: 'pa-1', paDesc: 'Comune Uno', ipaCode: 'c_a001' },
    ]);
    assert.equal(report.summary.activePurposeTenants, 1);
    assert.equal(report.summary.purposesWithoutTenant, 1);
    assert.equal(report.summary.technicalOnboardingInstitutions, 1);
});

test('CSV output preserves the previous report columns and escapes quotes', () => {
    const csv = createCsv([
        { paId: 'pa-1', paDesc: 'Comune di "Prova"', ipaCode: 'c_a001' },
    ]);

    assert.equal(
        csv,
        '"paId","paDesc","ipaCode"\n"pa-1","Comune di ""Prova""","c_a001"\n'
    );
});

test('Lambda report uses a unique private temporary file', async () => {
    const testDirectory = await mkdtemp(join(tmpdir(), 'onboarding-report-test-'));
    try {
        const reportPath = await writeOnboardingReport('report-content', {
            isLambda: true,
            temporaryDirectory: testDirectory,
        });
        const reportFile = await open(reportPath, 'r');
        try {
            const reportStat = await reportFile.stat();
            assert.ok(reportPath.startsWith(`${testDirectory}${sep}`));
            assert.equal(reportStat.mode & 0o777, 0o600);
            assert.equal(await reportFile.readFile({ encoding: 'utf8' }), 'report-content');
        } finally {
            await reportFile.close();
        }
    } finally {
        await rm(testDirectory, { recursive: true, force: true });
    }
});

test('DynamoDB institution scan follows LastEvaluatedKey pagination', async () => {
    const inputs = [];
    const client = {
        async send(command) {
            inputs.push(command.input);
            if (!command.input.ExclusiveStartKey) {
                return {
                    Items: [{
                        id: { S: 'pa-1' },
                        description: { S: 'Comune Uno' },
                        ipaCode: { S: 'c_a001' },
                    }],
                    LastEvaluatedKey: { id: { S: 'pa-1' } },
                };
            }
            return {
                Items: [{
                    id: { S: 'pa-2' },
                    description: { S: 'Comune Due' },
                    ipaCode: { S: 'c_a002' },
                }],
            };
        },
    };

    const institutions = await getOnboardInstitutions({ client, tableName: 'institutions' });

    assert.equal(inputs.length, 2);
    assert.deepEqual(inputs[1].ExclusiveStartKey, { id: { S: 'pa-1' } });
    assert.deepEqual(institutions.map(institution => institution.id), ['pa-1', 'pa-2']);
});

test('candidate tenants are selected before querying purposes', () => {
    const ids = getCandidateTenantIds({
        institutions: [
            { id: 'pa-enabled', ipaCode: 'c_a001' },
            { id: 'pa-disabled', ipaCode: 'c_a002' },
        ],
        apiKeys: [{ id: 'key-1', paId: 'pa-enabled', pdnd: true }],
        tenants: [
            { id: 'tenant-enabled', externalId: { origin: 'IPA', value: 'C_A001' } },
            { id: 'tenant-disabled', externalId: { origin: 'IPA', value: 'c_a002' } },
        ],
    });

    assert.deepEqual(ids, ['tenant-enabled']);
});

test('purpose lookup splits a batch that exceeds one page', async () => {
    const calls = [];
    const client = {
        async getActivePurposesPage(serviceId, consumerIds) {
            calls.push({ serviceId, consumerIds });
            if (consumerIds.length > 1) {
                return { results: [], pagination: { totalCount: 51 } };
            }
            return {
                results: [{ id: `purpose-${consumerIds[0]}`, consumerId: consumerIds[0] }],
                pagination: { totalCount: 1 },
            };
        },
    };

    const purposes = await getActivePurposesForConsumers(
        client,
        'service-id',
        ['tenant-1', 'tenant-2'],
        25
    );

    assert.equal(calls.length, 3);
    assert.deepEqual(purposes.map(purpose => purpose.id), ['purpose-tenant-1', 'purpose-tenant-2']);
});
