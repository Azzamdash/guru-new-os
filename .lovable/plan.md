# الخطة

## 1) محافظ الخزنة (Wallets) + رصيد افتتاحي + تحويلات

**Schema (migration):**
- جدول جديد `public.wallets`
  - `id uuid`, `name text`, `kind text` (`cash` / `bank` / `ewallet`), `opening_balance numeric default 0`, `active bool default true`, `sort_order int`, `created_at`, `updated_at`.
  - GRANTs عادية + RLS: قراءة للمصادَق عليهم، تعديل للـ admin/manager/accountant.
- `ALTER TABLE public.cash_transactions ADD COLUMN wallet_id uuid REFERENCES public.wallets(id)`.
- نوع جديد للتحويلات: `ALTER TYPE cash_txn_type ADD VALUE 'transfer_in'` و `'transfer_out'`.
- عمود اختياري `transfer_group uuid` على `cash_transactions` لربط طرفَي التحويل.
- Seed: نُنشئ محفظة `Main Cash` ونربط بها كل الحركات القائمة (`UPDATE cash_transactions SET wallet_id = <main>`)، ثم `NOT NULL`.

**Server (`src/lib/financials.functions.ts` أو ملف جديد `wallets.functions.ts`):**
- `listWallets` / `upsertWallet` / `deactivateWallet`.
- `transferBetweenWallets({fromId, toId, amount, occurred_at, note})` → صفَّان في `cash_transactions` بنفس `transfer_group`.
- `getWalletBalances()` → لكل محفظة: `opening_balance + Σ(inflows) − Σ(outflows)` (مع اعتبار `transfer_in/out`).
- تعديل `getCashSummary` ليجمع الأرصدة من كل المحافظ ويشمل `opening_balance`.

**UI (`_app.treasury.tsx`):**
- Tabs/pills أعلى الصفحة: All wallets + محفظة لكل واحدة + زر "إضافة محفظة".
- Dialog لإدارة المحافظ (اسم/نوع/رصيد افتتاحي).
- زر "تحويل" يفتح dialog (من/إلى/مبلغ).
- كل إضافة حركة (سحب/إيداع/مصروف) لازم تختار المحفظة.

## 2) دفعات موردين غير مرتبطة بفاتورة

- `ALTER TABLE public.supplier_payments ALTER COLUMN invoice_id DROP NOT NULL` + `ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id)`.
- تحديث trigger `sync_supplier_payment`:
  - لو `invoice_id` NULL: نجيب `supplier_id` مباشرة، مانستدعيش `recompute_supplier_invoice_status`.
  - في note الخزنة نعرض اسم المورد.
- تحديث `src/routes/_authenticated/_app.suppliers.payments.tsx`:
  - Dialog «دفعة جديدة» يقبل اختيار مورد فقط (بدون فاتورة) أو مورد + فاتورة.
  - Outstanding debt = فواتير مفتوحة + `opening_balance` − Σ(دفعات) (بما فيها غير المرتبطة).

## 3) رصيد افتتاحي في تقارير CEO

- في `src/lib/executive.functions.ts` و `getInternalDashboard`:
  - المديونية للموردين = `Σ(opening_balance) + Σ(invoices.open/paid delta) − Σ(payments)` — حالياً بيحسب الفواتير فقط، هنضيف opening_balance.
  - نفس الشيء لشركات الشحن (couriers.opening_balance).
  - رصيد الخزنة الآن = `Σ(wallets.opening_balance) + Σ(cash_transactions)`.

## ملاحظات تقنية
- كل الـmigrations تضيف GRANT + RLS في نفس الملف.
- الـtriggers الجديدة `SECURITY DEFINER` بـ `search_path=public` وREVOKE EXECUTE من public/authenticated.
- تحويلات الخزنة لا تُنشئ expense_entries (نفلترها في `sync_cash_to_expense`).

هل أبدأ التنفيذ بهذا الترتيب: (1) المحافظ، (2) دفعات الموردين المفتوحة، (3) إصلاح CEO؟
