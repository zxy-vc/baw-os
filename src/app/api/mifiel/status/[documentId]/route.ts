import { NextRequest } from "next/server"
import { apiError, apiOk } from "@/lib/api-auth"
import { getMifielDocument } from "@/lib/mifiel"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params

    if (!documentId) {
      return apiError("documentId is required", 400)
    }

    const doc = await getMifielDocument(documentId)

    const signers = (doc.status || []).map((s) => ({
      email: s.email,
      signed: s.signed,
      signedAt: s.signed_at || null,
    }))

    return apiOk({
      status: doc.signed ? "signed" : "pending",
      signers,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return apiError(message, 500)
  }
}
