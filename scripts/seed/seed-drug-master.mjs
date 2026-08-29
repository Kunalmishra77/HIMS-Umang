import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const drugs = [
  { id: 'DM-PCM', genericName: 'Paracetamol', brandNames: ['Crocin', 'Dolo'], form: 'Tablet', strength: '500 mg', schedule: 'OTC', contraindications: ['Severe hepatic impairment'], interactions: ['Warfarin'], allergyClasses: [], maxDailyDoseMg: 4000 },
  { id: 'DM-AMX', genericName: 'Amoxicillin', brandNames: ['Mox', 'Novamox'], form: 'Capsule', strength: '500 mg', schedule: 'H', contraindications: ['Penicillin allergy'], interactions: [], allergyClasses: ['Penicillin'], maxDailyDoseMg: 3000 },
  { id: 'DM-ASA', genericName: 'Aspirin', brandNames: ['Ecosprin'], form: 'Tablet', strength: '75 mg', schedule: 'OTC', contraindications: ['Active GI bleed'], interactions: ['Warfarin', 'Clopidogrel'], allergyClasses: ['NSAID'], maxDailyDoseMg: 300 },
  { id: 'DM-ATOR', genericName: 'Atorvastatin', brandNames: ['Atorva', 'Lipitor'], form: 'Tablet', strength: '40 mg', schedule: 'H', contraindications: ['Active liver disease'], interactions: ['Clarithromycin'], allergyClasses: [], maxDailyDoseMg: 80 },
  { id: 'DM-CLOP', genericName: 'Clopidogrel', brandNames: ['Plavix', 'Clopilet'], form: 'Tablet', strength: '75 mg', schedule: 'H', contraindications: ['Active bleeding'], interactions: ['Aspirin', 'Omeprazole'], allergyClasses: [], maxDailyDoseMg: 75 },
  { id: 'DM-MET', genericName: 'Metformin', brandNames: ['Glycomet'], form: 'Tablet', strength: '500 mg', schedule: 'H', contraindications: ['eGFR < 30'], interactions: ['Contrast media'], allergyClasses: [], maxDailyDoseMg: 2000 },
  { id: 'DM-MORPH', genericName: 'Morphine', brandNames: ['Morcontin'], form: 'Injection', strength: '10 mg/mL', schedule: 'X', contraindications: ['Respiratory depression'], interactions: ['Benzodiazepines'], allergyClasses: ['Opioid'], maxDailyDoseMg: 60, requiresDualSignature: true },
  { id: 'DM-DICLO', genericName: 'Diclofenac', brandNames: ['Voveran'], form: 'Tablet', strength: '50 mg', schedule: 'H', contraindications: ['Peptic ulcer'], interactions: ['ACE inhibitors'], allergyClasses: ['NSAID'], maxDailyDoseMg: 150 },
];
for (const d of drugs) await c.query(`insert into drug_master (id,data) values ($1,$2::jsonb) on conflict (id) do nothing`, [d.id, JSON.stringify(d)]);
console.log('drug_master rows:', (await c.query('select count(*)::int n from drug_master')).rows[0].n);
await c.end();
