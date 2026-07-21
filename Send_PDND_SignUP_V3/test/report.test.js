import assert from 'node:assert/strict';
import test from 'node:test';
import {
    checkOnboarding,
    formatTenant,
    isMissingSelfcareUnit,
    resolveApexInstitution,
} from '../src/automations/fruizioni-finalita/index.js';
import {
    selectSelfcareUnit,
    SelfcareInstitutionNotFoundError,
} from '../src/shared/self-care.js';

test('report identifies the tenant and its kind', () => {
    assert.equal(
        formatTenant({
            consumerId: 'consumer-id',
            tenantName: 'Comune di Prova',
            tenantKind: 'PA',
        }),
        'consumerId=consumer-id | tenant=Comune di Prova | tenantKind=PA'
    );
});

test('report handles unavailable tenant metadata', () => {
    assert.equal(
        formatTenant({ consumerId: 'consumer-id' }),
        'consumerId=consumer-id | tenant=N/D | tenantKind=N/D'
    );
});

test('missing Selfcare UO triggers the unit-specific lookup path', () => {
    const error = new SelfcareInstitutionNotFoundError('IPA', 'XW54IO');

    assert.equal(isMissingSelfcareUnit({ subUnitType: 'UO' }, error), true);
    assert.equal(isMissingSelfcareUnit({ subUnitType: 'AOO' }, error), false);
    assert.equal(isMissingSelfcareUnit({ subUnitType: 'UO' }, new Error('HTTP 500')), false);
});

test('active prod-pn onboarding satisfies the agreement requirement', () => {
    assert.equal(checkOnboarding({
        onboarding: [
            { productId: 'prod-pn', status: 'ACTIVE' },
        ],
    }, ['prod-pn']), true);
});

test('Selfcare UO is selected by subunit code', () => {
    const institution = selectSelfcareUnit([{
        id: 'institution-id',
        originId: 'XW54IO',
        subunitCode: 'XW54IO',
        description: 'POLIZIA LOCALE',
    }], 'xw54io');

    assert.equal(institution.id, 'institution-id');
    assert.equal(institution.description, 'POLIZIA LOCALE');
});

test('SELC UO uses its external ID as apex tax code', async () => {
    assert.deepEqual(await resolveApexInstitution({
        name: 'AREA SRL',
        externalId: { origin: 'SELC', value: '02971560046' },
    }), {
        taxCode: '02971560046',
        description: 'AREA SRL',
    });
});
