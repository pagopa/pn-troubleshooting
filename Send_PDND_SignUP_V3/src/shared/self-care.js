const SELFCARE_BASE_URL = process.env.SELFCARE_BASE_URL || 'https://api.selfcare.pagopa.it/external/v2';
const SELFCARE_MAX_RETRIES = Number(process.env.SELFCARE_MAX_RETRIES || 5);
const SELFCARE_RETRY_BASE_MS = Number(process.env.SELFCARE_RETRY_BASE_MS || 250);
const SELFCARE_MIN_REQUEST_INTERVAL_MS = Number(process.env.SELFCARE_MIN_REQUEST_INTERVAL_MS || 750);
const institutionCache = new Map();
const institutionIdCache = new Map();
let nextSelfcareRequestAt = 0;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForSelfcareRequestSlot() {
    const now = Date.now();
    const requestAt = Math.max(now, nextSelfcareRequestAt);
    nextSelfcareRequestAt = requestAt + SELFCARE_MIN_REQUEST_INTERVAL_MS;
    if (requestAt > now) {
        await sleep(requestAt - now);
    }
}

function getRetryAfterMs(errorBody) {
    const match = errorBody.match(/RetryAfterMs=(\d+)/);
    return match ? Number(match[1]) : null;
}

function isRetryableSelfcareError(status, errorBody) {
    return status === 429 || status >= 500 && (
        errorBody.includes('RequestRateTooLarge') ||
        errorBody.includes('TooManyRequests') ||
        errorBody.includes('RetryAfterMs=')
    );
}

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function fetchSelfcareJsonWithRetry(url, selfcareApiKey) {
    console.log('Request URL:', url);
    let response;
    let errorBody = '';

    for (let attempt = 0; attempt <= SELFCARE_MAX_RETRIES; attempt++) {
        await waitForSelfcareRequestSlot();
        response = await fetch(url, {
            headers: {
                Accept: 'application/json',
                'Ocp-Apim-Subscription-Key': selfcareApiKey,
            },
        });
        if (response.ok) {
            return response.json();
        }

        errorBody = await response.text();
        if (!isRetryableSelfcareError(response.status, errorBody) || attempt === SELFCARE_MAX_RETRIES) {
            throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const retryAfterMs = getRetryAfterMs(errorBody);
        const baseWaitMs = retryAfterMs
            ? Math.ceil(retryAfterMs * 1.25)
            : SELFCARE_RETRY_BASE_MS * 2 ** attempt;
        const waitMs = baseWaitMs + Math.floor(Math.random() * 100);
        console.warn(`Selfcare temporary error HTTP ${response.status}, retry ${attempt + 1}/${SELFCARE_MAX_RETRIES} in ${waitMs}ms`);
        await sleep(waitMs);
    }

    throw new Error(`HTTP ${response?.status}: ${errorBody}`);
}

async function getSelfcareInstitutionById(institutionId, selfcareApiKey) {
    const cacheKey = institutionId.toString().toLowerCase();
    if (!institutionIdCache.has(cacheKey)) {
        const request = (async () => {
            const url = `${SELFCARE_BASE_URL}/institutions/${encodeURIComponent(institutionId)}`;
            const data = await fetchSelfcareJsonWithRetry(url, selfcareApiKey);
            if (!data || typeof data !== 'object') {
                throw new Error(`invalid payload for institutionId=${institutionId}`);
            }
            return data;
        })();
        institutionIdCache.set(cacheKey, request);
        request.catch(() => institutionIdCache.delete(cacheKey));
    }
    return institutionIdCache.get(cacheKey);
}

async function getSelfcareInstitutions(params, selfcareApiKey) {
    const data = await fetchSelfcareJsonWithRetry(`${SELFCARE_BASE_URL}/institutions?${params}`, selfcareApiKey);
    if (!data || !Array.isArray(data.institutions)) {
        throw new Error('invalid payload: missing institutions array');
    }
    return data.institutions;
}

function isExactInstitution(institution, origin, originId) {
    const normalizedOrigin = origin.toUpperCase();
    const normalizedOriginId = originId.toUpperCase();
    return institution.origin?.toUpperCase() === normalizedOrigin &&
        [institution.originId, institution.subunitCode]
            .filter(Boolean)
            .some(value => value.toUpperCase() === normalizedOriginId);
}

function selectInstitution(institutions, origin, originId) {
    const exactMatches = institutions.filter(institution => isExactInstitution(institution, origin, originId));
    if (exactMatches.length === 1) {
        return exactMatches[0];
    }
    if (exactMatches.length > 1) {
        throw new Error(`more than one institution returned for origin=${origin}, originId=${originId}`);
    }
    return institutions.length === 1 ? institutions[0] : null;
}

async function searchSelfcareInstitution(origin, originId, description, selfcareApiKey) {
    const searchTerms = [...new Set([description, originId].filter(Boolean))];
    const inspectedIds = new Set();

    for (const searchText of searchTerms) {
        const params = new URLSearchParams({ searchText, top: '10' });
        const candidates = await fetchSelfcareJsonWithRetry(
            `${SELFCARE_BASE_URL}/search/institutions?${params}`,
            selfcareApiKey
        );
        if (!Array.isArray(candidates)) {
            throw new Error('invalid search payload: expected an array');
        }

        for (const institutionId of candidates.map(candidate => candidate.id).filter(Boolean)) {
            if (inspectedIds.has(institutionId)) {
                continue;
            }
            inspectedIds.add(institutionId);
            const institution = await getSelfcareInstitutionById(institutionId, selfcareApiKey);
            if (isExactInstitution(institution, origin, originId)) {
                return institution;
            }
        }
    }
    return null;
}

async function resolveSelfcareInstitutionId(origin, originId, description, selfcareApiKey) {
    const normalizedOrigin = origin.toUpperCase();
    const values = [...new Set([originId, normalizedOrigin === 'IPA' ? originId.toUpperCase() : originId])];

    for (const value of values) {
        const params = new URLSearchParams({ origin, originId: value });
        const institutions = await getSelfcareInstitutions(params, selfcareApiKey);
        if (institutions.length === 0) {
            continue;
        }
        const institution = selectInstitution(institutions, origin, originId);
        if (institution?.id) {
            return institution.id;
        }
        throw new Error(`unable to identify a single institution for ${params}`);
    }

    if (normalizedOrigin === 'IPA') {
        const institution = await searchSelfcareInstitution(origin, originId, description, selfcareApiKey);
        if (institution?.id) {
            return institution.id;
        }
    }
    throw new Error(`no institutions found for origin=${origin}, originId=${originId}`);
}

export async function getSelfcareInstitution(origin, originId, selfcareApiKey, description) {
    if (!origin || !originId) {
        throw new Error('missing institution origin/originId');
    }

    const cacheKey = `${origin.toUpperCase()}:${originId.toUpperCase()}`;
    if (!institutionCache.has(cacheKey)) {
        const request = isUuid(originId)
            ? getSelfcareInstitutionById(originId, selfcareApiKey)
            : resolveSelfcareInstitutionId(origin, originId, description, selfcareApiKey)
                .then(institutionId => {
                    console.log(`Resolved Selfcare institutionId=${institutionId} for origin=${origin}, originId=${originId}`);
                    return getSelfcareInstitutionById(institutionId, selfcareApiKey);
                });
        institutionCache.set(cacheKey, request);
        request.catch(() => institutionCache.delete(cacheKey));
    }
    return institutionCache.get(cacheKey);
}
