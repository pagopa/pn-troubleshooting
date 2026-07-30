const IPA_API_BASE_URL = process.env.IPA_API_BASE_URL ||
    'https://indicepa.gov.it/ipa-dati/api/3/action';
const uoCache = new Map();
let uoResourceIdPromise;

async function fetchIpaResult(url, fetchImpl) {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok || data.success !== true) {
        throw new Error(`IPA API HTTP ${response.status}: ${JSON.stringify(data.error || data)}`);
    }
    return data.result;
}

async function getUoResourceId(fetchImpl) {
    if (!uoResourceIdPromise) {
        uoResourceIdPromise = (async () => {
            const url = `${IPA_API_BASE_URL}/package_show?id=unita-organizzative`;
            const dataset = await fetchIpaResult(url, fetchImpl);
            const resource = dataset.resources?.find(item => item.datastore_active === true);
            if (!resource?.id) {
                throw new Error('IPA UO datastore resource not available');
            }
            return resource.id;
        })();
        uoResourceIdPromise.catch(() => {
            uoResourceIdPromise = undefined;
        });
    }
    return uoResourceIdPromise;
}

export async function getIpaUoApexInstitution(subunitCode, { fetchImpl = fetch } = {}) {
    const cacheKey = subunitCode.toUpperCase();
    if (!uoCache.has(cacheKey)) {
        const request = (async () => {
            const resourceId = await getUoResourceId(fetchImpl);
            const url = new URL(`${IPA_API_BASE_URL}/datastore_search`);
            url.searchParams.set('resource_id', resourceId);
            url.searchParams.set('filters', JSON.stringify({ Codice_uni_uo: cacheKey }));
            url.searchParams.set('limit', '2');
            const result = await fetchIpaResult(url, fetchImpl);
            if (result.records?.length !== 1) {
                throw new Error(`unable to identify IPA UO ${subunitCode}`);
            }
            const record = result.records[0];
            if (!record.Codice_IPA || !record.Codice_fiscale_ente) {
                throw new Error(`incomplete IPA data for UO ${subunitCode}`);
            }
            return {
                originId: record.Codice_IPA,
                taxCode: record.Codice_fiscale_ente,
                description: record.Denominazione_ente,
            };
        })();
        uoCache.set(cacheKey, request);
        request.catch(() => uoCache.delete(cacheKey));
    }
    return uoCache.get(cacheKey);
}
