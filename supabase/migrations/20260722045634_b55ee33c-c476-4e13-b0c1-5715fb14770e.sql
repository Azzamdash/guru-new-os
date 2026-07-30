
-- ========= 1) Extend app_role enum =========
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'data_entry';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'education';
