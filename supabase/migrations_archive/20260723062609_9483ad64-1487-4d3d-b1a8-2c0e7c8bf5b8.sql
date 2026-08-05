ALTER TYPE public.marketing_platform ADD VALUE IF NOT EXISTS 'influencer';
ALTER TYPE public.marketing_platform ADD VALUE IF NOT EXISTS 'ugc';
ALTER TYPE public.marketing_platform ADD VALUE IF NOT EXISTS 'media_production';
DELETE FROM public.expense_categories WHERE slug IN ('marketing_influencer','marketing_ugc','marketing_media_production');