import type { H3Event } from 'h3'
import { getRequestHeader, readRawBody } from 'h3'

function parseContentDisposition(value: string) {
  const parsed: { name?: string, filename?: string } = {}
  for (const part of value.split(';')) {
    const [rawKey, ...rawValue] = part.split('=')
    const key = rawKey?.trim().toLowerCase()
    const value = rawValue.join('=').trim().replace(/^"|"$/g, '')
    if (key === 'name') parsed.name = Buffer.from(value, 'latin1').toString('utf8')
    if (key === 'filename') parsed.filename = Buffer.from(value, 'latin1').toString('utf8')
  }
  return parsed
}

function parseMultipartBuffer(body: Buffer, boundary: string) {
  const boundaryBuffer = Buffer.from(`--${boundary}`, 'utf8')
  const headerSeparator = Buffer.from('\r\n\r\n', 'utf8')
  const nextBoundaryPrefix = Buffer.from(`\r\n--${boundary}`, 'utf8')
  const formData: Array<{ name?: string, filename?: string, type?: string, data: Buffer }> = []
  let boundaryOffset = body.indexOf(boundaryBuffer)

  while (boundaryOffset !== -1) {
    let partStart = boundaryOffset + boundaryBuffer.length
    if (body.subarray(partStart, partStart + 2).toString('utf8') === '--') break
    if (body.subarray(partStart, partStart + 2).toString('utf8') === '\r\n') partStart += 2

    const headerEnd = body.indexOf(headerSeparator, partStart)
    if (headerEnd === -1) throw new Error('Invalid multipart upload')

    const headers = body.subarray(partStart, headerEnd).toString('utf8').split('\r\n')
    const headerMap = new Map<string, string>()
    for (const header of headers) {
      const separator = header.indexOf(':')
      if (separator <= 0) continue
      headerMap.set(header.slice(0, separator).trim().toLowerCase(), header.slice(separator + 1).trim())
    }

    const dataStart = headerEnd + headerSeparator.length
    const nextBoundaryOffset = body.indexOf(nextBoundaryPrefix, dataStart)
    if (nextBoundaryOffset === -1) throw new Error('Invalid multipart upload')

    const disposition = parseContentDisposition(headerMap.get('content-disposition') || '')
    formData.push({
      ...disposition,
      type: headerMap.get('content-type'),
      data: body.subarray(dataStart, nextBoundaryOffset),
    })

    boundaryOffset = nextBoundaryOffset + 2
  }

  return formData
}

export async function readMultipart(event: H3Event) {
  const contentType = getRequestHeader(event, 'content-type') || ''
  const boundary = contentType.match(/boundary=([^;]*)(;|$)/i)?.[1]?.replace(/^"|"$/g, '')
  if (!contentType.startsWith('multipart/form-data') || !boundary) return null

  const body = await readRawBody(event, false)
  if (!body) return null

  const formData = parseMultipartBuffer(Buffer.isBuffer(body) ? body : Buffer.from(body), boundary)

  const getField = (name: string) =>
    formData.find(field => field.name === name)?.data?.toString()

  const file = formData.find(field => field.filename) ?? null

  return {
    formData,
    getField,
    file,
  }
}
