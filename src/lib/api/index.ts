/* Umang Hospital — API public surface.
 *
 * Stores import from '@/lib/api' and call typed async methods backed by Supabase
 * (via `_core.table()`), with a localStorage fallback only for tables that don't
 * yet exist. Demo data is the migrated real data in Postgres — see `_seed.ts`
 * (audit-bridge only) and `scripts/seed/*` for one-off ops seeding.
 */
export * from './_core'
export { AdmissionRequests, AdmissionRequestSchema } from './admission-requests'
export { Audit, AuditEntrySchema, installAuditBridge, onAudit } from './audit'
export { Beds, BedSchema, BedWard, BedStatus, BedGender } from './beds'
export { Bills, BillSchema, BillLineSchema, PaymentSchema, patientDueOf } from './bills'
export { Emergency, ErCaseSchema, type ErBoardPatient } from './emergency'
export { Feedback, FeedbackRowSchema } from './feedback'
export { Encounters, EncounterSchema } from './encounters'
export { Insurance, InsuranceClaimSchema, ClaimDocumentSchema, ClaimEventSchema } from './insurance'
export { Inventory, InventoryRowSchema } from './inventory'
export { HR, HrRowSchema, type HrBundle } from './hr'
export { Mortuary, MortuaryRowSchema } from './mortuary'
export {
  IpdStays, IpdStaySchema, IpdStage, IpdCondition, IpdDischargePillarKey,
} from './ipd-stays'
export { IpdVitals, IpdVitalSchema, IpdVitalActorSchema } from './ipd-vitals'
export { LabReflexSuggestions, LabReflexSuggestionSchema } from './lab-reflex-suggestions'
export { LabSpecimens, LabSpecimenSchema, LabSpecimenType } from './lab-specimens'
export { LabTests, LabTestSchema, LabTechSchema, LabAnalyteResultSchema, LabMicrobioResultSchema, LabRejectReason } from './lab-tests'
export { Orders, OrderSchema, OrderItemSchema } from './orders'
export { OT, OtRowSchema } from './ot'
export { Patients, PatientSchema } from './patients'
export {
  PharmacyDispenses, PharmacyDispenseSchema, PharmacistSchema, PharmacyMedicineSchema,
  QuantityModificationSchema, PharmRxSource, PharmPaymentMode, MedSupply, PrepStatus,
  ProcurementStatus, ModificationReason, PharmTriageLevel,
} from './pharmacy-dispenses'
export {
  PharmacyStock, StockItemSchema, PharmacyPurchaseOrders, PurchaseOrderSchema,
  PharmDrugSchedule, POKind, POStatus,
} from './pharmacy-inventory'
export {
  NurseShiftAssignments, NurseShiftAssignmentSchema,
  ShiftHandovers, ShiftHandoverSchema, HandoverActorSchema,
} from './shift-handovers'
export { NurseTasks, NurseTaskSchema } from './nurse-tasks'
export { Notifications, NotificationRowSchema } from './notifications'
export { Prescriptions, PrescriptionSchema, RxLineSchema, SafetyEnvelopeSchema } from './prescriptions'
export {
  RadiologyStudies, RadiologyStudySchema, RadTechSchema, RadAttachmentSchema,
  RadAiFindingSchema, RadDoseRecordSchema, RadQualityFlagsSchema,
  RadDistributionEntrySchema, RadEscalationSchema, RadCallbackSchema,
} from './radiology-studies'
export { VitalsReadings, VitalsReadingSchema } from './vitals-readings'
export { Visits, VisitSchema, VisitKind, VisitStatus } from './visits'
export { Ward, WardRowSchema } from './ward'

// Bootstrap helpers
export { ensureSeeded, reseed } from './_seed'
