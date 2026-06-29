# Veilio Governance — Daml Smart Contracts

Open-source **Canton governance frameworks** for cross-organization data access: purpose-bound permissions, recipient consent, owner revocation, and an immutable audit trail.

> **Audience:** Daml developers, Canton integrators, grant reviewers.  
> **SDK:** Daml 3.4.11 · **Package:** `veilio-governance-0.2.0.dar`  
> **Ecosystem doc:** [docs/CANTON_OPEN_SOURCE.md](../docs/CANTON_OPEN_SOURCE.md)

---

## Design principles

| Principle | Implementation |
|-----------|----------------|
| **No PII on-ledger** | Contracts store identifiers, purpose text, party IDs, timestamps — never raw personal data |
| **Ownership never transfers** | `Dataset.owner` remains the authoritative data owner throughout the lifecycle |
| **Purpose binding** | Every permission and consent references an explicit `purpose` / `authorizedPurpose` |
| **Bilateral accountability** | Sharing agreements and permissions are signed by owner **and** recipient |
| **Append-only audit** | Every governance transition emits an `AuditRecord` via `createAuditRecord` |
| **Immediate revocation** | Owner can revoke active or pending permissions; recipient can withdraw consent |

---

## Module map

```
daml/Veilio/
├── Types.daml           # Shared enums (status, scope, governance actions)
├── AuditRecord.daml     # Framework 1 — immutable audit trail
├── Consent.daml         # Framework 2 — recipient consent lifecycle
├── Permission.daml      # Framework 3 — access permission lifecycle
├── Revocation.daml      # Framework 4 — revocation evidence
├── SharingAgreement.daml# Framework 5 — cross-org sharing proposals & agreements
└── Dataset.daml         # Framework 6 — dataset registry (metadata anchor)
```

Each framework is **self-contained** and can be studied or forked independently. In production they compose into a single governance workflow (see [Lifecycle](#governance-lifecycle)).

---

## Reusable frameworks

### 1. Audit framework (`Veilio.AuditRecord`)

**Problem:** Regulated industries need a tamper-evident trail of who did what, when, and why — across organizations.

**Building blocks:**

| Artifact | Role |
|----------|------|
| `AuditRecord` template | Append-only event; `signatory actor`, `observer observers` |
| `GovernanceAction` enum | Standardized action vocabulary (register, propose, consent, revoke, …) |
| `createAuditRecord` helper | Single entry point for consistent audit emission |

**Reuse pattern:** Call `createAuditRecord` from every choice that changes governance state. Pass affected parties as `observers` so they receive ledger visibility without controlling the record.

```daml
createAuditRecord
  auditId
  actor
  ConsentRecorded
  datasetId
  (Some "Consent granted for purpose: " <> purpose)
  (Some consentId)
  [owner]
```

**Events covered:** `DatasetRegistered`, `SharingAgreementProposed`, `SharingAgreementAccepted`, `PermissionIssued`, `ConsentRecorded`, `ConsentDenied`, `ConsentWithdrawn`, `PermissionRevoked`, `AgreementExpired`, `AgreementRevoked`.

---

### 2. Consent framework (`Veilio.Consent` + `Permission` choices)

**Problem:** Recipients must explicitly authorize how shared data will be used (GDPR lawful basis, processor agreements, internal policy).

**Building blocks:**

| Artifact | Role |
|----------|------|
| `Consent` template | Records granted / denied / withdrawn consent for a `permissionId` |
| `Permission.RecordConsent` | Recipient grants consent → creates `Consent` + activates permission (`PSActive`) |
| `Permission.DenyConsent` | Recipient refuses → creates denied `Consent` + revokes permission (`PSRevoked`) |
| `Consent.WithdrawConsent` | Recipient withdraws previously granted consent |

**Status flow:** `CSPending` → `CSGranted` | `CSDenied` | `CSWithdrawn`

**Reuse pattern:** Embed consent choices on your permission template, or reference `Consent` contracts from a thin wrapper. The recipient always controls `RecordConsent`, `DenyConsent`, and `WithdrawConsent`.

---

### 3. Permission framework (`Veilio.Permission`)

**Problem:** Access must be scoped (read-only vs analytics), time-bound, and revocable without ambiguity.

**Building blocks:**

| Field | Purpose |
|-------|---------|
| `purpose` | Why access is granted (bound to sharing agreement) |
| `accessRights` | Free-text rights label (e.g. `read-analytics`) |
| `accessScope` | `ReadOnly` \| `Analytics` \| `FullAccess` |
| `expiresAt` | Hard expiration timestamp |
| `status` | `PSPending` → `PSActive` → `PSExpired` \| `PSRevoked` |

**Choices:**

| Choice | Controller | Effect |
|--------|------------|--------|
| `RecordConsent` | recipient | `PSPending` → `PSActive` + Consent + Audit |
| `DenyConsent` | recipient | `PSPending` → `PSRevoked` + denied Consent + Audit |
| `RevokePermission` | owner | Active/pending → `PSRevoked` + Revocation + Audit |
| `CheckExpiration` | owner | Auto-expire if `now >= expiresAt` |

**Reuse pattern:** Issue permissions from any parent agreement template via `IssuePermission`. Application layer maps `PSActive` + valid `expiresAt` to API access (preview/download gates).

---

### 4. Revocation framework (`Veilio.Revocation`)

**Problem:** Compliance requires proof that access was withdrawn — not just that a flag flipped.

**Building blocks:**

| Artifact | Role |
|----------|------|
| `Revocation` template | Immutable post-revocation evidence (`revoker`, `affectedParty`, `reason`, `revokedAt`) |
| `RevocationResult` | Return type pairing `revocationCid` + `auditCid` from `RevokePermission` |

**Reuse pattern:** Always create a `Revocation` contract alongside permission status change. Observers include the affected party for cross-org visibility.

---

### 5. Sharing agreement framework (`Veilio.SharingAgreement`)

**Problem:** Cross-org collaboration needs a negotiated contract layer before granular permissions are issued.

**Building blocks:**

| Template | Role |
|----------|------|
| `SharingAgreementProposal` | Owner proposes purpose + expiration; recipient accepts or rejects |
| `SharingAgreement` | Active bilateral agreement; owner issues permissions |

**Choices on proposal:**

| Choice | Controller | Effect |
|--------|------------|--------|
| `AcceptSharingAgreement` | recipient | Creates active agreement + Audit |
| `RejectSharingAgreement` | recipient | Audit only (negative path) |

**Choices on agreement:**

| Choice | Controller | Effect |
|--------|------------|--------|
| `IssuePermission` | owner | Creates `Permission` (`PSPending`) + Audit |
| `ExpireAgreement` | owner | `ASActive` → `ASExpired` + Audit |
| `RevokeAgreement` | owner | `ASActive` → `ASRevoked` + Audit |

**Reuse pattern:** Attach `ProposeSharingAgreement` to your domain asset template (see Dataset) or call directly from application-initiated commands.

---

### 6. Dataset registry (`Veilio.Dataset`)

**Problem:** Governance needs a stable on-ledger anchor for “what asset is being governed” without storing the asset itself.

**Building blocks:**

| Artifact | Role |
|----------|------|
| `Dataset` template | Metadata only: `datasetId`, `classification`, `dataFormat`, `status` |
| `registerDataset` helper | Registers dataset + first audit event |
| `ProposeSharingAgreement` | Entry point for cross-org sharing from a dataset |

**Reuse pattern:** Replace `Dataset` with your own asset template (invoice bundle, KYC case, trade document) and keep the sharing → permission → consent → revoke chain unchanged.

---

## Governance lifecycle

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Dataset    │────▶│ SharingAgreement │────▶│   Permission    │
│  registered │     │ Proposal → Active│     │  PSPending      │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
                    ┌─────────────────────────────────┼──────────────────────┐
                    ▼                                 ▼                      ▼
             RecordConsent                      DenyConsent           RevokePermission
                    │                                 │                      │
                    ▼                                 ▼                      ▼
              PSActive + Consent              PSRevoked + denied        PSRevoked +
              + AuditRecord                   Consent + Audit           Revocation + Audit
```

Every arrow emits at least one `AuditRecord`.

---

## Type reference (`Veilio.Types`)

### Status enums

| Enum | Values |
|------|--------|
| `DatasetStatus` | `DSRegistered`, `DSActive`, `DSRevoked`, `DSArchived` |
| `AgreementStatus` | `ASProposed`, `ASActive`, `ASExpired`, `ASRevoked` |
| `PermissionStatus` | `PSPending`, `PSActive`, `PSExpired`, `PSRevoked` |
| `ConsentStatus` | `CSPending`, `CSGranted`, `CSDenied`, `CSWithdrawn` |

### Access scope

| Value | Typical use |
|-------|-------------|
| `ReadOnly` | Preview / metadata access |
| `Analytics` | Aggregated or tokenized analytics |
| `FullAccess` | Full protected file download (still off-ledger) |

---

## Build & test

```bash
# From repository root
daml build --all

# In-memory governance tests (no Canton required)
daml script \
  --dar daml-script/.daml/dist/veilio-governance-scripts-0.2.0.dar \
  --script-name Veilio.GovernanceTests:testAll \
  --ide-ledger \
  --static-time

# Full lifecycle (single ledger)
daml script \
  --dar daml-script/.daml/dist/veilio-governance-scripts-0.2.0.dar \
  --script-name Veilio.Lifecycle:lifecycle \
  --ide-ledger \
  --static-time
```

**Multinode validation** (five Canton participants): see [docs/CANTON_SETUP.md](../docs/CANTON_SETUP.md) and `daml-script/daml/Veilio/LifecycleMultinode.daml`.

---

## Application integration

Veilio Exchange ships a reference **Node.js + JSON API** layer that:

1. Uploads `veilio-governance-0.2.0.dar` to Canton participants
2. Exercises template choices via Canton JSON API v2
3. Aggregates contracts into **Access Passports** (`GET /api/passports`)
4. Gates file preview/download on active permission state (off-ledger storage)

| Daml concept | Product concept |
|--------------|-----------------|
| `SharingAgreement` + `Permission` + `Consent` | **Access Passport** |
| `AuditRecord` | Governance timeline + compliance export |
| `Revocation` | Revocation history page |

See [docs/CANTON_OPEN_SOURCE.md](../docs/CANTON_OPEN_SOURCE.md) for grant narrative and fork/integration guidance.

---

## Extending for your use case

1. **New asset type** — Create a template with `signatory owner` and a `ProposeSharingAgreement` choice (copy from `Dataset.daml`).
2. **Custom scopes** — Extend `AccessScope` or add fields on `Permission`.
3. **Recipient-initiated access** — Add a `AccessRequest` proposal template observed by owner (not in PoC; pattern mirrors `SharingAgreementProposal`).
4. **Automated expiration** — Schedule `CheckExpiration` and `ExpireAgreement` from your backend cron.

Keep PII off-ledger. Store only governance metadata and identifiers on Canton.

---

## Related documentation

| Document | Content |
|----------|---------|
| [CANTON_OPEN_SOURCE.md](../docs/CANTON_OPEN_SOURCE.md) | Ecosystem positioning, grant alignment, reuse scenarios |
| [CANTON_SETUP.md](../docs/CANTON_SETUP.md) | Local five-participant Canton topology |
| [DEVELOPER_GUIDE.md](../docs/DEVELOPER_GUIDE.md) | Full-stack setup and REST API |
| [TRACK2_TECH_ROADMAP.md](../docs/TRACK2_TECH_ROADMAP.md) | Product mapping and demo specs |
