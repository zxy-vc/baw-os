import { NextRequest, NextResponse } from "next/server"
import { createServiceClient, apiError, apiOk } from "@/lib/api-auth"
import { createMifielDocument } from "@/lib/mifiel"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const { contract_id, signers } = await request.json()

    if (!contract_id || !signers?.length) {
      return apiError("contract_id and signers are required", 400)
    }

    const supabase = createServiceClient()

    // Fetch contract with tenant info
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select(
        "*, unit:units(number, floor), occupant:occupants(name, email, phone)"
      )
      .eq("id", contract_id)
      .single()

    if (contractError || !contract) {
      return apiError("Contract not found", 404)
    }

    const occupant = contract.occupant as {
      name: string
      email?: string
    } | null
    const unit = contract.unit as { number: string; floor?: number } | null

    // Build a text-based contract content for Mifiel
    const content = [
      "CONTRATO DE ARRENDAMIENTO",
      "",
      `Inquilino: ${occupant?.name || "—"}`,
      `Unidad: ${unit?.number || "—"}`,
      `Renta mensual: $${contract.monthly_amount}`,
      `Fecha inicio: ${contract.start_date}`,
      `Fecha fin: ${contract.end_date || "Indefinido"}`,
      `Día de pago: ${contract.payment_day}`,
      "",
      "Este documento se firma digitalmente a través de Mifiel.",
    ].join("\n")

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://baw-os.vercel.app"

    const mifielDoc = await createMifielDocument({
      file_name: `contrato-${unit?.number || contract_id}.pdf`,
      signers: signers.map((s: { name: string; email: string }) => ({
        name: s.name,
        email: s.email,
      })),
      content,
      callback_url: `${appUrl}/api/mifiel/webhook`,
    })

    // Save mifiel_document_id and update signature_status
    await supabase
      .from("contracts")
      .update({
        mifiel_document_id: mifielDoc.id,
        signature_status: "pending",
      })
      .eq("id", contract_id)

    const widgetUrl = `https://app-sandbox.mifiel.com/widget/${mifielDoc.widget_id}`

    return apiOk({
      documentId: mifielDoc.id,
      widgetUrl,
      status: "pending",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return apiError(message, 500)
  }
}
