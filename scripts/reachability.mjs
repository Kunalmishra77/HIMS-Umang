// Walks the '@/' and relative import graph from every kept route entry point and
// reports which files under src/ are reachable. Out-of-scope code that is still
// reachable means a barrel is dragging it in; unreachable code is safe to delete.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')
const slash = (p) => p.split(path.sep).join('/')

const KEEP_ROUTES = [
  'src/app/page.tsx', 'src/app/layout.tsx', 'src/app/globals.css',
  'src/app/actions', 'src/middleware.ts', 'src/i18n',
  'src/app/login', 'src/app/checkin', 'src/app/p', 'src/app/discovery', 'src/app/abha',
  'src/app/billing',
  'src/app/reception/layout.tsx',
  ...['dashboard', 'register', 'opd', 'queue', 'appointments', 'patients', 'journey',
      'billing', 'messages', 'downloads', 'reports', 'setup'].map((s) => `src/app/reception/${s}`),
  'src/app/nurse/layout.tsx',
  ...['dashboard', 'vitals-requests', 'patients', 'tasks', 'messages',
      'ai-assistant'].map((s) => `src/app/nurse/${s}`),
  'src/app/doctor/layout.tsx',
  ...['dashboard', 'consultation', 'records', 'schedule', 'inbox', 'analytics', 'settings',
      'ai-assistant'].map((s) => `src/app/doctor/${s}`),
  'src/app/patient/layout.tsx',
  ...['dashboard', 'appointments', 'queue', 'waiting', 'consultations', 'records',
      'medications', 'orders', 'downloads', 'billing', 'profile', 'settings', 'feedback',
      'followup', 'health-story', 'help', 'ai-care', 'assistant'].map((s) => `src/app/patient/${s}`),
  ...['auth/session', 'ai/complete', 'intake/turn', 'voice/tts', 'opd-register', 'opd-queue',
      'opd-advance', 'opd-order', 'whatsapp/send', 'whatsapp/webhook'].map((s) => `src/app/api/${s}`),
]

const EXT = ['.ts', '.tsx', '.mjs', '.js', '.json', '.css']
const TESTRE = new RegExp('__tests__|[.]test[.]|[.]spec[.]')
const IMPORTRE = new RegExp('(?:from|import|require)\\s*\\(?\\s*[\'"]([^\'"]+)[\'"]', 'g')

const all = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else all.push(slash(p))
  }
})(SRC)

const rel = (f) => slash(f).replace(slash(ROOT) + '/', '')
const isTest = (f) => TESTRE.test(f)

const seeds = all.filter((f) => {
  if (isTest(f)) return false
  const r = rel(f)
  return KEEP_ROUTES.some((k) => r === k || r.startsWith(k + '/'))
})

function resolve(spec, fromFile) {
  let base
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
  else return null
  base = slash(base)
  for (const e of EXT) if (fs.existsSync(base + e)) return base + e
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    for (const e of EXT) if (fs.existsSync(base + '/index' + e)) return base + '/index' + e
    return null
  }
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base
  return null
}

const seen = new Set()
const missing = new Set()
const queue = [...seeds]
while (queue.length) {
  const f = queue.pop()
  if (seen.has(f) || !fs.existsSync(f)) continue
  seen.add(f)
  if (!new RegExp('[.](ts|tsx|mjs|js)$').test(f)) continue
  for (const m of fs.readFileSync(f, 'utf8').matchAll(IMPORTRE)) {
    const s = m[1]
    if (!s.startsWith('@/') && !s.startsWith('.')) continue
    const r = resolve(s, f)
    if (r) queue.push(r)
    else missing.add(rel(f) + '  ->  ' + s)
  }
}

const reached = new Set([...seen].map(rel))
const dead = all.map(rel).filter((r) => !reached.has(r) && !isTest(r))

const bucket = (list) => {
  const m = {}
  for (const r of list) {
    const parts = r.split('/')
    m[parts.length > 3 ? parts.slice(1, 3).join('/') : parts.slice(1).join('/')] =
      (m[parts.length > 3 ? parts.slice(1, 3).join('/') : parts.slice(1).join('/')] || 0) + 1
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1])
}

console.log('SEEDS:    ', seeds.length)
console.log('REACHABLE:', reached.size)
console.log('DEAD:     ', dead.length)
console.log('\n=== DEAD by area ===')
if (dead.length === 0) console.log('  (none)')
for (const [k, v] of bucket(dead)) console.log(String(v).padStart(4), k)
console.log('\n=== UNRESOLVED imports ===')
if (missing.size === 0) console.log('  (none)')
for (const m of missing) console.log('  ' + m)

fs.writeFileSync(path.join(ROOT, 'scripts/.reach-keep.txt'), [...reached].sort().join('\n'))
fs.writeFileSync(path.join(ROOT, 'scripts/.reach-dead.txt'), dead.sort().join('\n'))

if (missing.size > 0) process.exit(1)
