import * as governance from "./governance.js";
import { ensureListingForDataset } from "./catalog.js";
import { createBank, listBanks, allocateBankParty } from "./parties.js";
import { processThroughVeilioVault, type TokenizationPolicy } from "./veilio-mock.js";
import { getCurrentDatasetUpload, insertDatasetUpload, clearAllExchangeListings, deleteDatasetUploadsByDatasetId } from "../db/index.js";
import { createHash } from "node:crypto";
import { buildDemoInvoicePdf } from "./demo-pdf.js";

type DemoPartner = {
  hint: string;
  displayName: string;
  description: string;
  participant: "participant1" | "participant2" | "participant3" | "participant4" | "participant5";
};

type DemoScenario = {
  datasetId: string;
  title: string;
  description: string;
  classification: string;
  useCase: string;
  ownerHint: string;
  recipientHint: string;
  purpose: string;
  agreementId: string;
  passportId: string;
  consentId: string;
  expirationDays: number;
  /** full = active passport, partial = pending consent, catalog = listed only */
  stage: "full" | "partial" | "catalog";
};

const DEMO_PARTNERS: DemoPartner[] = [
  {
    hint: "BankA",
    displayName: "Meridian Bank",
    description: "Retail and corporate banking institution",
    participant: "participant1",
  },
  {
    hint: "KYCProvider",
    displayName: "VeriTrust KYC",
    description: "Licensed identity verification service provider",
    participant: "participant2",
  },
  {
    hint: "ExporterCo",
    displayName: "Global Export Ltd",
    description: "International trade exporter",
    participant: "participant3",
  },
  {
    hint: "FinancePartner",
    displayName: "TradeFlow Capital",
    description: "Trade finance institution",
    participant: "participant4",
  },
  {
    hint: "InsuranceCo",
    displayName: "Pacific Assurance",
    description: "Regulated insurance group",
    participant: "participant5",
  },
  {
    hint: "AuditFirm",
    displayName: "Deloitte External Audit",
    description: "External audit and assurance",
    participant: "participant2",
  },
  {
    hint: "HealthSystem",
    displayName: "Pacific Health Network",
    description: "Regional hospital and clinical research network",
    participant: "participant3",
  },
  {
    hint: "AILab",
    displayName: "Cortex Analytics AI",
    description: "Regulated AI analytics and model training partner",
    participant: "participant4",
  },
];

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    datasetId: "DS-CUSTOMER-KYC-2026",
    title: "Corporate Customer KYC Package",
    description: "Tokenized identity and compliance records for ACME Corp onboarding",
    classification: "Regulated-Financial",
    useCase: "KYC",
    ownerHint: "BankA",
    recipientHint: "KYCProvider",
    purpose: "Identity Verification",
    agreementId: "SA-KYC-DEMO",
    passportId: "VP-KYC-DEMO-001",
    consentId: "CONSENT-KYC-DEMO-001",
    expirationDays: 90,
    stage: "full",
  },
  {
    datasetId: "DS-INVOICE-BATCH-Q2",
    title: "Q2 Export Invoice Batch",
    description: "Tokenized invoice records for trade finance credit line review",
    classification: "Trade-Finance",
    useCase: "TradeFinance",
    ownerHint: "ExporterCo",
    recipientHint: "FinancePartner",
    purpose: "Invoice Validation & Credit Assessment",
    agreementId: "SA-TRADE-DEMO",
    passportId: "VP-TRADE-DEMO-001",
    consentId: "CONSENT-TRADE-DEMO-001",
    expirationDays: 60,
    stage: "full",
  },
  {
    datasetId: "DS-ACCOUNTING-FY2025",
    title: "FY2025 Accounting Records",
    description: "Tokenized accounting records for annual regulatory audit",
    classification: "Regulated-Financial",
    useCase: "Audit",
    ownerHint: "InsuranceCo",
    recipientHint: "AuditFirm",
    purpose: "Annual Regulatory Audit",
    agreementId: "SA-AUDIT-DEMO",
    passportId: "VP-AUDIT-DEMO-001",
    consentId: "CONSENT-AUDIT-DEMO-001",
    expirationDays: 90,
    stage: "partial",
  },
  {
    datasetId: "DS-CLINICAL-TRIAL-2026",
    title: "De-identified Clinical Trial Cohort",
    description: "Tokenized patient cohort for regulated healthcare analytics",
    classification: "Operational",
    useCase: "Healthcare",
    ownerHint: "HealthSystem",
    recipientHint: "AILab",
    purpose: "Treatment efficacy analytics on de-identified cohort",
    agreementId: "SA-HEALTH-DEMO",
    passportId: "VP-HEALTH-DEMO-001",
    consentId: "CONSENT-HEALTH-DEMO-001",
    expirationDays: 120,
    stage: "full",
  },
  {
    datasetId: "DS-CLAIMS-MODEL-2026",
    title: "Tokenized Claims Features Set",
    description: "Feature matrix for fraud detection model training",
    classification: "Operational",
    useCase: "AI",
    ownerHint: "InsuranceCo",
    recipientHint: "AILab",
    purpose: "Fraud detection model training",
    agreementId: "SA-AI-DEMO",
    passportId: "VP-AI-DEMO-001",
    consentId: "CONSENT-AI-DEMO-001",
    expirationDays: 14,
    stage: "full",
  },
];

export const DEMO_DATASET_IDS = DEMO_SCENARIOS.map((scenario) => scenario.datasetId);

const DEMO_FILES: Record<
  string,
  { fileName: string; kind: "csv" | "pdf"; csv?: string }
> = {
  "DS-CUSTOMER-KYC-2026": {
    fileName: "corporate_kyc.tokenized.csv",
    kind: "csv",
    csv: `customer_id,legal_name,email,national_id,country,status
C-1001,ACME Holdings SA,john.doe@acme.example,FR-88442211,France,Active
C-1002,Meridian Subsidiary Ltd,compliance@meridian.example,GB-77221100,UK,Active
C-1003,Northwind Trading,finance@northwind.example,DE-99110022,Germany,Pending`,
  },
  "DS-INVOICE-BATCH-Q2": {
    fileName: "q2_invoice_INV-041.sealed.pdf",
    kind: "pdf",
  },
  "DS-ACCOUNTING-FY2025": {
    fileName: "fy2025_accounts.tokenized.csv",
    kind: "csv",
    csv: `account_code,description,debit_eur,credit_eur,period,auditor_notes
4010,Policy premiums,2450000.00,0.00,FY2025,Reviewed
5100,Claims reserves,0.00,890000.00,FY2025,Sample tested
6200,Operating expenses,320000.00,0.00,FY2025,Supporting docs requested`,
  },
  "DS-CLINICAL-TRIAL-2026": {
    fileName: "clinical_cohort.tokenized.csv",
    kind: "csv",
    csv: `patient_token,age_band,diagnosis_code,treatment_arm,outcome_score,site_region,contact_email
PT-8842,55-64,E11,Arm A,0.72,EU-West,patient8842@trial.example
PT-9011,45-54,I10,Arm B,0.81,EU-West,contact9011@trial.example
PT-7730,65+,J45,Arm A,0.65,US-East,pt7730@health.example`,
  },
  "DS-CLAIMS-MODEL-2026": {
    fileName: "claims_features.tokenized.csv",
    kind: "csv",
    csv: `feature_id,claim_amount_band,provider_risk_score,region,policy_holder_ref,fraud_label_training
F-001,1000-5000,0.34,FR,POL-88291,0
F-002,5000-10000,0.67,DE,POL-44102,1
F-003,500-1000,0.21,FR,POL-22910,0`,
  },
};

/** Explicit column policies for demo datasets (mirrors owner choices in the upload wizard). */
const DEMO_TOKENIZATION_POLICIES: Record<string, TokenizationPolicy> = {
  "DS-CUSTOMER-KYC-2026": {
    customer_id: false,
    legal_name: true,
    email: true,
    national_id: true,
    country: false,
    status: false,
  },
  "DS-ACCOUNTING-FY2025": {
    account_code: false,
    description: false,
    debit_eur: false,
    credit_eur: false,
    period: false,
    auditor_notes: true,
  },
  "DS-CLINICAL-TRIAL-2026": {
    patient_token: true,
    age_band: false,
    diagnosis_code: false,
    treatment_arm: false,
    outcome_score: false,
    site_region: true,
    contact_email: true,
  },
  "DS-CLAIMS-MODEL-2026": {
    feature_id: false,
    claim_amount_band: false,
    provider_risk_score: false,
    region: true,
    policy_holder_ref: true,
    fraud_label_training: false,
  },
};

function demoDataFormat(datasetId: string): "CSV" | "PDF" {
  return datasetId === "DS-INVOICE-BATCH-Q2" ? "PDF" : "CSV";
}

function demoAccessScope(useCase: string): "ReadOnly" | "Analytics" {
  if (useCase === "KYC" || useCase === "Healthcare") {
    return "ReadOnly";
  }
  return "Analytics";
}

async function ensureDemoFile(scenario: DemoScenario): Promise<void> {
  const file = DEMO_FILES[scenario.datasetId];
  if (!file) {
    return;
  }
  const existing = await getCurrentDatasetUpload(scenario.datasetId);
  const wantsPdf = file.kind === "pdf";
  if (existing) {
    const isPdf = existing.mime_type.includes("pdf");
    const formatOk = (wantsPdf && isPdf) || (!wantsPdf && !isPdf);
    const hasVaultMeta = Boolean(
      existing.veilio_vault_id &&
        (wantsPdf || (existing.tokenized_column_names && existing.pii_fields_tokenized != null)),
    );
    if (formatOk && hasVaultMeta) {
      return;
    }
  }

  const sourceBuffer =
    file.kind === "pdf" ? buildDemoInvoicePdf() : Buffer.from(file.csv ?? "", "utf8");
  const policy = DEMO_TOKENIZATION_POLICIES[scenario.datasetId];
  const veilio = processThroughVeilioVault(
    sourceBuffer,
    file.fileName,
    scenario.classification,
    policy,
  );
  const rowCount =
    file.kind === "pdf"
      ? null
      : (file.csv ?? "").split(/\r?\n/).filter((line) => line.trim()).length - 1;

  await insertDatasetUpload({
    datasetId: scenario.datasetId,
    ownerHint: scenario.ownerHint,
    fileName: veilio.fileName,
    mimeType: file.kind === "pdf" ? "application/pdf" : "text/csv",
    fileSize: veilio.buffer.length,
    sha256: createHash("sha256").update(veilio.buffer).digest("hex"),
    rowCount,
    fileData: veilio.buffer,
    replaceLatest: Boolean(existing),
    veilioVaultId: veilio.vaultId,
    piiFieldsTokenized: veilio.piiFieldsTokenized,
    tokenizedColumnNames: veilio.tokenizedColumnNames,
  });
}

async function ensurePartner(partner: DemoPartner): Promise<void> {
  const banks = await listBanks();
  const existing = banks.find((bank) => bank.hint === partner.hint);
  if (!existing) {
    await createBank(partner);
    return;
  }
  if (!existing.partyId) {
    await allocateBankParty(partner.hint);
  }
}

function isLivePermission(payload: Record<string, unknown>): boolean {
  const status = String(payload.status ?? "");
  return status === "PSPending" || status === "PSActive";
}

async function ensureActiveSharingAgreement(scenario: DemoScenario): Promise<void> {
  if (scenario.stage === "catalog") {
    return;
  }

  const agreements = await governance.listSharingAgreements();
  const hasActiveAgreement = agreements.some((row) => {
    const payload = row as Record<string, unknown>;
    return (
      String(payload.agreementId) === scenario.agreementId &&
      String(payload.status) === "ASActive"
    );
  });
  if (hasActiveAgreement) {
    return;
  }

  const proposals = await governance.listSharingProposals();
  const hasOpenProposal = proposals.some((row) => {
    const payload = row as Record<string, unknown>;
    return String(payload.agreementId) === scenario.agreementId;
  });

  if (!hasOpenProposal) {
    await governance.proposeSharing({
      datasetId: scenario.datasetId,
      agreementId: scenario.agreementId,
      recipientHint: scenario.recipientHint,
      purpose: scenario.purpose,
      expirationDays: scenario.expirationDays,
    });
  }

  await governance.acceptSharing(scenario.agreementId);
}

async function datasetExists(datasetId: string): Promise<boolean> {
  const datasets = await governance.listLedgerDatasets();
  return datasets.some((row) => {
    const payload = row as Record<string, unknown>;
    return String(payload.datasetId) === datasetId;
  });
}

async function runScenario(scenario: DemoScenario): Promise<string> {
  await ensureListingForDataset({
    datasetId: scenario.datasetId,
    title: scenario.title,
    description: scenario.description,
    classification: scenario.classification,
    useCase: scenario.useCase,
    ownerHint: scenario.ownerHint,
    defaultPurpose: scenario.purpose,
    visibility: "network",
  });

  if (!(await datasetExists(scenario.datasetId))) {
    await governance.registerDataset({
      datasetId: scenario.datasetId,
      ownerHint: scenario.ownerHint,
      title: scenario.title,
      description: scenario.description,
      classification: scenario.classification,
      dataFormat: demoDataFormat(scenario.datasetId),
    });
  }

  await ensureActiveSharingAgreement(scenario);

  if (scenario.stage === "catalog") {
    return scenario.passportId;
  }

  const permissions = await governance.listPermissions();
  const hasLivePermission = permissions.some((row) => {
    const payload = row as Record<string, unknown>;
    return (
      String(payload.permissionId) === scenario.passportId && isLivePermission(payload)
    );
  });

  if (!hasLivePermission) {
    await governance.issuePermission({
      agreementId: scenario.agreementId,
      permissionId: scenario.passportId,
      accessScope: demoAccessScope(scenario.useCase),
      accessRights: "read-analytics",
    });
  }

  if (scenario.stage === "full") {
    const refreshed = await governance.listPermissions();
    const permission = refreshed.find((row) => {
      const payload = row as Record<string, unknown>;
      return String(payload.permissionId) === scenario.passportId;
    }) as Record<string, unknown> | undefined;
    if (permission && String(permission.status) === "PSPending") {
      await governance.recordConsent({
        permissionId: scenario.passportId,
        consentId: scenario.consentId,
      });
    }
  }

  return ensureActivePassport(scenario);
}

async function ensureActivePassport(scenario: DemoScenario): Promise<string> {
  const permissions = await governance.listPermissions();

  const liveDefault = permissions.find((row) => {
    const payload = row as Record<string, unknown>;
    return (
      String(payload.permissionId) === scenario.passportId && isLivePermission(payload)
    );
  }) as Record<string, unknown> | undefined;
  if (liveDefault) {
    if (String(liveDefault.status) === "PSActive" || scenario.stage === "partial") {
      return scenario.passportId;
    }
  }

  const activeForDataset = permissions.filter((row) => {
    const payload = row as Record<string, unknown>;
    return (
      String(payload.datasetId) === scenario.datasetId &&
      String(payload.status) === "PSActive"
    );
  });
  if (activeForDataset.length > 0) {
    const latest = activeForDataset.at(-1) as Record<string, unknown>;
    return String(latest.permissionId);
  }

  if (scenario.stage === "partial") {
    const pendingForDataset = permissions.filter((row) => {
      const payload = row as Record<string, unknown>;
      return (
        String(payload.datasetId) === scenario.datasetId &&
        String(payload.status) === "PSPending"
      );
    });
    if (pendingForDataset.length > 0) {
      const latest = pendingForDataset.at(-1) as Record<string, unknown>;
      return String(latest.permissionId);
    }
  }

  if (scenario.stage !== "full") {
    return scenario.passportId;
  }

  await ensureActiveSharingAgreement(scenario);

  const newPassportId = `${scenario.passportId}-${Date.now().toString(36).slice(-5)}`;
  await governance.issuePermission({
    agreementId: scenario.agreementId,
    permissionId: newPassportId,
    accessScope: demoAccessScope(scenario.useCase),
    accessRights: "read-analytics",
  });

  const refreshed = await governance.listPermissions();
  const pending = refreshed.find((row) => {
    const payload = row as Record<string, unknown>;
    return (
      String(payload.permissionId) === newPassportId &&
      String(payload.status) === "PSPending"
    );
  });
  if (pending) {
    await governance.recordConsent({
      permissionId: newPassportId,
      consentId: `CONSENT-${newPassportId}`,
    });
  }

  return newPassportId;
}

export async function clearProductionCatalog(): Promise<{
  listingsRemoved: number;
  uploadsRemoved: number;
}> {
  const listingsRemoved = await clearAllExchangeListings();
  let uploadsRemoved = 0;
  for (const datasetId of DEMO_DATASET_IDS) {
    uploadsRemoved += await deleteDatasetUploadsByDatasetId(datasetId);
  }
  return { listingsRemoved, uploadsRemoved };
}

export async function seedDemoNetwork(): Promise<{
  seeded: boolean;
  partners: string[];
  listings: string[];
  scenarios: Array<{
    datasetId: string;
    agreementId: string;
    passportId: string;
    stage: DemoScenario["stage"];
    passportStatus: string;
  }>;
}> {
  const scenarioPassportIds = new Map<string, string>();

  for (const partner of DEMO_PARTNERS) {
    await ensurePartner(partner);
  }

  for (const scenario of DEMO_SCENARIOS) {
    const activePassportId = await runScenario(scenario);
    await ensureDemoFile(scenario);
    scenarioPassportIds.set(scenario.datasetId, activePassportId);
  }

  const permissions = await governance.listPermissions();
  const scenarios = DEMO_SCENARIOS.map((scenario) => {
    const passportId = scenarioPassportIds.get(scenario.datasetId) ?? scenario.passportId;
    const permission = permissions.find((row) => {
      const payload = row as Record<string, unknown>;
      return String(payload.permissionId) === passportId;
    }) as Record<string, unknown> | undefined;
    const status = permission ? String(permission.status ?? "none") : "none";
    const passportStatus =
      status === "PSActive"
        ? "Active"
        : status === "PSPending"
          ? "PendingConsent"
          : status === "PSRevoked"
            ? "Revoked"
            : "None";
    return {
      datasetId: scenario.datasetId,
      agreementId: scenario.agreementId,
      passportId,
      stage: scenario.stage,
      passportStatus,
    };
  });

  return {
    seeded: true,
    partners: DEMO_PARTNERS.map((partner) => partner.hint),
    listings: DEMO_SCENARIOS.map((scenario) => `LST-${scenario.datasetId}`),
    scenarios,
  };
}
