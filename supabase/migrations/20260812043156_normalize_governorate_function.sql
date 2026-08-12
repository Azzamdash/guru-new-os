-- Courier rates are keyed by governorate name, and the two sides never agreed.
--
-- Rates are entered from the couriers page, whose list is Arabic ("القاهرة").
-- Orders synced from Shopify take shipping_governorate from addr.province,
-- which is English ("Cairo", "Giza", "Al Sharqia"). Both accrual functions
-- match with lower(btrim(governorate)) = lower(btrim(shipping_governorate)),
-- so those two can never be equal and EVERY synced order falls through to
-- COALESCE(charge_amount, 0) -- a silent zero fee, no matter how completely
-- the rate card is filled in.
--
-- Match on a normalised key instead of the raw string. normalize_governorate
-- folds the two spellings onto one value by, in order: lowercasing and
-- collapsing whitespace; treating - and _ as spaces; flattening Arabic letter
-- variants that carry no distinction here (أإآ -> ا, ة -> ه, ى -> ي); dropping a
-- leading article, Arabic ال or transliterated "al "/"el "; then mapping the
-- known English spellings of all 27 governorates onto the normalised Arabic.
-- Anything unrecognised falls through as its own normalised self, so a name
-- nobody anticipated still matches an identically-spelled rate.
--
-- IMMUTABLE so it can back an index: the existing courier_rates_lookup_idx is
-- on lower(btrim(governorate)) and no longer serves the new predicate, so a
-- matching one is added beside it.
CREATE OR REPLACE FUNCTION public.normalize_governorate(_name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  s text;
BEGIN
  s := lower(btrim(coalesce(_name, '')));
  IF s = '' THEN RETURN ''; END IF;
  s := replace(replace(s, '-', ' '), '_', ' ');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  -- Arabic orthographic variants that are the same governorate.
  s := translate(s, 'أإآ', 'ااا');
  s := replace(s, 'ة', 'ه');
  s := replace(s, 'ى', 'ي');
  -- Leading definite article, either script.
  s := regexp_replace(s, '^ال', '');
  s := regexp_replace(s, '^(al|el) ', '');
  s := btrim(s);

  RETURN CASE s
    WHEN 'cairo' THEN 'قاهره'
    WHEN 'giza' THEN 'جيزه'
    WHEN 'alexandria' THEN 'اسكندريه'
    WHEN 'qalyubia' THEN 'قليوبيه'
    WHEN 'qaliobia' THEN 'قليوبيه'
    WHEN 'qalubia' THEN 'قليوبيه'
    WHEN 'kalyoubia' THEN 'قليوبيه'
    WHEN 'qalyubiyah' THEN 'قليوبيه'
    WHEN 'sharqia' THEN 'شرقيه'
    WHEN 'sharkia' THEN 'شرقيه'
    WHEN 'sharqiya' THEN 'شرقيه'
    WHEN 'dakahlia' THEN 'دقهليه'
    WHEN 'dakahleya' THEN 'دقهليه'
    WHEN 'dakahliya' THEN 'دقهليه'
    WHEN 'menofia' THEN 'منوفيه'
    WHEN 'monufia' THEN 'منوفيه'
    WHEN 'menoufia' THEN 'منوفيه'
    WHEN 'minufiya' THEN 'منوفيه'
    WHEN 'gharbia' THEN 'غربيه'
    WHEN 'gharbiya' THEN 'غربيه'
    WHEN 'kafr sheikh' THEN 'كفر الشيخ'
    WHEN 'kafr el sheikh' THEN 'كفر الشيخ'
    WHEN 'kafr al sheikh' THEN 'كفر الشيخ'
    WHEN 'kafrelsheikh' THEN 'كفر الشيخ'
    WHEN 'kafr elsheikh' THEN 'كفر الشيخ'
    WHEN 'damietta' THEN 'دمياط'
    WHEN 'dumyat' THEN 'دمياط'
    WHEN 'port said' THEN 'بورسعيد'
    WHEN 'portsaid' THEN 'بورسعيد'
    WHEN 'ismailia' THEN 'اسماعيليه'
    WHEN 'ismailiya' THEN 'اسماعيليه'
    WHEN 'suez' THEN 'سويس'
    WHEN 'north sinai' THEN 'شمال سيناء'
    WHEN 'south sinai' THEN 'جنوب سيناء'
    WHEN 'beheira' THEN 'بحيره'
    WHEN 'behira' THEN 'بحيره'
    WHEN 'buhayrah' THEN 'بحيره'
    WHEN 'beheria' THEN 'بحيره'
    WHEN 'matrouh' THEN 'مطروح'
    WHEN 'matruh' THEN 'مطروح'
    WHEN 'marsa matrouh' THEN 'مطروح'
    WHEN 'fayoum' THEN 'فيوم'
    WHEN 'faiyum' THEN 'فيوم'
    WHEN 'fayyum' THEN 'فيوم'
    WHEN 'beni suef' THEN 'بني سويف'
    WHEN 'bani suef' THEN 'بني سويف'
    WHEN 'beni sweif' THEN 'بني سويف'
    WHEN 'minya' THEN 'منيا'
    WHEN 'menia' THEN 'منيا'
    WHEN 'minia' THEN 'منيا'
    WHEN 'assiut' THEN 'اسيوط'
    WHEN 'asyut' THEN 'اسيوط'
    WHEN 'assiout' THEN 'اسيوط'
    WHEN 'sohag' THEN 'سوهاج'
    WHEN 'suhag' THEN 'سوهاج'
    WHEN 'qena' THEN 'قنا'
    WHEN 'kena' THEN 'قنا'
    WHEN 'luxor' THEN 'اقصر'
    WHEN 'aswan' THEN 'اسوان'
    WHEN 'red sea' THEN 'بحر الاحمر'
    WHEN 'new valley' THEN 'وادي الجديد'
    ELSE s
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_governorate(_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.normalize_governorate(_name text) TO authenticated;
GRANT ALL ON FUNCTION public.normalize_governorate(_name text) TO service_role;

CREATE INDEX IF NOT EXISTS courier_rates_normalized_lookup_idx
    ON public.courier_governorate_rates
    USING btree (courier_id, public.normalize_governorate(governorate), effective_from DESC)
    WHERE active;