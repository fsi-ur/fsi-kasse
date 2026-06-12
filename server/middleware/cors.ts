import { defineEventHandler, getHeader, setResponseHeaders, setResponseStatus } from 'h3'

// Allows the accounting application to call the cash register API from a
// different origin (e.g. when the two apps are not served behind the same
// reverse proxy path). Disabled unless ACCOUNTING_APP_ORIGINS is set.
const allowedOrigins = (process.env.ACCOUNTING_APP_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean)

export default defineEventHandler((event) => {
  if (!allowedOrigins.length) return
  if (!event.path.startsWith('/api/')) return

  const origin = getHeader(event, 'origin')
  if (!origin || !allowedOrigins.includes(origin.replace(/\/$/, ''))) return

  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  })

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }
})
