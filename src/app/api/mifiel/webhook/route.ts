import { NextRequest } from "next/server"
import { createServiceClient, apiError, apiOk } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
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
