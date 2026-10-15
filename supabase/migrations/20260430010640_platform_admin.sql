-- Sprint 4 / S4-1.5: Platform Admin Console + User Preferences
--
-- Arquitectura de 3 capas de admin:
--   L0 Platform   → tabla platform_admins (acceso a /admin, ZXY only)
--   L1 Tenant     → org_members.role = 'pm_owner' | 'pm_admin' (existente)
--   L2 User       → tabla user_preferences (preferencias personales)
--
-- L0 admins son SOLO ZXY humanos (fran@zxy.vc). Los agentes ZXY
-- (Hugo-COS, Alicia-Ops, Conta-Beto, Maribel-Law, Luis-Growth, Andres-Tech)
-- NO tienen acceso L0 propio — actúan dentro del tenant que los contrata.

-- ──────────────────────────────────────────────────────────────────────
-- Platform Admins (L0)
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_user_id ON platform_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON platform_admins(lower(email));

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- Solo platform admins pueden leer la tabla. Service role bypass aplica.
DROP POLICY IF EXISTS "platform_admins_self_read" ON platform_admins;
CREATE POLICY "platform_admins_self_read" ON platform_admins
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Seed inicial: solo fran@zxy.vc (no mezclar con personal franduranv@gmail.com)
INSERT INTO platform_admins (email, granted_by, notes)
VALUES ('fran@zxy.vc', 'system:seed-s4-1.5', 'L0 ZXY founder')
ON CONFLICT (email) DO NOTHING;

-- Trigger para enlazar user_id cuando el usuario se registre
CREATE OR REPLACE FUNCTION public.link_platform_admin_user()
RETURNS trigger AS $$
BEGIN
  UPDATE platform_admins
  SET user_id = NEW.id
  WHERE lower(email) = lower(NEW.email)
    AND user_id IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS link_platform_admin_on_user_create ON auth.users;
CREATE TRIGGER link_platform_admin_on_user_create
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_platform_admin_user();

-- ──────────────────────────────────────────────────────────────────────
-- User Preferences (L2)
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'es',
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  notification_prefs jsonb NOT NULL DEFAULT '{"email": true, "whatsapp": true, "in_app": true}'::jsonb,
  theme text NOT NULL DEFAULT 'dark',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_preferences_self_all" ON user_preferences;
CREATE POLICY "user_preferences_self_all" ON user_preferences
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION public.touch_user_preferences()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_user_preferences_trg ON user_preferences;
CREATE TRIGGER touch_user_preferences_trg
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_preferences();
