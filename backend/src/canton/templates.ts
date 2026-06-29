import { config } from "../config.js";

const pkg = () => config.canton.packageId;

export const templates = {
  dataset: () => `${pkg()}:Veilio.Dataset:Dataset`,
  auditRecord: () => `${pkg()}:Veilio.AuditRecord:AuditRecord`,
  sharingProposal: () => `${pkg()}:Veilio.SharingAgreement:SharingAgreementProposal`,
  sharingAgreement: () => `${pkg()}:Veilio.SharingAgreement:SharingAgreement`,
  permission: () => `${pkg()}:Veilio.Permission:Permission`,
  consent: () => `${pkg()}:Veilio.Consent:Consent`,
  revocation: () => `${pkg()}:Veilio.Revocation:Revocation`,
};
