import { Client } from 'pg'
import { describe, expect, it } from 'vitest'

// Umang shares this database with Gov-HIMS (see README), so the column set is
// not ours alone to fix — Gov-HIMS's multi-tenant work added `hospital_id` and
// `branch_id` to these tables. Assert the columns this app reads and writes are
// present rather than pinning an exact set: a dropped or renamed column still
// fails, while a column added by the other tenant does not.
describe('pharmacy schema', () => {
  it('pharmacy_dispenses table exists with expected columns', async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    try {
      const expectedCols = [
        'id', 'prescription_id', 'patient_id', 'patient_name', 'token_number',
        'doctor_name', 'department', 'source', 'payment_mode', 'medicines',
        'status', 'dispatched_at', 'estimated_ready_in', 'notes', 'triage_level',
        'patient_modifications', 'procurement_status', 'requested_by_ward_at',
        'ward_bed', 'quantity_modifications', 'adjusted_bill_total',
        'original_bill_total', 'assigned_to', 'dispensed_by', 'collected_by',
        'collected_at', 'updated_at',
      ]
      const res = await client.query(
        `select column_name from information_schema.columns where table_name = $1`, ['pharmacy_dispenses']
      )
      const columns = res.rows.map((r) => r.column_name).sort()
      expect(columns).toEqual(expect.arrayContaining(expectedCols))
    } finally {
      await client.end()
    }
  })

  it('pharmacy_stock_items table exists with expected columns', async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    try {
      const expectedCols = ['id', 'name', 'category', 'qty', 'unit', 'reorder_at', 'max_stock', 'schedule', 'updated_at']
      const res = await client.query(
        `select column_name from information_schema.columns where table_name = $1`, ['pharmacy_stock_items']
      )
      const columns = res.rows.map((r) => r.column_name).sort()
      expect(columns).toEqual(expect.arrayContaining(expectedCols))
    } finally {
      await client.end()
    }
  })

  it('pharmacy_purchase_orders table exists with expected columns', async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    try {
      const expectedCols = ['id', 'drug', 'qty', 'kind', 'for_patient', 'raised_by', 'status', 'raised_at', 'updated_at']
      const res = await client.query(
        `select column_name from information_schema.columns where table_name = $1`, ['pharmacy_purchase_orders']
      )
      const columns = res.rows.map((r) => r.column_name).sort()
      expect(columns).toEqual(expect.arrayContaining(expectedCols))
    } finally {
      await client.end()
    }
  })

  it('narcotics_log table exists with expected columns', async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    try {
      const expectedCols = [
        'id', 'drug', 'date', 'time', 'patient', 'patient_id', 'dose',
        'prescriber', 'dispenser', 'second_signatory', 'batch_no', 'running_stock',
      ]
      const res = await client.query(
        `select column_name from information_schema.columns where table_name = $1`, ['narcotics_log']
      )
      const columns = res.rows.map((r) => r.column_name).sort()
      expect(columns).toEqual(expect.arrayContaining(expectedCols))
    } finally {
      await client.end()
    }
  })
})
