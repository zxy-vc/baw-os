-- Add task_type column for housekeeping categorization
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type TEXT;
