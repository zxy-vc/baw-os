// BaW OS — Helpers de respuesta consistente para v1 API
// Formato: { success, data?, error?, pagination? }

import { NextResponse } from 'next/server'

export interface ApiSuccess<T> {
  success: true
  data: T
  pagination?: {
    next_cursor?: string | null
    limit: number
  }
}

export interface ApiError {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export function v1Ok<T>(
  data: T,
  pagination?: { next_cursor?: string | null; limit: number }
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data, pagination })
}

export function v1Error(
  code: string,
  message: string,
  status = 400,
  details?: unknown
): NextResponse<ApiError> {
  return NextResponse.json(
    { success: false, error: { code, message, details } },
    { status }
  )
}

export function v1Pending(approvalId: string, expiresAt: string): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data: {
        status: 'pending_approval',
        approval_id: approvalId,
        expires_at: expiresAt,
        message:
          'Acción registrada y en cola de aprobación humana. Consulta /v1/approvals/:id para estado.',
      },
    },
    { status: 202 }
  )
}

export function v1Disabled(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'agent_disabled',
        message: 'Este agente está deshabilitado en esta org (autonomy_level=0).',
      },
    },
    { status: 403 }
  )
}
