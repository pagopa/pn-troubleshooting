// Make sure you're using Node.js v18 or newer for built-in fetch
import fetch from 'node-fetch';

export async function getSelfcareInstitution(origin, originId, selfcareApiKey) {
    const params = new URLSearchParams({
        origin: origin.toString(),
        originId: originId.toString(),
    });

    const url = `https://api.selfcare.pagopa.it/external/support/v1/institutions?${params.toString()}`;
    console.log('Request URL:', url); // Più descrittivo di 'url: ' 
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Ocp-Apim-Subscription-Key': `${selfcareApiKey}`,
            }
        });

        if (!response.ok) {
            // Cattura e logga l'errore con più dettagli per il debugging
            const errorBody = await response.text();
            throw new Error(`getSelfcareInstitution HTTP error ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        console.log('Institution:', data); // Più descrittivo
        if (data.institutions.length > 1) {
            throw new Error(`getSelfcareInstitution return more institution ${data.length} for ${origin}, ${originId}`);
        }
        return data.institutions[0]; // Aggiungere loop

    } catch (err) {
        console.error('getSelfcareInstitution failed:', err.message);
    }
}
