-- Sprint 4 / S4-2: Owner Portal v2 con login real
--
-- Elimina la dependencia del OWNER_TOKEN compartido. Cada owner se loguea con
-- su email y ve solo los edificios donde tiene ownership_stake activo.

CREATE TABLE IF NOT EXISTS owner_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_owner_id uuid NOT NULL REFERENCES property_owners(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by uuid REFERENCES auth.users(id),
  invite_token text UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_owner_invites_org ON owner_invites(org_id);
CREATE INDEX IF NOT EXISTS idx_owner_invites_email ON owner_invites(lower(email));
CREATE INDEX IF NOT EXISTS idx_owner_invites_token ON owner_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_owner_invites_property_owner ON owner_invites(property_owner_id);

ALTER TABLE owner_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_invites_pm_admins_all" ON owner_invites;
CREATE POLICY "owner_invites_pm_admins_all" ON owner_invites
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM org_members m
      WHERE m.org_id = owner_invites.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('pm_owner', 'pm_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members m
      WHERE m.org_id = owner_invites.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('pm_owner', 'pm_admin')
    )
  );

DROP POLICY IF EXISTS "owner_invites_self_read" ON owner_invites;
CREATE POLICY "owner_invites_self_read" ON owner_invites
  FOR SELECT
  USING (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

CREATE INDEX IF NOT EXISTS idx_property_owners_user_id ON property_owners(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_owners_email ON property_owners(lower(email)) WHERE email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_property_owner_user()
RETURNS trigger AS $$
BEGIN
  UPDATE property_owners
  SET user_id = NEW.id, updated_at = now()
  WHERE lower(email) = lower(NEW.email)
    AND user_id IS NULL;

  UPDATE owner_invites
  SET status = 'accepted', accepted_at = now()
  WHERE lower(email) = lower(NEW.email)
    AND status = 'pending';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS link_property_owner_on_user_create ON auth.users;
CREATE TRIGGER link_property_owner_on_user_create
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_property_owner_user();
