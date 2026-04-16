-- BaW OS — Tier 1A media + spaces schema

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS description_short text,
  ADD COLUMN IF NOT EXISTS description_long text,
  ADD COLUMN IF NOT EXISTS amenities jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS unit_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('bedroom','bathroom','kitchen','living_room','dining_room','workspace','balcony','terrace','laundry','exterior','other')),
  sort_order integer NOT NULL DEFAULT 0,
  description text,
  cover_asset_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  unit_space_id uuid REFERENCES unit_spaces(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'image' CHECK (kind IN ('image','floorplan','document','video')),
  visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','public')),
  title text,
  alt_text text,
  caption text,
  storage_bucket text,
  storage_path text,
  file_url text,
  mime_type text,
  sort_order integer NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE unit_spaces
  DROP CONSTRAINT IF EXISTS unit_spaces_cover_asset_id_fkey;
ALTER TABLE unit_spaces
  ADD CONSTRAINT unit_spaces_cover_asset_id_fkey
  FOREIGN KEY (cover_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_unit_spaces_unit_id ON unit_spaces(unit_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_media_assets_unit_id ON media_assets(unit_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_media_assets_unit_space_id ON media_assets(unit_space_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_units_slug_unique ON units(slug) WHERE slug IS NOT NULL;

ALTER TABLE unit_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_unit_spaces ON unit_spaces;
CREATE POLICY allow_all_unit_spaces ON unit_spaces FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_media_assets ON media_assets;
CREATE POLICY allow_all_media_assets ON media_assets FOR ALL USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('unit-media', 'unit-media', true)
ON CONFLICT (id) DO NOTHING;
