import * as governance from "./governance.js";
import * as passports from "./passports.js";
import {
  getExchangeListingByDatasetId,
  getExchangeListingById,
  insertExchangeListing,
  listDatasetUploads,
  listExchangeListings,
  upsertExchangeListing,
} from "../db/index.js";
import { listBanks } from "./parties.js";

export type ListingVisibility = "private" | "network" | "direct";

export type GovernanceStatus =
  | "Available"
  | "ProposalPending"
  | "AgreementActive"
  | "PassportPending"
  | "ConsentPending"
  | "Active"
  | "Revoked"
  | "Expired";

export interface CatalogListing {
  listingId: string;
  datasetId: string;
  title: string;
  description: string;
  classification: string;
  useCase: string;
  ownerHint: string;
  ownerDisplayName?: string;
  defaultPurpose: string;
  tokenized: boolean;
  onLedger: boolean;
  publishedAt: string;
  viewerHint?: string;
  relationship: "owner" | "recipient" | "network";
  governanceStatus: GovernanceStatus;
  passportId?: string;
  agreementId?: string;
  recipientHint?: string;
  recipientDisplayName?: string;
  expiresAt?: string;
  protectedFileName?: string;
  protectedRowCount?: number | null;
  protectedSha256?: string;
  veilioVaultId?: string;
  piiFieldsTokenized?: number | null;
  tokenizedColumnNames?: string[];
  visibility: ListingVisibility;
  invitedRecipientHint?: string;
}

function parseTokenizedColumnNames(raw: unknown): string[] | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return undefined;
  }
}

function canViewerSeeListing(input: {
  listing: {
    owner_hint: string;
    visibility: ListingVisibility;
    invited_recipient_hint: string | null;
    dataset_id: string;
  };
  viewer?: string;
  passports: Array<{ datasetId: string; ownerHint: string; recipientHint: string }>;
  proposals: Array<{ datasetId?: string; recipientHint?: string }>;
}): boolean {
  const viewer = input.viewer?.trim();
  const owner = input.listing.owner_hint;
  const visibility = input.listing.visibility ?? "private";

  if (!viewer) {
    return visibility === "network";
  }
  if (viewer === owner) {
    return true;
  }

  const involvedInGovernance =
    input.passports.some(
      (passport) =>
        passport.datasetId === input.listing.dataset_id &&
        (passport.ownerHint === viewer || passport.recipientHint === viewer),
    ) ||
    input.proposals.some(
      (proposal) =>
        String(proposal.datasetId) === input.listing.dataset_id &&
        proposal.recipientHint === viewer,
    );
  if (involvedInGovernance) {
    return true;
  }

  if (visibility === "network") {
    return true;
  }
  if (visibility === "direct" && input.listing.invited_recipient_hint === viewer) {
    return true;
  }
  return false;
}

function mapGovernanceStatus(input: {
  relationship: CatalogListing["relationship"];
  hasProposal: boolean;
  hasAgreement: boolean;
  passportStatus?: string;
}): GovernanceStatus {
  if (input.relationship === "network" && !input.hasProposal) {
    return "Available";
  }
  if (input.hasProposal && !input.hasAgreement) {
    return "ProposalPending";
  }
  if (input.hasAgreement && !input.passportStatus) {
    return "AgreementActive";
  }
  if (input.passportStatus === "PendingConsent") {
    return "ConsentPending";
  }
  if (input.passportStatus === "Active") {
    return "Active";
  }
  if (input.passportStatus === "Revoked") {
    return "Revoked";
  }
  if (input.passportStatus === "Expired") {
    return "Expired";
  }
  if (input.passportStatus === "Denied") {
    return "Revoked";
  }
  if (input.relationship === "owner" && !input.hasProposal) {
    return "Available";
  }
  return "AgreementActive";
}

export async function listCatalog(viewerHint?: string): Promise<CatalogListing[]> {
  const [listings, ledgerDatasets, allPassports, sharing, banks, uploads] = await Promise.all([
    listExchangeListings(),
    governance.listLedgerDatasets(),
    passports.listAccessPassports(),
    Promise.all([
      governance.listSharingAgreements(),
      governance.listSharingProposals(),
    ]).then(([agreements, proposals]) => ({ agreements, proposals })),
    listBanks(),
    listDatasetUploads(),
  ]);

  const currentUploadByDataset = new Map<string, (typeof uploads)[number]>();
  for (const upload of uploads) {
    if (upload.is_current && !currentUploadByDataset.has(upload.dataset_id)) {
      currentUploadByDataset.set(upload.dataset_id, upload);
    }
  }

  type SharingRow = Record<string, unknown> & {
    agreementId?: string;
    datasetId?: string;
    recipientHint?: string;
  };

  const bankByHint = new Map(banks.map((bank) => [bank.hint, bank]));
  const ledgerByDatasetId = new Map(
    ledgerDatasets.map((row) => [
      String((row as Record<string, unknown>).datasetId ?? ""),
      row,
    ]),
  );

  return listings
    .filter((listing) => {
      const visibility = (listing.visibility ?? "private") as ListingVisibility;
      return canViewerSeeListing({
        listing: { ...listing, visibility },
        viewer: viewerHint,
        passports: allPassports.map((p) => ({
          datasetId: p.datasetId,
          ownerHint: p.ownerHint,
          recipientHint: p.recipientHint,
        })),
        proposals: sharing.proposals as SharingRow[],
      });
    })
    .map((listing) => {
      const ownerHint = listing.owner_hint;
      const viewer = viewerHint?.trim();
      const datasetPassports = allPassports.filter((p) => p.datasetId === listing.dataset_id);
      const proposals = (sharing.proposals as SharingRow[]).filter(
        (p) => String(p.datasetId) === listing.dataset_id,
      );
      const agreements = (sharing.agreements as SharingRow[]).filter(
        (p) => String(p.datasetId) === listing.dataset_id,
      );

      let relationship: CatalogListing["relationship"] = "network";
      let relevantPassport = datasetPassports[0];
      let recipientHint: string | undefined;
      let agreementId: string | undefined;

      if (viewer === ownerHint) {
        relationship = "owner";
        relevantPassport =
          datasetPassports.find((p) => p.status === "Active") ??
          datasetPassports.find((p) => p.status === "PendingConsent") ??
          datasetPassports[0];
        recipientHint = relevantPassport?.recipientHint;
        agreementId =
          relevantPassport?.agreementId ??
          String(proposals[0]?.agreementId ?? agreements[0]?.agreementId ?? "");
      } else if (viewer && datasetPassports.some((p) => p.recipientHint === viewer)) {
        relationship = "recipient";
        relevantPassport = datasetPassports.find((p) => p.recipientHint === viewer) ?? relevantPassport;
        recipientHint = viewer;
        agreementId = relevantPassport?.agreementId;
      } else if (viewer) {
        const proposalToViewer = proposals.find((p) => p.recipientHint === viewer);
        if (proposalToViewer) {
          relationship = "recipient";
          agreementId = String(proposalToViewer.agreementId ?? "");
        }
      }

      const hasProposal = proposals.length > 0;
      const hasAgreement = agreements.length > 0;
      const governanceStatus = mapGovernanceStatus({
        relationship,
        hasProposal,
        hasAgreement,
        passportStatus: relevantPassport?.status,
      });

      const upload = currentUploadByDataset.get(listing.dataset_id);

      return {
        listingId: listing.listing_id,
        datasetId: listing.dataset_id,
        title: listing.title,
        description: listing.description,
        classification: listing.classification,
        useCase: listing.use_case,
        ownerHint,
        ownerDisplayName: bankByHint.get(ownerHint)?.displayName,
        defaultPurpose: listing.default_purpose,
        tokenized: listing.tokenized,
        onLedger: ledgerByDatasetId.has(listing.dataset_id),
        publishedAt: new Date(listing.published_at).toISOString(),
        viewerHint: viewer,
        relationship,
        governanceStatus,
        passportId: relevantPassport?.passportId,
        agreementId,
        recipientHint,
        recipientDisplayName: recipientHint
          ? bankByHint.get(recipientHint)?.displayName
          : undefined,
        expiresAt: relevantPassport?.expiresAt,
        protectedFileName: upload?.file_name,
        protectedRowCount: upload?.row_count == null ? null : Number(upload.row_count),
        protectedSha256: upload?.sha256,
        veilioVaultId: upload?.veilio_vault_id ?? undefined,
        piiFieldsTokenized:
          upload?.pii_fields_tokenized == null ? null : Number(upload.pii_fields_tokenized),
        tokenizedColumnNames: parseTokenizedColumnNames(upload?.tokenized_column_names),
        visibility: (listing.visibility ?? "private") as ListingVisibility,
        invitedRecipientHint: listing.invited_recipient_hint ?? undefined,
      };
    });
}

export async function publishListing(input: {
  datasetId: string;
  ownerHint: string;
  title: string;
  description: string;
  classification: string;
  useCase: string;
  defaultPurpose: string;
  tokenized?: boolean;
}): Promise<CatalogListing> {
  const datasetId = input.datasetId.trim();
  const datasets = await governance.listLedgerDatasets();
  const onLedger = datasets.some((row) => {
    const payload = row as Record<string, unknown>;
    return String(payload.datasetId) === datasetId;
  });
  if (!onLedger) {
    throw new Error(`Dataset ${datasetId} must be registered on Canton before publishing`);
  }

  const listingId = `LST-${datasetId}`;
  await upsertExchangeListing({
    listingId,
    datasetId,
    title: input.title.trim(),
    description: input.description.trim(),
    classification: input.classification.trim(),
    useCase: input.useCase.trim(),
    ownerHint: input.ownerHint.trim(),
    defaultPurpose: input.defaultPurpose.trim(),
    tokenized: input.tokenized ?? true,
  });

  const rows = await listCatalog(input.ownerHint);
  const listing = rows.find((row) => row.listingId === listingId);
  if (!listing) {
    throw new Error("Failed to publish listing");
  }
  return listing;
}

export async function requestAccess(input: {
  listingId: string;
  requesterHint: string;
  purpose?: string;
  expirationDays?: number;
}): Promise<{
  listingId: string;
  agreementId: string;
  datasetId: string;
  ownerHint: string;
  requesterHint: string;
  status: GovernanceStatus;
  proposalCreated: boolean;
}> {
  const listing = await getExchangeListingById(input.listingId);
  if (!listing || !listing.is_published) {
    throw new Error(`Listing not found: ${input.listingId}`);
  }

  const requesterHint = input.requesterHint.trim();
  if (requesterHint === listing.owner_hint) {
    throw new Error("Owner cannot request access to their own listing");
  }

  const visibility = (listing.visibility ?? "private") as ListingVisibility;
  if (visibility === "private") {
    throw new Error(
      "This dataset is private. The owner must invite you directly or list it on the Exchange.",
    );
  }
  if (visibility === "direct" && listing.invited_recipient_hint !== requesterHint) {
    throw new Error("This dataset is reserved for a specific partner invitation.");
  }

  const purpose = (input.purpose ?? listing.default_purpose).trim();
  const agreementId = `SA-${listing.dataset_id}-${requesterHint}`;
  const existingProposals = await governance.listSharingProposals();
  const existing = existingProposals.find((row) => {
    const payload = row as Record<string, unknown>;
    return String(payload.agreementId) === agreementId;
  });

  let proposalCreated = false;
  if (!existing) {
    await governance.proposeSharing({
      datasetId: listing.dataset_id,
      agreementId,
      recipientHint: requesterHint,
      purpose,
      expirationDays: input.expirationDays ?? 90,
    });
    proposalCreated = true;
  }

  return {
    listingId: listing.listing_id,
    agreementId,
    datasetId: listing.dataset_id,
    ownerHint: listing.owner_hint,
    requesterHint,
    status: proposalCreated ? "ProposalPending" : "ProposalPending",
    proposalCreated,
  };
}

export async function ensureListingForDataset(input: {
  datasetId: string;
  title: string;
  description: string;
  classification: string;
  useCase: string;
  ownerHint: string;
  defaultPurpose: string;
  visibility?: ListingVisibility;
  invitedRecipientHint?: string;
}): Promise<string> {
  const existing = await getExchangeListingByDatasetId(input.datasetId);
  if (existing) {
    return existing.listing_id;
  }
  const listingId = `LST-${input.datasetId}`;
  await insertExchangeListing({
    listingId,
    datasetId: input.datasetId,
    title: input.title,
    description: input.description,
    classification: input.classification,
    useCase: input.useCase,
    ownerHint: input.ownerHint,
    defaultPurpose: input.defaultPurpose,
    tokenized: true,
    visibility: input.visibility ?? "private",
    invitedRecipientHint: input.invitedRecipientHint,
  });
  return listingId;
}
