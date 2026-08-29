/* Agentix HIMS — API public surface.
 *
 * Stores import from '@/lib/api' and call typed async methods backed by Supabase
 * (via `_core.table()`), with a localStorage fallback only for tables that don't
 * yet exist. Demo data is the migrated real data in Postgres — see `_seed.ts`
 * (audit-bridge only) and `scripts/seed/*` for one-off ops seeding.
 */
export * from './_core'
export { AdmissionRequests, AdmissionRequestSchema } from './admission-requests'
export { AccountsPayable, ApRowSchema } from './ap-invoices'
export { Ambulance, AmbulanceRowSchema } from './ambulance'
export { Audit, AuditEntrySchema, installAuditBridge, onAudit } from './audit'
export { Beds, BedSchema, BedWard, BedStatus, BedGender } from './beds'
export { Consent, ConsentRowSchema } from './consent'
export { BloodBank, BloodBankRowSchema } from './bloodbank'
export { CSSD, CssdRowSchema } from './cssd'
export { Dietary, DietaryRowSchema } from './dietary'
export { Bills, BillSchema, BillLineSchema, PaymentSchema, patientDueOf } from './bills'
export { BMW, BmwRowSchema } from './bmw'
export { Appointments, AppointmentSchema } from './appointments'
export { DischargeApi, DischargeSchema } from './discharge'
export { Drugs, DrugSchema } from './drugs'
export { DrugMaster, DrugMasterRowSchema } from './drug-master'
export { Emergency, ErCaseSchema, type ErBoardPatient } from './emergency'
export { Feedback, FeedbackRowSchema } from './feedback'
export { Encounters, EncounterSchema } from './encounters'
export { Insurance, InsuranceClaimSchema, ClaimDocumentSchema, ClaimEventSchema } from './insurance'
export { Inventory, InventoryRowSchema } from './inventory'
export { HR, HrRowSchema, type HrBundle } from './hr'
export { Housekeeping, HousekeepingRowSchema } from './housekeeping'
export { Mortuary, MortuaryRowSchema } from './mortuary'
export { VendorMgmt, VendorRowSchema } from './vendor'
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
export { NarcoticsLog, NarcoticEntrySchema } from './narcotics'
export {
  NurseShiftAssignments, NurseShiftAssignmentSchema,
  ShiftHandovers, ShiftHandoverSchema, HandoverActorSchema,
} from './shift-handovers'
export { NurseTasks, NurseTaskSchema } from './nurse-tasks'
export { Notifications, NotificationRowSchema } from './notifications'
export { Prescriptions, PrescriptionSchema, RxLineSchema, SafetyEnvelopeSchema } from './prescriptions'
export { Quality, QualityRowSchema } from './quality'
export {
  RadiologyStudies, RadiologyStudySchema, RadTechSchema, RadAttachmentSchema,
  RadAiFindingSchema, RadDoseRecordSchema, RadQualityFlagsSchema,
  RadDistributionEntrySchema, RadEscalationSchema, RadCallbackSchema,
} from './radiology-studies'
export { StaffApi, StaffSchema } from './staff'
export { Statutory, StatutoryRowSchema } from './statutory'
export { VitalsReadings, VitalsReadingSchema } from './vitals-readings'
export { Visits, VisitSchema, VisitKind, VisitStatus } from './visits'
export { Ward, WardRowSchema } from './ward'

// Bootstrap helpers
export { ensureSeeded, reseed } from './_seed'
