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

-- Both accrual functions restated with the normalised match. Everything else in
-- them is unchanged; CREATE OR REPLACE FUNCTION has no partial form.
CREATE OR REPLACE FUNCTION public.accrue_order_courier_charge() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  selected_rate public.courier_governorate_rates%ROWTYPE;
  charge_amount numeric := 0;
  existing_settled_at timestamptz;
  existing_charge_type text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT settled_at, charge_type INTO existing_settled_at, existing_charge_type
    FROM public.courier_charges WHERE order_id = NEW.id;
    IF existing_charge_type = 'legacy_return' THEN
      NEW.courier_expense := OLD.courier_expense;
      RETURN NEW;
    END IF;
    IF existing_settled_at IS NOT NULL AND (
      NEW.courier_id IS DISTINCT FROM OLD.courier_id OR
      NEW.shipping_governorate IS DISTINCT FROM OLD.shipping_governorate OR
      NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
    ) THEN
      RAISE EXCEPTION 'Cannot change a settled courier charge for order %', NEW.id;
    END IF;
    IF existing_settled_at IS NOT NULL
       AND NEW.shipment_outcome IS DISTINCT FROM OLD.shipment_outcome THEN
      NEW.courier_expense := OLD.courier_expense;
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.shipment_outcome NOT IN ('delivered','returned','customer_returned','exchanged') THEN
    NEW.courier_expense := 0;
    RETURN NEW;
  END IF;
  IF NEW.courier_id IS NULL OR NULLIF(btrim(NEW.shipping_governorate), '') IS NULL THEN
    NEW.courier_expense := 0;
    RETURN NEW;
  END IF;
  SELECT * INTO selected_rate
  FROM public.courier_governorate_rates
  WHERE courier_id = NEW.courier_id
    AND public.normalize_governorate(governorate) = public.normalize_governorate(NEW.shipping_governorate)
    AND active
    AND effective_from <= NEW.occurred_at::date
    AND (effective_to IS NULL OR effective_to >= NEW.occurred_at::date)
  ORDER BY effective_from DESC LIMIT 1;
  charge_amount := CASE NEW.shipment_outcome
    WHEN 'delivered' THEN selected_rate.delivery_fee
    WHEN 'returned' THEN selected_rate.failed_delivery_fee
    WHEN 'customer_returned' THEN selected_rate.customer_return_fee
    WHEN 'exchanged' THEN selected_rate.exchange_fee
    ELSE 0
  END;
  NEW.courier_expense := COALESCE(charge_amount, 0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_order_courier_charge() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE selected_rate_id uuid; charge_kind text;
BEGIN
  IF NEW.shipment_outcome NOT IN ('delivered','returned','customer_returned','exchanged')
     OR NEW.courier_id IS NULL THEN
    DELETE FROM public.courier_charges
    WHERE order_id = NEW.id AND settled_at IS NULL AND charge_type <> 'legacy_return';
    RETURN NEW;
  END IF;
  SELECT id INTO selected_rate_id
  FROM public.courier_governorate_rates
  WHERE courier_id = NEW.courier_id
    AND public.normalize_governorate(governorate) = public.normalize_governorate(NEW.shipping_governorate)
    AND active
    AND effective_from <= NEW.occurred_at::date
    AND (effective_to IS NULL OR effective_to >= NEW.occurred_at::date)
  ORDER BY effective_from DESC LIMIT 1;
  charge_kind := CASE NEW.shipment_outcome
    WHEN 'delivered' THEN 'delivery'
    WHEN 'returned' THEN 'failed_delivery'
    WHEN 'customer_returned' THEN 'customer_return'
    ELSE 'exchange'
  END;
  INSERT INTO public.courier_charges(
    order_id, brand_id, courier_id, rate_id, charge_type, amount, rate_missing, note, updated_at
  ) VALUES (
    NEW.id, NEW.brand_id, NEW.courier_id, selected_rate_id, charge_kind,
    NEW.courier_expense, selected_rate_id IS NULL,
    CASE WHEN selected_rate_id IS NULL THEN 'Missing courier rate for ' || COALESCE(NEW.shipping_governorate, 'unknown governorate') END,
    now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    courier_id = EXCLUDED.courier_id,
    rate_id = EXCLUDED.rate_id,
    charge_type = EXCLUDED.charge_type,
    amount = EXCLUDED.amount,
    rate_missing = EXCLUDED.rate_missing,
    note = EXCLUDED.note,
    updated_at = now()
  WHERE public.courier_charges.settled_at IS NULL
    AND public.courier_charges.charge_type <> 'legacy_return';
  RETURN NEW;
END;
$$;
