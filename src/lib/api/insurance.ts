/* Insurance / TPA — claims, pre-auth pipeline, documents, timeline.
 * AI denial-risk / validation are computed client-side and persisted as jsonb. */
import { z } from 'zod'
import { audit, isoNow, table } from './_core'

export const ClaimDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['verified', 'pending', 'rejected']),
  uploadedAt: z.string().optional(),
  rejectionReason: z.string().optional(),
})

export const ClaimEventSchema = z.object({
  at: z.string(),
  actor: z.string(),
  label: z.string(),
  kind: z.enum(['submitted', 'queried', 'approved', 'partially_approved', 'rejected', 'document', 'note']),
})

export const InsuranceClaimSchema = z.object({
  id: z.string(),                                   // CLM-...
  patientId: z.string().optional(),
  patientName: z.string(),
  policyNumber: z.string().optional(),
  policyHolder: z.string().optional(),
  sumInsured: z.number().optional(),
  available: z.number().optional(),
  provider: z.string(),
  amount: z.number().nonnegative().default(0),
  approvedAmount: z.number().optional(),
  status: z.enum(['Pending Pre-Auth', 'Approved', 'Rejected', 'In Process']).default('Pending Pre-Auth'),
  approvalStage: z.enum([
    'intake', 'docs_collection', 'pre_auth_sent', 'tpa_query',
    'pre_auth_approved', 'final_claim', 'settled', 'rejected',
  ]).optional(),
  tpaQuery: z.string().optional(),
  aiProbability: z.number().optional(),
  aiDenialRisk: z.unknown().optional(),             // jsonb
  submissionStatus: z.enum(['not_submitted', 'validating', 'validated', 'submitted', 'acknowledged']).default('not_submitted'),
  aiValidation: z.unknown().optional(),             // jsonb
  documents: z.array(ClaimDocumentSchema).default([]),
  timeline: z.array(ClaimEventSchema).default([]),
  submittedAt: z.string().optional(),
  tpaReferenceId: z.string().optional(),
  diagnosis: z.string().optional(),
  treatmentSummary: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type InsuranceClaim = z.infer<typeof InsuranceClaimSchema>
export type ClaimDocument = z.infer<typeof ClaimDocumentSchema>
export type ClaimEvent = z.infer<typeof ClaimEventSchema>

const claims = table<InsuranceClaim>('insurance_claims', InsuranceClaimSchema)

export const Insurance = {
  list: (filter?: (c: InsuranceClaim) => boolean) => claims.list(filter),
  get: (id: string) => claims.get(id),
  byPatient: (patientId: string) => claims.list((c) => c.patientId === patientId),
  create: (input: InsuranceClaim) =>
    claims.put({ ...input, createdAt: input.createdAt ?? isoNow(), updatedAt: isoNow() }),
  patch: (id: string, changes: Partial<InsuranceClaim>) =>
    claims.patch(id, { ...changes, updatedAt: isoNow() }),

  async setStatus(id: string, status: InsuranceClaim['status'], opts?: { approvedAmount?: number; note?: string; actor?: string }) {
    const patched = await claims.patch(id, {
      status,
      approvedAmount: status === 'Approved' ? opts?.approvedAmount : undefined,
      updatedAt: isoNow(),
    })
    audit.emit({
      action: status === 'Approved' ? 'insurance_claim_submitted' : 'insurance_denial_risk_run',
      resource: 'claim', resourceId: id, userName: opts?.actor ?? 'Insurance Desk',
      detail: `Status → ${status}${opts?.note ? ' · ' + opts.note : ''}`,
    })
    return patched
  },

  async setSubmission(id: string, submissionStatus: InsuranceClaim['submissionStatus'], tpaRef?: string) {
    const patched = await claims.patch(id, {
      submissionStatus,
      submittedAt: submissionStatus === 'submitted' ? isoNow() : undefined,
      tpaReferenceId: tpaRef,
      updatedAt: isoNow(),
    })
    if (submissionStatus === 'submitted') {
      audit.emit({
        action: 'insurance_claim_submitted', resource: 'claim', resourceId: id,
        detail: `Claim submitted${tpaRef ? ' · TPA ref ' + tpaRef : ''}`,
      })
    }
    return patched
  },

  moveToStage: (id: string, approvalStage: NonNullable<InsuranceClaim['approvalStage']>, changes?: Partial<InsuranceClaim>) =>
    claims.patch(id, { approvalStage, ...changes, updatedAt: isoNow() }),

  setDocuments: (id: string, documents: ClaimDocument[]) => claims.patch(id, { documents, updatedAt: isoNow() }),
  setTimeline: (id: string, timeline: ClaimEvent[]) => claims.patch(id, { timeline, updatedAt: isoNow() }),
  setValidation: (id: string, aiValidation: unknown) => claims.patch(id, { aiValidation, submissionStatus: 'validated', updatedAt: isoNow() }),
  setDenialRisk: (id: string, aiDenialRisk: unknown) => claims.patch(id, { aiDenialRisk, updatedAt: isoNow() }),

  _claims: claims,
}
