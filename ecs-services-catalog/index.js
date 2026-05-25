const { ECSClient, ListClustersCommand, ListServicesCommand, DescribeServicesCommand } = require("@aws-sdk/client-ecs");
const { ApplicationAutoScalingClient, DescribeScalableTargetsCommand } = require("@aws-sdk/client-application-auto-scaling");
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const ExcelJS = require("exceljs");
const path = require("path");

const REGION = "eu-south-1";

const PROFILES = [
  "sso_pn-core-dev",
  "sso_pn-confinfo-dev",
  "sso_pn-core-test",
  "sso_pn-confinfo-test",
  "sso_pn-core-uat",
  "sso_pn-confinfo-uat",
  "sso_pn-core-hotfix",
  "sso_pn-confinfo-hotfix",
];

function makeConfig(profile) {
  return {
    region: REGION,
    credentials: fromIni({ profile }),
  };
}

function shortName(arn) {
  return arn.split("/").pop();
}

async function listAllClusters(ecsClient) {
  const clusterArns = [];
  let nextToken;
  do {
    const res = await ecsClient.send(new ListClustersCommand({ nextToken }));
    clusterArns.push(...res.clusterArns);
    nextToken = res.nextToken;
  } while (nextToken);
  return clusterArns;
}

async function listAllServices(ecsClient, clusterArn) {
  const serviceArns = [];
  let nextToken;
  do {
    const res = await ecsClient.send(new ListServicesCommand({ cluster: clusterArn, maxResults: 100, nextToken }));
    serviceArns.push(...res.serviceArns);
    nextToken = res.nextToken;
  } while (nextToken);
  return serviceArns;
}

async function describeServicesInBatches(ecsClient, clusterArn, serviceArns) {
  const services = [];
  for (let i = 0; i < serviceArns.length; i += 10) {
    const batch = serviceArns.slice(i, i + 10);
    const res = await ecsClient.send(new DescribeServicesCommand({ cluster: clusterArn, services: batch }));
    services.push(...res.services);
  }
  return services;
}

async function getScalingTargets(aasClient, serviceArns) {
  const resourceIds = serviceArns.map(arn => arn.split(":").pop()); // service/<cluster>/<service>

  const targets = {};
  let nextToken;
  do {
    const res = await aasClient.send(new DescribeScalableTargetsCommand({
      ServiceNamespace: "ecs",
      ResourceIds: resourceIds,
      nextToken,
    }));
    for (const t of res.ScalableTargets) {
      targets[t.ResourceId] = { min: t.MinCapacity, max: t.MaxCapacity };
    }
    nextToken = res.NextToken;
  } while (nextToken);

  return targets;
}

async function collectRowsForProfile(profile) {
  console.log(`  Fetching data for ${profile}...`);
  const cfg = makeConfig(profile);
  const ecsClient = new ECSClient(cfg);
  const aasClient = new ApplicationAutoScalingClient(cfg);

  const clusterArns = await listAllClusters(ecsClient);
  if (clusterArns.length === 0) {
    console.log(`  → No clusters found.`);
    return [];
  }

  const rows = [];

  for (const clusterArn of clusterArns) {
    const clusterName = shortName(clusterArn);
    const serviceArns = await listAllServices(ecsClient, clusterArn);
    if (serviceArns.length === 0) continue;

    const services = await describeServicesInBatches(ecsClient, clusterArn, serviceArns);
    const scalingTargets = await getScalingTargets(aasClient, serviceArns);

    for (const svc of services) {
      const serviceName = shortName(svc.serviceArn);
      const resourceId = `service/${clusterName}/${serviceName}`;
      const scaling = scalingTargets[resourceId];

      rows.push({
        cluster: clusterName,
        service: serviceName,
        desired: svc.desiredCount,
        min: scaling?.min ?? null,
        max: scaling?.max ?? null,
      });
    }
  }

  // Sort by desired desc, then min desc, then max desc (null treated as -1)
  const numOrNeg = v => (v === null ? -1 : v);
  rows.sort((a, b) =>
    numOrNeg(b.desired) - numOrNeg(a.desired) ||
    numOrNeg(b.min)     - numOrNeg(a.min)     ||
    numOrNeg(b.max)     - numOrNeg(a.max)
  );

  console.log(`  → ${rows.length} services collected.`);
  return rows;
}

function addSheetForProfile(workbook, profile, rows) {
  // Excel sheet names have a 31-char limit and cannot contain: \ / ? * [ ]
  const sheetName = profile.replace(/^sso_/, "").slice(0, 31);
  const sheet = workbook.addWorksheet(sheetName);

  // Header row
  sheet.columns = [
    { header: "CLUSTER",      key: "cluster", width: 45 },
    { header: "SERVICE",      key: "service", width: 55 },
    { header: "DESIRED TASKS", key: "desired", width: 15 },
    { header: "MIN TASKS",    key: "min",     width: 12 },
    { header: "MAX TASKS",    key: "max",     width: 12 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E75B6" } };
  headerRow.alignment = { horizontal: "center" };

  if (rows.length === 0) {
    sheet.addRow(["No data available", "", "", "", ""]);
    return;
  }

  for (const r of rows) {
    const row = sheet.addRow({
      cluster: r.cluster,
      service: r.service,
      desired: r.desired,
      min: r.min ?? "N/A",
      max: r.max ?? "N/A",
    });
    // Center numeric columns
    ["desired", "min", "max"].forEach(key => {
      row.getCell(key).alignment = { horizontal: "center" };
    });
  }

  // Freeze header row
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ecs-services-scaling";
  workbook.created = new Date();

  for (const profile of PROFILES) {
    let rows = [];
    try {
      rows = await collectRowsForProfile(profile);
    } catch (err) {
      console.warn(`  ⚠ Skipping ${profile}: ${err.message}`);
    }
    addSheetForProfile(workbook, profile, rows);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outFile = path.resolve(`ecs-scaling-report-${timestamp}.xlsx`);
  await workbook.xlsx.writeFile(outFile);
  console.log(`\nReport saved to: ${outFile}`);
}

main().catch(err => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
