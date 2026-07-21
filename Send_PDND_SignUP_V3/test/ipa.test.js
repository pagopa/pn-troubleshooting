import assert from 'node:assert/strict';
import test from 'node:test';
import { getIpaUoApexInstitution } from '../src/shared/ipa.js';

function jsonResponse(data) {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

test('IPA UO lookup returns the apex institution', async () => {
    const fetchImpl = async url => {
        if (url.toString().includes('package_show')) {
            return jsonResponse({
                success: true,
                result: { resources: [{ id: 'uo-resource', datastore_active: true }] },
            });
        }
        return jsonResponse({
            success: true,
            result: {
                records: [{
                    Codice_IPA: 'c_a944',
                    Codice_fiscale_ente: '01232710374',
                    Denominazione_ente: 'Comune di Bologna',
                }],
            },
        });
    };

    assert.deepEqual(
        await getIpaUoApexInstitution('XW54IO', { fetchImpl }),
        {
            originId: 'c_a944',
            taxCode: '01232710374',
            description: 'Comune di Bologna',
        }
    );
});
