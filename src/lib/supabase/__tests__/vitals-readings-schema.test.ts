import { Client } from 'pg'
import { describe, expect, it } from 'vitest'

// Umang shares this database with Gov-HIMS (see README), so the column set is
// not ours alone to fix — Gov-HIMS's multi-tenant work added `hospital_id` and
// `branch_id` to these tables. Assert the columns this app reads and writes are
// present rather than pinning an exact set: a dropped or renamed column still
// fails, while a column added by the other tenant does not.
describe('vitals_readings schema', () => {
  it('has the columns this app depends on', async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    try {
      const res = await client.query(
        `select column_name from information_schema.columns where table_name = 'vitals_readings' order by column_name`
      )
      const columns = res.rows.map((r) => r.column_name)
      expect(columns).toEqual(
        expect.arrayContaining(['id', 'payload', 'recorded_at', 'recorded_by', 'visit_id'])
      )
    } finally {
      await client.end()
    }
  })
})
