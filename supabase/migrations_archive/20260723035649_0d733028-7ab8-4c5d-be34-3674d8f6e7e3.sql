
ALTER FUNCTION public.sync_salary_expense() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.sync_salary_expense() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_salary_expense() TO authenticated;
