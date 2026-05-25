# ecs-services-catalog

Generates an **XLSX report** with one tab per AWS account, listing **desired**, **min** and **max** tasks for every ECS service across all ECS clusters in `eu-south-1`.

Accounts covered (tabs):
- `pn-core-dev` / `pn-confinfo-dev`
- `pn-core-test` / `pn-confinfo-test`
- `pn-core-uat` / `pn-confinfo-uat`
- `pn-core-hotfix` / `pn-confinfo-hotfix`

Min/max values come from **Application Auto Scaling**; services without a policy show `N/A`.

## Prerequisites

Login to all needed SSO profiles before running:

```bash
aws sso login --profile sso_pn-core-dev
aws sso login --profile sso_pn-confinfo-dev
# ... repeat for each profile
```

Then install dependencies:

```bash
npm install
```

## Usage

```bash
node index.js
```

The output file is saved in the current directory as `ecs-scaling-report-<timestamp>.xlsx`.
