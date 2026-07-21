import { generateDpopProof } from './dpop.js';

function appendQueryValue(params, name, value) {
    if (value === undefined || value === null || value === '') {
        return;
    }
    params.set(name, Array.isArray(value) ? value.join(',') : value.toString());
}

function formatRequestUrlForLog(url) {
    const logUrl = new URL(url);
    const consumerIds = logUrl.searchParams.get('consumerIds');
    if (consumerIds) {
        logUrl.searchParams.set('consumerIds', `[${consumerIds.split(',').length} values]`);
    }
    return logUrl.toString();
}

export class PdndCoreV3Client {
    constructor({
        baseUrl,
        accessToken,
        dpopPrivateKey,
        fetchImpl = fetch,
        minRequestIntervalMs = Number(process.env.PDND_MIN_REQUEST_INTERVAL_MS || 750),
    }) {
        this.apiBaseUrl = `https://api.${baseUrl}/v3`;
        this.accessToken = accessToken;
        this.dpopPrivateKey = dpopPrivateKey;
        this.fetchImpl = fetchImpl;
        this.minRequestIntervalMs = minRequestIntervalMs;
        this.nextRequestAt = 0;
        this.dpopNonce = undefined;
    }

    async waitForRequestSlot() {
        const now = Date.now();
        const requestAt = Math.max(now, this.nextRequestAt);
        this.nextRequestAt = requestAt + this.minRequestIntervalMs;

        if (requestAt > now) {
            await new Promise(resolve => setTimeout(resolve, requestAt - now));
        }
    }

    async request(method, path, { query, body } = {}) {
        const url = new URL(`${this.apiBaseUrl}${path}`);
        for (const [name, value] of Object.entries(query || {})) {
            appendQueryValue(url.searchParams, name, value);
        }

        for (let attempt = 0; attempt < 2; attempt++) {
            await this.waitForRequestSlot();
            const proof = await generateDpopProof(method, url.toString(), this.dpopPrivateKey, {
                accessToken: this.accessToken,
                nonce: this.dpopNonce,
            });
            const headers = {
                Accept: 'application/json',
                Authorization: `DPoP ${this.accessToken}`,
                DPoP: proof,
            };
            const options = { method, headers };
            if (body !== undefined) {
                headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify(body);
            }

            console.log('Request URL:', formatRequestUrlForLog(url));
            const response = await this.fetchImpl(url, options);
            const responseNonce = response.headers.get('dpop-nonce');
            if (!response.ok && responseNonce && responseNonce !== this.dpopNonce && attempt === 0) {
                this.dpopNonce = responseNonce;
                continue;
            }

            if (!response.ok) {
                throw new Error(`${method} ${path} HTTP ${response.status}: ${await response.text()}`);
            }
            if (response.status === 204) {
                return true;
            }

            const text = await response.text();
            return text ? JSON.parse(text) : true;
        }

        throw new Error(`${method} ${path} failed after DPoP nonce challenge`);
    }

    async getAllPendingAgreements(serviceId, producerId, pageSize = 50) {
        return this.getAllPages('/agreements', {
            states: ['PENDING'],
            producerIds: [producerId],
            eserviceIds: [serviceId],
        }, pageSize);
    }

    async getAllProducerPendingAgreements(producerId, pageSize = 50) {
        return this.getAllPages('/agreements', {
            states: ['PENDING'],
            producerIds: [producerId],
        }, pageSize);
    }

    async getTenant(tenantId) {
        return this.request('GET', `/tenants/${encodeURIComponent(tenantId)}`);
    }

    async getEService(eserviceId) {
        return this.request('GET', `/eservices/${encodeURIComponent(eserviceId)}`);
    }

    async approveAgreement(agreementId) {
        return this.request('POST', `/agreements/${encodeURIComponent(agreementId)}/approve`);
    }

    async getAllWaitingPurposes(serviceId, pageSize = 50) {
        return this.getAllPages('/purposes', {
            states: ['WAITING_FOR_APPROVAL'],
            eserviceIds: [serviceId],
        }, pageSize);
    }

    async approvePurpose(purposeId) {
        return this.request('POST', `/purposes/${encodeURIComponent(purposeId)}/approve`);
    }

    async getAllPages(path, filters, pageSize) {
        const results = [];
        let offset = 0;

        while (true) {
            const page = await this.request('GET', path, {
                query: { ...filters, offset, limit: pageSize },
            });
            if (!page || !Array.isArray(page.results) || !page.pagination) {
                throw new Error(`Invalid paginated response from ${path}`);
            }

            results.push(...page.results);
            if (results.length >= page.pagination.totalCount || page.results.length === 0) {
                return results;
            }
            offset += page.pagination.limit;
        }
    }
}
