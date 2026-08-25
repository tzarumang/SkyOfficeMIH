import fs from 'fs'
import path from 'path'
import { describe, generateOffice } from './index'
import { clampOfficeSpec, OFFICE_SPEC_FIELDS, OfficeSpec } from '../../types/Office'

/**
 * Draws an office and writes it out as a Tiled map.
 *
 *   yarn office:generate --seed 7
 *   yarn office:generate --seed 7 --meetingRooms 3 --plainDesks 24
 *   yarn office:generate --seed 7 --out client/public/assets/map/map.json
 *
 * Pointing --out at map.json replaces the office the whole app runs in, since
 * that is the file both the client and the server read.
 */

function flag(name: string, fallback?: string) {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback
}

const seed = Number(flag('seed', String(Math.floor(Date.now() % 100000))))
if (!Number.isFinite(seed)) {
  console.error('--seed must be a number')
  process.exit(1)
}

const out = path.resolve(
  flag('out', path.join('client', 'public', 'assets', 'map', 'generated.json'))!
)

// Whatever of the spec was asked for on the command line; the rest is left
// at the default, so `--seed 7` alone still draws an office.
const asked: Partial<OfficeSpec> = {}
for (const field of OFFICE_SPEC_FIELDS) {
  const given = flag(field.key)
  if (given === undefined) continue
  const count = Number(given)
  if (!Number.isFinite(count)) {
    console.error(`--${field.key} must be a number`)
    process.exit(1)
  }
  asked[field.key] = count
}

const office = generateOffice({
  seed,
  spec: Object.keys(asked).length > 0 ? clampOfficeSpec(asked) : undefined,
})
const summary = describe(office)

console.log(`seed ${seed} - ${summary.size} tiles`)
for (const room of summary.rooms) console.log(`  ${room}`)
console.log(`  items: ${JSON.stringify(summary.items)}`)

if (office.problems.length > 0) {
  console.error(`\n${office.problems.length} problem(s):`)
  for (const problem of office.problems)
    console.error(`  - ${problem.invariant}: ${problem.detail}`)
  process.exit(1)
}

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(office.map))
console.log(`\nwrote ${out}`)
