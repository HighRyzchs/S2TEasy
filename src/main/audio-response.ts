/** Chrome's media element uses byte ranges for seeking. Never exposes a local path. */
export function audioResponse(wav: Uint8Array, range: string | null): Response {
  const headers = {
    'Content-Type': 'audio/wav',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store'
  }
  if (!range)
    return new Response(new Uint8Array(wav), {
      headers: { ...headers, 'Content-Length': String(wav.length) }
    })
  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  const start = match?.[1] ? Number(match[1]) : Math.max(0, wav.length - Number(match?.[2]))
  const end = match?.[1] && match[2] ? Math.min(wav.length - 1, Number(match[2])) : wav.length - 1
  if (
    !match ||
    (!match[1] && !match[2]) ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= wav.length
  )
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${wav.length}` }
    })
  return new Response(new Uint8Array(wav.subarray(start, end + 1)), {
    status: 206,
    headers: {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${wav.length}`,
      'Content-Length': String(end - start + 1)
    }
  })
}
