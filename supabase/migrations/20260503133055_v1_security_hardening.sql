BEGIN;

-- 1. v_agent_credentials_audit: cambiar a security_invoker para que respete RLS del caller
ALTER VIEW public.v_agent_credentials_audit SET (security_invoker = true);

-- 2. touch_agent_policy: fijar search_path explicito
CREATE OR REPLACE FUNCTION public.touch_agent_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. Revocar EXECUTE de anon en helpers internos
REVOKE EXECUTE ON FUNCTION public.purge_expired_idempotency() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.expire_pending_approvals() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.touch_agent_credential(UUID) FROM anon, public;

-- Solo service_role puede correr los crons internos
GRANT EXECUTE ON FUNCTION public.purge_expired_idempotency() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_pending_approvals() TO service_role;
-- touch_agent_credential se llama desde server-side; queda solo service_role

COMMIT;
