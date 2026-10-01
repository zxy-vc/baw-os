-- BaW OS — Settings MVP (profile + organization + access)
-- Includes user_id generated column alias for compat with /me and ProfileMenu queries

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  job_title text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add user_id as a generated alias of id to match existing code that filters .eq('user_id', auth.uid())
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS user_id uuid GENERATED ALWAYS AS (id) STORED;
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invited_email text;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_allow_all ON public.user_profiles;
CREATE POLICY user_profiles_allow_all ON public.user_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS org_members_allow_all ON public.org_members;
CREATE POLICY org_members_allow_all ON public.org_members FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN
  CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
