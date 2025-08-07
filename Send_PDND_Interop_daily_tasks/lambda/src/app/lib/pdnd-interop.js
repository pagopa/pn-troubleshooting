// Make sure you're using Node.js v18 or newer for built-in fetch
import fetch from 'node-fetch';

/**
 * Recupera una singola pagina di accordi pendenti.
 * @param {string} baseUrl - L'URL base dell'API.
 * @param {string} voucher - Il token di autorizzazione.
 * @param {string} serviceId - L'ID del servizio.
 * @param {string} producerId - L'ID del produttore.
 * @param {number} offset - L'offset per la paginazione.
 * @param {number} limit - Il numero massimo di risultati per pagina.
 * @returns {Promise<object | null>} I dati della risposta o null in caso di errore.
 */
export async function getPendingAgreements(baseUrl, voucher, serviceId, producerId, offset, limit = 50) {
    const params = new URLSearchParams({
        states: 'PENDING',
        producerIds: producerId,
        consumerIds: '', 
        eserviceIds: serviceId,
        offset: offset.toString(), 
        limit: limit.toString()
    });

    const url = `https://api.${baseUrl}/v2/agreements?${params.toString()}`;
    console.log('Request URL:', url); 
    console.log('voucher:', voucher); 
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${voucher}`,
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`getPendingAgreements HTTP error ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        console.log('Pending Agreements Data:', data); 
        return data; 

    } catch (err) {
        console.error('PendingAgreements failed:', err.message);
        return null; // Restituisce null per indicare un fallimento
    }
}

/**
 * Recupera tutti gli accordi pendenti iterando sulla paginazione.
 * @param {string} baseUrl - L'URL base dell'API.
 * @param {string} voucher - Il token di autorizzazione.
 * @param {string} serviceId - L'ID del servizio.
 * @param {string} producerId - L'ID del produttore.
 * @param {number} pageSize - Il numero di risultati da recuperare per ogni richiesta (default: 50).
 * @returns {Promise<Array | null>} Un array di tutti gli accordi pendenti o null in caso di errore.
 */
export async function getAllPendingAgreements(baseUrl, voucher, serviceId, producerId, pageSize = 50) {
    let allAgreements = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const data = await getPendingAgreements(baseUrl, voucher, serviceId, producerId, offset, pageSize);

        if (data && Array.isArray(data.results)) { // Assumiamo che la risposta abbia un campo 'results' che è un array
            allAgreements = allAgreements.concat(data.results);
            
            // La logica per 'hasMore' dipende dall'API. 
            // Spesso le API restituiscono il numero totale di elementi o un booleano 'hasNextPage'.
            // Se 'totalCount' è disponibile:
            if (data.totalCount !== undefined) { 
                hasMore = allAgreements.length < data.totalCount;
            } else {
                // Se 'totalCount' non è disponibile, assumiamo che non ci siano più dati 
                // se il numero di risultati restituiti è inferiore al limite richiesto.
                hasMore = data.results.length === pageSize;
            }
            offset += pageSize;
        } else {
            console.warn("Nessun dato o risultati validi dalla risposta dell'API. Interruzione della paginazione.");
            hasMore = false; // Interrompi il loop in caso di risposta non valida
            if (data === null) {
                return null; // Restituisce null se una singola chiamata ha fallito
            }
        }
    }
    return allAgreements;
}

/**
 * Recupera una singola pagina di accordi pendenti.
 * @param {string} baseUrl - L'URL base dell'API.
 * @param {string} voucher - Il token di autorizzazione.
 * @param {string} tenantId - L'ID del servizio.
 * @returns {Promise<object | null>} I dati della risposta o null in caso di errore.
 */
export async function getTenant(baseUrl, voucher, tenantId) {
    const url = `https://api.${baseUrl}/v2/tenants/${tenantId}`;
    console.log('Request URL:', url); 
    console.log('voucher:', voucher); 
     try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${voucher}`,
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`getTenant HTTP error ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        console.log('Tenant Data:', data); 
        return data; 

    } catch (err) {
        console.error('getTenant failed:', err.message);
        return null; // Restituisce null per indicare un fallimento
    }
}

export async function approveAgreement(baseUrl, voucher, agreementId) {
 const url = `https://api.${baseUrl}/v2/agreements/${agreementId}/approve`;
    console.log('Request URL:', url); 
    //console.log('voucher:', voucher); 
     try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${voucher}`,
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`approveAgreement HTTP error ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        console.log('approveAgreement Data:', data); 
        return data; 

    } catch (err) {
        console.error('approveAgreement failed:', err.message);
        return null; // Restituisce null per indicare un fallimento
    }    
}

/**
 * Recupera una singola pagina di finalità in attesa.
 * @param {string} baseUrl - L'URL base dell'API.
 * @param {string} voucher - Il token di autorizzazione.
 * @param {string} serviceId - L'ID del servizio.
 * @param {string} producerId - L'ID del produttore.
 * @param {number} offset - L'offset per la paginazione.
 * @param {number} limit - Il numero massimo di risultati per pagina.
 * @returns {Promise<object | null>} I dati della risposta o null in caso di errore.
 */
export async function getWaitingPurposes(baseUrl, voucher, serviceId, offset, limit = 50) {
    const params = new URLSearchParams({
        states: 'WAITING_FOR_APPROVAL',
        eserviceIds: serviceId,
        offset: offset.toString(), 
        limit: limit.toString()
    });

    const url = `https://api.${baseUrl}/v2/purposes?${params.toString()}`;
    console.log('Request URL:', url); 
    console.log('voucher:', voucher); 
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${voucher}`,
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`getWaitingPurposes HTTP error ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        console.log('Pending Purposes Data:', data); 
        return data; 

    } catch (err) {
        console.error('WaitingPurposes failed:', err.message);
        return null; // Restituisce null per indicare un fallimento
    }
}

/**
 * Recupera tutti gli accordi pendenti iterando sulla paginazione.
 * @param {string} baseUrl - L'URL base dell'API.
 * @param {string} voucher - Il token di autorizzazione.
 * @param {string} serviceId - L'ID del servizio.
 * @param {string} producerId - L'ID del produttore.
 * @param {number} pageSize - Il numero di risultati da recuperare per ogni richiesta (default: 50).
 * @returns {Promise<Array | null>} Un array di tutti gli accordi pendenti o null in caso di errore.
 */
export async function getAllWaitingPurposes(baseUrl, voucher, serviceId, pageSize = 50) {
    let allPurposes = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const data = await getWaitingPurposes(baseUrl, voucher, serviceId, offset, pageSize);

        if (data && Array.isArray(data.results)) { // Assumiamo che la risposta abbia un campo 'results' che è un array
            allPurposes = allPurposes.concat(data.results);
            
            // La logica per 'hasMore' dipende dall'API. 
            // Spesso le API restituiscono il numero totale di elementi o un booleano 'hasNextPage'.
            // Se 'totalCount' è disponibile:
            if (data.totalCount !== undefined) { 
                hasMore = allPurposes.length < data.totalCount;
            } else {
                // Se 'totalCount' non è disponibile, assumiamo che non ci siano più dati 
                // se il numero di risultati restituiti è inferiore al limite richiesto.
                hasMore = data.results.length === pageSize;
            }
            offset += pageSize;
        } else {
            console.warn("Nessun dato o risultati validi dalla risposta dell'API. Interruzione della paginazione.");
            hasMore = false; // Interrompi il loop in caso di risposta non valida
            if (data === null) {
                return null; // Restituisce null se una singola chiamata ha fallito
            }
        }
    }
    return allPurposes;
}

export async function approvePurpose(baseUrl, voucher, purposeId) {
 const url = `https://api.${baseUrl}/v2/purposes/${purposeId}/approve`;
    console.log('Request URL:', url); 
    //console.log('voucher:', voucher); 
     try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${voucher}`,
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`approvePurpose HTTP error ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        console.log('approvePurpose Data:', data); 
        return data; 

    } catch (err) {
        console.error('approvePurpose failed:', err.message);
        return null; // Restituisce null per indicare un fallimento
    }    
}