// --- Required Dependencies ---
import { AwsClientsWrapper } from "pn-common";
import { parseArgs } from 'util';

const VALID_ENVIRONMENTS = ['dev', 'test'];
const RULE_NAME_PREFIX = 'pn-cost-saving-'; // Base prefix
const RULE_NAME_SUFFIX = '-StopEcsFunctionSchedule-'; // Suffix after envName

/**
 * Validates command line arguments
 * @returns {Object} Parsed and validated arguments
 */
function validateArgs() {
    const usage = `
Usage: node ecs-manage-autostop.js --envName|-e <environment> [--enable|-n | --disable|-d]

Description:
    Enables or disables the ECS auto-stop rule in both core and confinfo accounts.

Parameters:
    --envName, -e   Required. Environment where the rule is defined (dev|test)
    --enable, -n    Enable the auto-stop rule
    --disable, -d   Disable the auto-stop rule
    --help, -h      Display this help message

Example:
    node ecs-manage-autostop.js --envName dev --enable
    node ecs-manage-autostop.js -e test --disable`;

    const args = parseArgs({
        options: {
            envName: { type: "string", short: "e" },
            enable: { type: "boolean", short: "n" },
            disable: { type: "boolean", short: "d" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }

    if (!args.values.envName) {
        console.error("Error: Missing required parameter --envName");
        console.log(usage);
        process.exit(1);
    }

    if (!VALID_ENVIRONMENTS.includes(args.values.envName)) {
        console.error(`Error: Parameter --envName must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        console.log(usage);
        process.exit(1);
    }

    if (!args.values.enable && !args.values.disable) {
        console.error("Error: Either --enable or --disable must be specified");
        console.log(usage);
        process.exit(1);
    }

    if (args.values.enable && args.values.disable) {
        console.error("Error: Cannot specify both --enable and --disable");
        console.log(usage);
        process.exit(1);
    }

    return args;
}

/**
 * Searches for the ECS rule in a specific account
 * @param {string} envName Environment name (dev/test)
 * @param {string} account Account name (core/confinfo)
 * @returns {Promise<string|null>} Rule name if found, null otherwise
 */
async function findAutoStopRule(envName, account) {
    const awsClient = new AwsClientsWrapper(account, envName);
    await awsClient._initEventBridge();
    
    // Construct the full rule name prefix with the environment name
    const fullPrefix = `${RULE_NAME_PREFIX}${envName}${RULE_NAME_SUFFIX}`;
    const rules = await awsClient._searchRules(fullPrefix);
    
    if (!rules || rules.length === 0) {
        console.log(`No rule found in ${account} account matching prefix ${fullPrefix}`);
        return null;
    }

    if (rules.length > 1) {
        console.warn(`Warning: Multiple rules found in ${account} account matching ${fullPrefix}`);
    }

    return rules[0].Name;
}

/**
 * Main execution flow
 */
async function main() {
    const args = validateArgs();
    const { envName, enable } = args.values;

    // Search in both accounts
    const accounts = ['core', 'confinfo'];
    for (const account of accounts) {
        try {
            console.log(`\nSearching for auto-stop rule in ${account} account...`);
            const ruleName = await findAutoStopRule(envName, account);
            
            if (ruleName) {
                console.log(`Found rule: ${ruleName}`);
                
                // Use eventbridge-manage-rules.js through AwsClientsWrapper
                const awsClient = new AwsClientsWrapper(account, envName);
                await awsClient._initEventBridge();
                await awsClient._setRuleState(ruleName, enable);
                
                console.log(`Rule ${ruleName} ${enable ? 'enabled' : 'disabled'} successfully in ${account} account`);
            }
        } catch (error) {
            console.error(`Error in ${account} account:`, error);
        }
    }
}

// Start execution with error handling
main().catch(error => {
    console.error('Execution failed:', error);
    process.exit(1);
});