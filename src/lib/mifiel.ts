import crypto from "crypto"

const MIFIEL_API_URL = process.env.MIFIEL_API_URL || "https://app-sandbox.mifiel.com/api/v1"

function getMifielHeaders(method: string, path: string, body?: string) {
  const timestamp = new Date().toISOString()
  const contentMd5 = body
    ? crypto.createHash("md5").update(body).digest("base64")
    : ""
  const contentType = "application/json"
  const stringToSign = [method, contentMd5, contentType, timestamp, path].join(
    "\n"
  )
  const signature = crypto
    .createHmac("sha1", process.env.MIFIEL_APP_SECRET!)
    .update(stringToSign)
    .digest("base64")
  return {
    "Content-Type": contentType,
    Date: timestamp,
    Authorization: `APIAuth ${process.env.MIFIEL_APP_ID}:${signature}`,
    ...(contentMd5 && { "Content-MD5": contentMd5 }),
  }
}

export interface MifielSigner {
  name: string
  email: string
  tax_id?: string
}

export interface CreateDocumentParams {
  file_name: string
  signers: MifielSigner[]
  content?: string
  callback_url?: string
}

export interface MifielDocument {
  id: string
  original_hash: string
  name: string
  signed_hash?: string
  signed: boolean
  signed_at?: string
  status: Array<{ email: string; signed: boolean; signed_at?: string }>
  widget_id: string
  callback_url?: string
  file?: string
}

export async function createMifielDocument(
  params: CreateDocumentParams
): Promise<MifielDocument> {
  const path = "/api/v1/documents"
  const body = JSON.stringify({
    file_name: params.file_name,
    signers: params.signers,
    content: params.content || "Contrato de arrendamiento — BaW OS",
    callback_url: params.callback_url,
  })
  const headers = getMifielHeaders("POST", path, body)
  const res = await fetch(`${MIFIEL_API_URL}/documents`, {
    method: "POST",
    headers,
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Mifiel API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function getMifielDocument(
  id: string
): Promise<MifielDocument> {
  const path = `/api/v1/documents/${id}`
  const headers = getMifielHeaders("GET", path)
  const res = await fetch(`${MIFIEL_API_URL}/documents/${id}`, {
    method: "GET",
    headers,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Mifiel API error ${res.status}: ${text}`)
  }
  return res.json()
}
