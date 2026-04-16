-- BaW OS — Settings MVP (profile + organization + access)

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  job_title text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE org_members
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invited_email text;

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_allow_all ON user_profiles;
CREATE POLICY user_profiles_allow_all ON user_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS org_members_allow_all ON org_members;
CREATE POLICY org_members_allow_all ON org_members FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
