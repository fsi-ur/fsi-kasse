import { defineEventHandler } from 'h3'

// Unauthenticated reachability probe for the offline mode. It deliberately
// skips the database
export default defineEventHandler(() => ({ ok: true }))
