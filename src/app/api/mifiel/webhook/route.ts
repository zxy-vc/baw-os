import { NextRequest } from "next/server"
import { createServiceClient, apiError, apiOk, timingSafeEqualStr } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    // Guard: antes CUALQUIERA podía POSTear {document_id, status:'signed'} y
    // marcar un contrato como firmado (integridad legal). Ahora se exige un
    // secreto compartido que Fran configura en la URL del webhook de Mifiel
    // (?secret=<valor> o header x-webhook-secret).
    const expected = process.env.MIFIEL_WEBHOOK_SECRET
    const provided =
      request.headers.get('x-webhook-secret') ||
      new URL(request.url).searchParams.get('secret') ||
      ''
    if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
      return apiError('Unauthorized', 401)
    }

    const body = await request.json()
    const documentId = body.document_id || body.id

    if (!documentId) {
      return apiError("Missing document_id", 400)
    }

    const signed =
      body.signed === true ||
      body.status === "signed" ||
      body.status === "completed"

    if (!signed) {
      return apiOk({ received: true, action: "none" })
    }

    const supabase = createServiceClient()

    const { error } = await supabase
      .from("contracts")
      .update({ signature_status: "signed" })
      .eq("mifiel_document_id", documentId)

    if (error) {
      return apiError("Failed to update contract", 500)
    }

    return apiOk({ received: true, action: "updated" })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return apiError(message, 500)
  }
}
