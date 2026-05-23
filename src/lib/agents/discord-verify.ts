/**
 * BaW OS — Discord Ed25519 signature verification (Sprint 5A WS-1)
 *
 * Verifica la firma Ed25519 de Discord usando la Web Crypto API nativa.
 * NO usa tweetnacl ni ninguna dependencia externa — solo Web Crypto (disponible
 * en Edge Runtime y Node.js ≥18). Esto evita deps nuevas y es más sólido.
 *
 * Referencias:
 *  - https://discord.com/developers/docs/interactions/receiving-and-responding
 *  - https://discord.com/developers/docs/reference#message-formatting
 */

/**
 * Importa la clave pública Ed25519 del bot Discord en formato SubtleCrypto.
 * La clave se provee como hex string (como la devuelve el portal de Discord).
 */
async function importDiscordPublicKey(publicKeyHex: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(
    publicKeyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
  )
  return crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'Ed25519' },
    false,
    ['verify']
  )
}

/**
 * Verifica la firma Ed25519 de un request Discord.
 *
 * Discord firma con: signature = Ed25519Sign(timestamp + body_as_string)
 *
 * @param signature  - Header X-Signature-Ed25519 (hex)
 * @param timestamp  - Header X-Signature-Timestamp (unix epoch como string)
 * @param rawBody    - Body crudo del request como string UTF-8
 * @param publicKeyHex - Clave pública del bot en hex (DISCORD_PUBLIC_KEY env var)
 * @returns true si la firma es válida
 */
export async function verifyDiscordSignature(
  signature: string,
  timestamp: string,
  rawBody: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    const publicKey = await importDiscordPublicKey(publicKeyHex)

    const sigBytes = new Uint8Array(
      signature.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
    )

    const message = new TextEncoder().encode(timestamp + rawBody)

    return await crypto.subtle.verify('Ed25519', publicKey, sigBytes, message)
  } catch {
    // Cualquier error de parse/crypto = firma inválida
    return false
  }
}

/**
 * Extrae y verifica los headers de firma de un NextRequest.
 * Devuelve { valid: true, rawBody } o { valid: false }.
 */
export async function verifyDiscordRequest(
  req: Request,
  publicKeyHex: string
): Promise<{ valid: true; rawBody: string } | { valid: false }> {
  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')

  if (!signature || !timestamp) {
    return { valid: false }
  }

  // Previene replay attacks: rechaza si el timestamp tiene >5 minutos de drift
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return { valid: false }
  }

  // Leer el body una sola vez (stream no se puede releer)
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch {
    return { valid: false }
  }

  const valid = await verifyDiscordSignature(signature, timestamp, rawBody, publicKeyHex)
  if (!valid) return { valid: false }

  return { valid: true, rawBody }
}
