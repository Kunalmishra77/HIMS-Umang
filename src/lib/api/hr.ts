/* HR / HRMS — 10 entities (staff, shifts, leave, duty, swaps, sick-calls,
 * overtime, shift-templates, payroll, dept-minimums) persisted to one `hr`
 * table (kind discriminator + data jsonb). The store owns the rich types. */
import { z } from 'zod'
import { table } from './_core'

export const HrRowSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.string().optional(),
  data: z.unknown(),
})
export type HrRow = z.infer<typeof HrRowSchema>

type Rec = Record<string, unknown> & { id?: string; status?: string }

export type HrBundle = {
  staff: Rec[]; shifts: Rec[]; leaveRequests: Rec[]; dutyAssignments: Rec[]
  swapRequests: Rec[]; sickCalls: Rec[]; overtimeEntries: Rec[]
  shiftTemplates: Rec[]; payrollPeriods: Rec[]; deptMinimums: Rec[]
}

const rows = table<HrRow>('hr', HrRowSchema)

// kind → how to derive a stable row id from an entity (some lack a plain `id`).
const KINDS: { key: keyof HrBundle; kind: string; idOf: (e: Rec) => string }[] = [
  { key: 'staff', kind: 'staff', idOf: (e) => String(e.id) },
  { key: 'shifts', kind: 'shift', idOf: (e) => `${e.staffId}:${e.date}` },
  { key: 'leaveRequests', kind: 'leave', idOf: (e) => String(e.id) },
  { key: 'dutyAssignments', kind: 'duty', idOf: (e) => String(e.id) },
  { key: 'swapRequests', kind: 'swap', idOf: (e) => String(e.id) },
  { key: 'sickCalls', kind: 'sick_call', idOf: (e) => String(e.id) },
  { key: 'overtimeEntries', kind: 'overtime', idOf: (e) => String(e.id) },
  { key: 'shiftTemplates', kind: 'shift_template', idOf: (e) => String(e.id) },
  { key: 'payrollPeriods', kind: 'payroll', idOf: (e) => String(e.id) },
  { key: 'deptMinimums', kind: 'dept_minimum', idOf: (e) => String(e.department) },
]

export const HR = {
  async saveMany(bundle: HrBundle) {
    const puts = KINDS.flatMap(({ key, kind, idOf }) =>
      (bundle[key] ?? []).map((e) => rows.put({ id: `${kind}:${idOf(e)}`, kind, status: (e.status as string | undefined), data: e })))
    await Promise.all(puts)
  },
  async list(): Promise<HrBundle> {
    const all = await rows.list()
    const of = (kind: string) => all.filter((r) => r.kind === kind).map((r) => r.data as Rec).filter(Boolean)
    return {
      staff: of('staff'), shifts: of('shift'), leaveRequests: of('leave'), dutyAssignments: of('duty'),
      swapRequests: of('swap'), sickCalls: of('sick_call'), overtimeEntries: of('overtime'),
      shiftTemplates: of('shift_template'), payrollPeriods: of('payroll'), deptMinimums: of('dept_minimum'),
    }
  },
  _table: rows,
}
