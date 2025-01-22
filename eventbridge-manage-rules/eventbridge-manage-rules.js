// --- Required Dependencies ---
import { AwsClientsWrapper } from "pn-common";                          // AWS services wrapper for authentication and operations
import { parseArgs } from 'util';                                       // Node.js built-in argument parser
const VALID_ENVIRONMENTS = ['dev', 'test', 'hotfix'];                   // Allowed deployment environments

/**
 * Validates command line arguments and displays usage information
 * @returns {Object} Parsed and validated arguments
 * @throws {Error} If required arguments are missing or invalid
 */
function validateArgs() {
    const usage = `
Usage: node eventbridge-manage-rules.js [--list|-l] [--search|-s <searchString>] --envName|-e <environment> --account|-a <account> --ruleName|-r <ruleName> [--enable|-n | --disable|-d]

Description:
    Lists, searches, enables, or disables EventBridge rules on the default event bus.

Parameters:
    --list, -l      Optional. List all rules in the specified account/environment
    --search, -s    Optional. Search for rules by name prefix
    --envName, -e   Required. Environment where the rule is defined (dev|test)
    --account, -a   Required. AWS account where the rule is defined (core|confinfo)
    --ruleName, -r  Required for enable/disable. Name of the EventBridge rule to manage
    --enable, -n    Enable the specified rule
    --disable, -d   Disable the specified rule
    --help, -h      Display this help message

Examples:
    # List all rules
    node eventbridge-manage-rules.js --list --envName dev --account core
    
    # Search for rules
    node eventbridge-manage-rules.js --search "lambda" --envName dev --account core
    
    # Enable a rule
    node eventbridge-manage-rules.js --envName dev --account core --ruleName myRule --enable
    
    # Disable a rule
    node eventbridge-manage-rules.js --envName dev --account core --ruleName myRule --disable`;

    const args = parseArgs({
        options: {
            list: { type: "boolean", short: "l" },
            search: { type: "string", short: "s" },
            envName: { type: "string", short: "e" },
            account: { type: "string", short: "a" },
            ruleName: { type: "string", short: "r" },
            enable: { type: "boolean", short: "n" },
            disable: { type: "boolean", short: "d" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    // Validate environment parameter
    if (!args.values.envName) {
        console.error("Error: Missing required parameter --envName");
        console.log(usage);
        process.exit(1);
    }

    // Validate environment name
    if (!VALID_ENVIRONMENTS.includes(args.values.envName)) {
        console.error(`Error: Parameter --envName must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        console.log(usage);
        process.exit(1);
    }

    // Validate account parameter
    if (!args.values.account) {
        console.error("Error: Missing required parameter --account");
        console.log(usage);
        process.exit(1);
    }

    // Validate account name
    if (!['core', 'confinfo'].includes(args.values.account)) {
        console.error("Error: Parameter --account must be either 'core' or 'confinfo'");
        console.log(usage);
        process.exit(1);
    }

    // Validate rule state management parameters
    if (!args.values.list && !args.values.search) {
        if (!args.values.ruleName) {
            console.error("Error: --ruleName is required when not using --list or --search");
            console.log(usage);
            process.exit(1);
        }
        
        // Validate enable/disable parameters
        if (!args.values.enable && !args.values.disable) {
            console.error("Error: Either --enable or --disable must be specified");
            console.log(usage);
            process.exit(1);
        }

        // Ensure enable/disable exclusivity
        if (args.values.enable && args.values.disable) {
            console.error("Error: Cannot specify both --enable and --disable");
            console.log(usage);
            process.exit(1);
        }

        // Validate ruleName format only when provided
        const ruleNamePattern = /^[a-zA-Z0-9-_]+$/;
        if (!ruleNamePattern.test(args.values.ruleName)) {
            console.error("Error: Rule name can only contain letters, numbers, hyphens and underscores");
            console.log(usage);
            process.exit(1);
        }
    }

    return args;
}

/**
 * Tests AWS SSO credentials and provides clear error messages for authentication issues
 * Exits with code 1 if credentials are invalid or expired
 * @param {AwsClientsWrapper} awsClient - AWS client wrapper instance
 * @param {string} clientName - Account name for error reporting
 * @returns {Promise<void>}
 * @throws {Error} For non-credential related errors
 */
async function testSsoCredentials(awsClient, clientName) {
    try {
        awsClient._initSTS();
        await awsClient._getCallerIdentity();
    } catch (error) {
        if (error.name === 'CredentialsProviderError' ||
            error.message?.includes('expired') ||
            error.message?.includes('credentials')) {
            console.error(`\n=== SSO Authentication Error for ${clientName} client ===`);
            console.error('Your SSO session has expired or is invalid.');
            console.error('Please run the following commands:');
            console.error('1. aws sso logout');
            console.error(`2. aws sso login --profile ${awsClient.ssoProfile}`);
            process.exit(1);
        }
        throw error;
    }
}

/**
 * Initializes required AWS service clients (EventBridge and STS)
 * @param {AwsClientsWrapper} awsClient - AWS client wrapper instance
 * @returns {Object} Object containing initialized AWS service clients
 */
async function initializeAwsClients(awsClient) {
    awsClient._initEventBridge();
    awsClient._initSTS();
    return {
        eventBridgeClient: awsClient._eventBridgeClient,
    };
}

/**
 * Formats an EventBridge rule into a human-readable string representation
 * @param {Object} rule - The EventBridge rule object to format
 * @param {string} rule.Name - The name of the rule
 * @param {string} rule.State - The state of the rule (ENABLED/DISABLED)
 * @param {string} [rule.Description] - Optional description of the rule
 * @returns {string} Formatted string containing rule details separated by dashes
 */
function formatRule(rule) {
    return `
Name: ${rule.Name}
State: ${rule.State}${rule.Description ? `\nDescription: ${rule.Description}` : ''}
------------------`;
}

/**
 * Lists all EventBridge rules in the specified account and environment
 * @param {AwsClientsWrapper} awsClient - AWS client wrapper instance
 * @returns {Promise<void>}
 */
async function listRules(awsClient) {
    try {
        const rules = await awsClient._listRules();
        if (!rules?.length) {
            console.log('No rules found in the default event bus');
            return;
        }

        console.log('\nEventBridge Rules:');
        console.log('==================');
        rules.forEach(rule => console.log(formatRule(rule)));
    } catch (error) {
        console.error('Error listing rules:', error);
        throw error;
    }
}

/**
 * Searches for EventBridge rules matching the search string
 * @param {AwsClientsWrapper} awsClient - AWS client wrapper instance
 * @param {string} searchString - String to search in rule names and descriptions
 * @returns {Promise<void>}
 */
async function searchRules(awsClient, searchString) {
    try {
        const rules = await awsClient._searchRules(searchString);
        if (!rules || rules.length === 0) {
            console.log(`No rules found matching "${searchString}"`);
            return;
        }

        console.log(`\nEventBridge Rules matching "${searchString}":`);
        console.log('==========================================');
        rules.forEach(rule => {
            console.log(`\nName: ${rule.Name}`);
            console.log(`State: ${rule.State}`);
            if (rule.Description) {
                console.log(`Description: ${rule.Description}`);
            }
            console.log('------------------');
        });
    } catch (error) {
        console.error('Error searching rules:', error);
        throw error;
    }
}

/**
 * Changes the state (enabled/disabled) of an EventBridge rule
 * Provides feedback on operation success or failure
 * @param {AwsClientsWrapper} client - AWS client wrapper instance
 * @param {string} ruleName - Target EventBridge rule name
 * @param {boolean} enable - true to enable, false to disable
 * @returns {Promise<void>}
 * @throws {Error} If rule state change fails
 */
async function manageRuleState(awsClient, ruleName, enable) {
    try {
        await awsClient._setRuleState(ruleName, enable);
        console.log(`Rule ${ruleName} ${enable ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
        console.error(`Error ${enable ? 'enabling' : 'disabling'} rule ${ruleName}:`, error);
        throw error;
    }
}

/**
 * Main execution flow:
 * 1. Validates command line arguments
 * 2. Initializes AWS client for specified account
 * 3. Verifies SSO credentials
 * 4. Changes rule state
 * Exits with code 1 on errors
 */
async function main() {
    const args = validateArgs();
    const { envName, account, ruleName, enable, disable } = args.values;

    // Only initialize the client for the specified account
    const awsClient = new AwsClientsWrapper(account, envName);

    // Test SSO credentials
    await testSsoCredentials(awsClient, account);

    // Initialize AWS client
    await initializeAwsClients(awsClient);

    // Search rules based on name prefix
    if (args.values.search) {
        return await searchRules(awsClient, args.values.search);
    }

    // List all rules
    if (args.values.list) {
        return await listRules(awsClient);
    }

    // Skip rule state management if no rule name is provided
    if (!ruleName) {
        return;
    }

    // Manage target rule state
    try {
        await manageRuleState(awsClient, ruleName, Boolean(enable));
    } catch (error) {
        if (error.message?.includes('Rule not found')) {
            console.error(`Rule ${ruleName} not found in ${account} account`);
            process.exit(1);
        }
        throw error;
    }
}

// Start execution with error handling
main().catch(console.error);