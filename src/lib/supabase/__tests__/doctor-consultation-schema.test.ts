import { Client } from 'pg'
import { describe, expect, it } from 'vitest'

// Umang shares this database with Gov-HIMS (see README), so the column set is
// not ours alone to fix — Gov-HIMS's multi-tenant work added `hospital_id` and
// `branch_id` to these tables. Assert the columns this app reads and writes are
// present rather than pinning an exact set: a dropped or renamed column still
// fails, while a column added by the other tenant does not.
describe('doctor consultation schema', () => {
  it('encounters, prescriptions, orders have the columns this app depends on', async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    try {
      for (const [table, requiredCols] of [
        ['encounters', ['id', 'visit_id', 'patient_id', 'doctor_id', 'doctor_name', 'started_at', 'ended_at', 'kind', 'subjective', 'objective', 'assessment', 'plan', 'note_markdown', 'ai_pre_brief_accepted', 'signed_at']],
        ['prescriptions', ['id', 'encounter_id', 'visit_id', 'patient_id', 'doctor_id', 'doctor_name', 'signed_at', 'status', 'lines', 'safety', 'created_at', 'updated_at']],
        ['orders', ['id', 'visit_id', 'encounter_id', 'patient_id', 'doctor_id', 'doctor_name', 'kind', 'urgency', 'status', 'indication', 'items', 'modality', 'bench', 'sent_at', 'completed_at', 'created_at', 'updated_at']],
      ] as const) {
        const res = await client.query(
          `select column_name from information_schema.columns where table_name = $1`, [table]
        )
        const columns = res.rows.map((r) => r.column_name)
        expect(columns, `table ${table}`).toEqual(expect.arrayContaining([...requiredCols]))
      }
    } finally {
      await client.end()
    }
  })
})
