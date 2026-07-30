GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_attendance_entries TO authenticated;
GRANT ALL ON public.employee_attendance_entries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_time_logs TO authenticated;
GRANT ALL ON public.employee_time_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_requests TO authenticated;
GRANT ALL ON public.employee_requests TO service_role;