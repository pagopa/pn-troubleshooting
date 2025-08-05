import { generateAssertionJwt } from './lib/generateAssertion.js';
import { getPrivateKey, getSelfcareApiKey } from './lib/secrets.js';
import { getVoucher } from './lib/getVoucher.js'
import { getAllPendingAgreements, getTenant, approveAgreement, getAllWaitingPurposes, approvePurpose } from './lib/pdnd-interop.js'
import { getSelfcareInstitution } from './lib/self-care.js'
import axios from 'axios';

// Helper function that handles everything (including errors)
async function fetchPosts() {
    try {
        const url = 'https://jsonplaceholder.typicode.com/posts';
        const response = await axios.get(url);

        const posts = response.data;

        // Loop through posts and extract desired data
        const results = posts.map(post => ({
            id: post.id,
            title: post.title,
        }));

        return {
            success: true,
            data: results,
        };

    } catch (error) {
        console.error('Error fetching posts:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Checks if every product in a given list is present and active in an institution's onboarding status.
 *
 * @param {object} institution The institution object. It is expected to have an 'onboarding' array.
 * @param {Array<object>} institution.onboarding An array of onboarding status objects. Each object should have a 'product_id' and a 'status'.
 * @param {Array<string>} products An array of product IDs to be checked.
 * @returns {boolean} Returns true if every product in the 'products' array has an 'ACTIVE' status in the institution's onboarding data. Returns false otherwise.
 */
const checkOnboarding = (institution, products) => {
    // Ensure the institution object and its onboarding array exist and are valid.
    if (!institution || !institution.onboarding || !Array.isArray(institution.onboarding)) {
        console.error("Invalid institution object provided. Missing or invalid 'onboarding' array.");
        return false;
    }

    // Use the 'every' method to check if a condition is true for all elements in the 'products' array.
    // The function will return 'false' immediately if any product fails the check.
    return products.every(productToCheck => {
        // For each product ID in the 'products' array, use 'some' to find if there is a corresponding
        // entry in the institution's 'onboarding' array that has the same product_id AND a status of 'ACTIVE'.
        return institution.onboarding.some(onboardingStatus => {
            return onboardingStatus.productId === productToCheck && onboardingStatus.status === 'ACTIVE';
        });
    });
};

const checkPurposes = (purpose, maxDailyCalls) => {
    // Ensure the institution object and its onboarding array exist and are valid.
    if ( !purpose || !purpose.waitingForApprovalVersion) {
        console.error("Invalid purpose object provided. Missing or invalid 'waitingForApprovalVersion'.");
        return false;
    }
    return purpose.waitingForApprovalVersion.dailyCalls <= maxDailyCalls
};

async function approvePendingAgreements(baseUrl, voucher, serviceId, producerId) {
    const pendingAgreements = await getAllPendingAgreements(baseUrl, voucher, serviceId, producerId);
    if (pendingAgreements) {
        console.log(`Recuperati ${pendingAgreements.length} accordi pendenti totali.`);

        // --- IL LOOP ---
        console.log("\nProcesso ogni accordo:");
        for (const agreement of pendingAgreements) {
            console.log("---");
            console.log(`Accordo ID: ${agreement.id}`);
            console.log(`Consumer ID: ${agreement.consumerId}`);
            const tenant = await getTenant(baseUrl, voucher, agreement.consumerId);
            const institution = await getSelfcareInstitution(tenant.externalId.origin, tenant.externalId.value, await getSelfcareApiKey());
            console.log(`institution: ${institution.id} - ${institution.description} [${institution.taxCode}]`);
            const onboardingStatus = checkOnboarding(institution, ["prod-pn", "prod-interop"])
            console.log(`Onboarding status for institution: ${onboardingStatus}`);
            if (onboardingStatus) {
                const approveResult = await approveAgreement(baseUrl, voucher, agreement.id);
                console.log(`Onboarding ${institution.id} - ${institution.description} [${institution.taxCode}] approveResult: ${approveResult}`);
            }

        }
        console.log("---");
        console.log("\nElaborazione di tutti gli accordi completata.");

    } else {
        console.log("Impossibile recuperare gli accordi pendenti.");
    }
}

async function activateWaitingPurposes(baseUrl, voucher, serviceId, maxDailyCalls) {
    const waitingPurposes = await getAllWaitingPurposes(baseUrl, voucher, serviceId);
    if (waitingPurposes) {
        console.log(`Recuperati ${waitingPurposes.length} accordi pendenti totali.`);

        // --- IL LOOP ---
        console.log("\nProcesso ogni accordo:");
        for (const purpose of waitingPurposes) {
            console.log(`Finalità ID: ${purpose.id}`);
            const purposesCheckStatus = checkPurposes(purpose, maxDailyCalls)
            console.log(`purposesCheckStatus: ${purposesCheckStatus}`);
            if (purposesCheckStatus) {
                const approveResult = await approvePurpose(baseUrl, voucher, purpose.id);
                console.log(`Finalità ${purpose.id} - ${purpose.description} [${purpose.title}] dailyCalls supera il massimo ${maxDailyCalls}`);
            } 

        }
        console.log("\nElaborazione di tutte le finalità completata.");

    } else {
        console.log("Impossibile recuperare finalità in attesa.");
    }
}

// Lambda handler
const eventHandler = async (event) => {
    // Read environment variable
    const env = process.env.ENV || 'Environment variable not set';
    let issuer, kid, baseUrl, serviceId, producerId;
    switch (env) {
        case 'prod':
            baseUrl = 'interop.pagopa.it';
            serviceId = 'cfc8a94d-001a-4ab6-bb5c-2509b2a68af1';
            issuer = 'f9b605c5-9f03-49f0-aa85-0b134da8a301';
            producerId = '4a4149af-172e-4950-9cc8-63ccc9a6d865';
            kid = 'QVQjuMOI-Le3nMA7B3a9BwJSw_BgqsFYHipkn-ZiXTw'
            console.log('ENV variable :', env);
            break;
        case 'uat':
            baseUrl = 'uat.interop.pagopa.it';
            serviceId = '51799439-8575-48d4-8e95-906926ab8e47';
            issuer = 'abb90dee-56fa-4fb0-8875-e8f6b7ade4cb';
            producerId = '84871fd4-2fd7-46ab-9d22-f6b452f4b3c5';
            kid = '3jn5y7WHAyHYBogmPzZgyXlZlfmthzm9NgJFiMfaeU4'
            console.log('ENV variable :', env);
            break;
        default:
            console.error('ENV variable error :', env);
            process.exit(1);  // Exit with error code 1
    }
    const audience = 'auth.' + baseUrl + '/client-assertion';
    const privateKey = await getPrivateKey(env);
    const maxDailyCalls = process.env.MAX_DAILY_CALLS || 20000;
    const assertion = await generateAssertionJwt(kid, issuer, audience, privateKey);
    const voucher = await getVoucher(baseUrl, issuer, assertion);
    
    await approvePendingAgreements(baseUrl, voucher, serviceId, producerId);
    await activateWaitingPurposes(baseUrl, voucher, serviceId, maxDailyCalls);
}


export { eventHandler };