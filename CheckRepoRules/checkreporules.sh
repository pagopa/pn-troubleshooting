#!/bin/bash

set -e

# Default values
GITHUB_ORG="pagopa"
GITHUB_API_BASE_URL="https://api.github.com"
AUTH_REPO_NAME="eng-github-authorization"
JSON_FILE_PATH="authorizations/pn/data/pn-dev-repo.json"

# Output directory and files
OUTPUT_DIR="output"
FULL_REPORT_FILE="${OUTPUT_DIR}/full_analysis_report.txt"
NO_PROTECTION_FILE="${OUTPUT_DIR}/unprotected_repos.txt"
EMPTY_REPOS_FILE="${OUTPUT_DIR}/empty_repos.txt"
GITHUB_TOKEN=""

while getopts "t:" opt; do
  case ${opt} in
    t ) GITHUB_TOKEN=$OPTARG ;;
    \? ) echo "Invalid option: -$OPTARG" >&2; exit 1 ;;
    : ) echo "Option -$OPTARG requires an argument." >&2; exit 1 ;;
  esac
done

if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: You must provide a Personal Access Token with the -t option." >&2
    echo "Usage: bash $0 -t <github_token>" >&2
    exit 1
fi

# Create the output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Create or remove files
> "$FULL_REPORT_FILE"
> "$NO_PROTECTION_FILE"
> "$EMPTY_REPOS_FILE"

# Redirect Output
exec > "$FULL_REPORT_FILE" 2>&1

echo "#################################################################"
echo "#        STARTING GITHUB REPOSITORY ANALYSIS (with cURL)        #"
echo "#        Date: $(date)                                          #"
echo "#################################################################"
echo ""

# Inizialize Header
AUTH_HEADER="Authorization: Bearer ${GITHUB_TOKEN}"
API_HEADER="Accept: application/vnd.github.v3+json"
API_VERSION_HEADER="X-GitHub-Api-Version: 2022-11-28"

# Api call fuction
function call_api() {
    local url=$1
    curl --silent -w "\n%{http_code}" -H "${AUTH_HEADER}" -H "${API_HEADER}" -H "${API_VERSION_HEADER}" "${url}"
}

# Function to analyze the protection rules of a given branch
function analyze_protection_rules() {
    local repo_name=$1
    local branch_name=$2
    local issues_found=()

    echo "-----------------------------------------------------------------"
    echo "Detailed analysis for: ${repo_name}:${branch_name}"
    
    local protection_url="${GITHUB_API_BASE_URL}/repos/${GITHUB_ORG}/${repo_name}/branches/${branch_name}/protection"
    local prot_response=$(call_api "${protection_url}")
    local prot_status=$(echo "$prot_response" | tail -n 1)
    local prot_body=$(echo "$prot_response" | sed '$d')

    if [ "$prot_status" -ne 200 ]; then
        echo "No protection rules found for branch '${branch_name}'."
        issues_found+=("${repo_name}:${branch_name}: Missing rule: 'Require a pull request before merging'")
        issues_found+=("${repo_name}:${branch_name}: Missing rule: 'Require approvals'")
        issues_found+=("${repo_name}:${branch_name}: Missing rule: 'Require review from Code Owners'")
    else
        echo "Protection rules found for '${branch_name}'. Checking details..."
        # Check if 'required_pull_request_reviews' is enabled. If null, all other rules fail.
        if [[ $(echo "$prot_body" | jq -r '.required_pull_request_reviews') == "null" ]]; then
            echo "Missing: Require a pull request before merging"
            issues_found+=("${repo_name}:${branch_name}: Missing rule: 'Require a pull request before merging'")
            issues_found+=("${repo_name}:${branch_name}: Missing rule: 'Require approvals'")
            issues_found+=("${repo_name}:${branch_name}: Missing rule: 'Require review from Code Owners'")
        else
            # Check for required approving review count
            local approval_count=$(echo "$prot_body" | jq -r '.required_pull_request_reviews.required_approving_review_count // 0')
            if [[ "$approval_count" -lt 1 ]]; then
                echo "Missing: Require approvals (count: ${approval_count})"
                issues_found+=("${repo_name}:${branch_name}: Missing rule: 'Require approvals'")
            else
                echo "OK: Require approvals (count: ${approval_count})"
            fi

            # Check for code owner
            if [[ $(echo "$prot_body" | jq -r '.required_pull_request_reviews.require_code_owner_reviews') != "true" ]]; then
                echo "Missing: Require review from Code Owners"
                issues_found+=("${repo_name}:${branch_name}: Missing rule: 'Require review from Code Owners'")
            else
                echo "OK: Require review from Code Owners"
            fi
        fi
    fi

    # Write any issues found to the report file
    if [ ${#issues_found[@]} -gt 0 ]; then
        printf "%s\n" "${issues_found[@]}" >> "${NO_PROTECTION_FILE}"
    fi
}

# SCRIPT EXECUTION

CONFIG_FILE_URL="${GITHUB_API_BASE_URL}/repos/${GITHUB_ORG}/${AUTH_REPO_NAME}/contents/${JSON_FILE_PATH}"
echo "Fetching configuration JSON from: ${CONFIG_FILE_URL}"
CONFIG_FILE_RESPONSE=$(call_api "${CONFIG_FILE_URL}")
CONFIG_FILE_JSON=$(echo "${CONFIG_FILE_RESPONSE}" | sed '$d' | jq -r '.content' | base64 --decode)

if [[ -z "$CONFIG_FILE_JSON" || "$CONFIG_FILE_JSON" == "null" ]]; then
    echo "Fatal Error: Could not retrieve or decode the configuration JSON file." >&2
    exit 1
fi
echo "Configuration JSON file fetched and decoded successfully."
echo ""

for repo_name in $(echo "$CONFIG_FILE_JSON" | jq -r '.repos[].repo_name'); do
    echo "================================================================="
    echo "Analyzing repository: ${repo_name}"

    branches_url="${GITHUB_API_BASE_URL}/repos/${GITHUB_ORG}/${repo_name}/branches"
    branches_response=$(call_api "${branches_url}")
    branches_body=$(echo "$branches_response" | sed '$d')
    branches_count=$(echo "$branches_body" | jq 'length')

    if [ "$branches_count" -eq 0 ]; then
        echo "This repository is empty (has no branches). Adding to ${EMPTY_REPOS_FILE}"
        echo "${repo_name}" >> "${EMPTY_REPOS_FILE}"
        echo ""
        continue
    fi
    
    # Check existence and protection for 'main' branch
    branch_url="${GITHUB_API_BASE_URL}/repos/${GITHUB_ORG}/${repo_name}/branches/main"
    response=$(call_api "${branch_url}")
    http_status=$(echo "$response" | tail -n 1)
    if [ "$http_status" -eq 200 ]; then
        analyze_protection_rules "${repo_name}" "main"
    else
        echo "Branch 'main' not found."
    fi

    # Check existence and protection for 'develop' branch
    branch_url="${GITHUB_API_BASE_URL}/repos/${GITHUB_ORG}/${repo_name}/branches/develop"
    response=$(call_api "${branch_url}")
    http_status=$(echo "$response" | tail -n 1)
    if [ "$http_status" -eq 200 ]; then
        analyze_protection_rules "${repo_name}" "develop"
    else
        echo "Branch 'develop' not found."
    fi
    echo ""
done

echo "================================================================="
echo "Analysis complete."
echo "Full analysis report saved to: ${FULL_REPORT_FILE}"
echo "Detailed list of protection issues saved to: ${NO_PROTECTION_FILE}"
echo "List of empty repositories saved to: ${EMPTY_REPOS_FILE}"