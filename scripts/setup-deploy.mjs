import { spawn } from 'node:child_process'

const steps = [
  { label: 'events migration', command: 'node', args: ['scripts/migrate-events.mjs'], required: true, attempts: 6 },
  { label: 'app settings migration', command: 'node', args: ['scripts/migrate-app-settings.mjs'], required: true, attempts: 6 },
  { label: 'donations migration', command: 'node', args: ['scripts/migrate-add-donations.mjs'], required: true, attempts: 6 },
  { label: 'item price snapshots migration', command: 'node', args: ['scripts/migrate-item-price-snapshots.mjs'], required: true, attempts: 6 },
  { label: 'admin seed', command: 'node', args: ['scripts/seed-admin.mjs'], required: true, attempts: 6 },
  { label: 'connection database user', command: 'node', args: ['scripts/create-connection-db-user.mjs'], required: false },
]

const RETRY_DELAY_MS = 5000

function timestamp() {
  return new Date().toISOString()
}

function runStep(step) {
  console.log(`[setup-deploy ${timestamp()}] starting ${step.label}`)

  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    child.on('close', (code, signal) => {
      if (code === 0) {
        console.log(`[setup-deploy ${timestamp()}] completed ${step.label}`)
        resolve(true)
        return
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`
      const message = `[setup-deploy ${timestamp()}] ${step.label} failed with ${reason}`

      if (step.required) {
        console.error(message)
        resolve(false)
        return
      }

      console.warn(`${message}; continuing because this step is optional for serving the app`)
      resolve(true)
    })

    child.on('error', (error) => {
      const message = `[setup-deploy ${timestamp()}] ${step.label} failed to start: ${error.message}`

      if (step.required) {
        console.error(message)
        resolve(false)
        return
      }

      console.warn(`${message}; continuing because this step is optional for serving the app`)
      resolve(true)
    })
  })
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

for (const step of steps) {
  const attempts = step.attempts ?? 1
  let ok = false

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) {
      console.log(`[setup-deploy ${timestamp()}] retrying ${step.label} (${attempt}/${attempts})`)
    }

    ok = await runStep(step)
    if (ok) break

    if (attempt < attempts) {
      console.log(`[setup-deploy ${timestamp()}] waiting ${RETRY_DELAY_MS / 1000}s before retrying ${step.label}`)
      await wait(RETRY_DELAY_MS)
    }
  }

  if (!ok) process.exit(1)
}

console.log(`[setup-deploy ${timestamp()}] complete`)
