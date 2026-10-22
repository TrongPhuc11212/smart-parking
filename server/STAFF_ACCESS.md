# Staff accounts and access

1. Run the SQL migrations in order:
   - `supabase/migrations/20261020000000_atomic_ticket_operations.sql`
   - `supabase/migrations/20261020100000_sepay_payment_webhook.sql`
   - `supabase/migrations/20261020200000_staff_auth_and_roles.sql`
   - `supabase/migrations/20261020300000_staff_account_management.sql`
   - `supabase/migrations/20261020400000_revenue_reporting.sql`
   - `supabase/migrations/20261020500000_parking_rate_management.sql`
   - `supabase/migrations/20261020600000_cancel_pending_invoices.sql`
   - `supabase/migrations/20261020700000_manual_invoice_completion.sql`
   - `supabase/migrations/20261020800000_manager_activity_log.sql`
   - `supabase/migrations/20261020900000_staff_activity_log.sql`
2. In **Supabase Dashboard → Authentication → Settings**, disable public sign-ups. The server service-role key must be configured in `server/.env`; never put it in a `VITE_` variable or commit it.
3. In Supabase Authentication, create the first manager account. Then run the following in SQL Editor, replacing the email with that account's email:

   ```sql
   update public.staff_profiles
   set role = 'MANAGER'
   where email = lower('manager@example.com');
   ```

4. Sign in to the app using that manager account. Open **Quản lý nhân viên** to create staff accounts (the default role is `STAFF`; managers can also grant `MANAGER`). Managers can edit email, name, role, and password, or lock/unlock accounts. The final active manager cannot be demoted or locked.
5. Restart the server and reload the client. Staff can operate parking and view ticket history. The dashboard displays operational alerts for vehicles parked over 24 hours and pending invoices older than 15 minutes; the alert list refreshes every minute and does not automatically change invoices or parking spaces. Managers can open **Báo cáo doanh thu** to filter a date range (up to 90 days), review confirmed payments and pending amounts, and export CSV. Manual invoice completions are included in collected revenue and are labeled separately. From **Cấu hình giá**, managers can change the initial two-hour fee and each additional-hour fee for cars and motorcycles. New rates apply to new check-outs; an existing pending invoice keeps its original amount. Managers can cancel pending invoices from ticket details; cancellation is recorded in the audit history and leaves the vehicle and parking space unchanged. A manager can also complete a pending invoice manually, with a required reason and audit record; this marks the invoice as paid and frees the parking space, so only use it for test runs or payments settled outside SePay. **Nhật ký hoạt động** shows who changed staff accounts or rates, canceled invoices, or completed them manually. **Nhật ký nhân viên** records staff check-ins and check-outs, including the staff member, time, ticket, license plate, parking space, and checkout amount; managers can filter by staff member, activity, or date (up to 90 days) and export all matching entries to CSV. Paid invoices cannot be canceled or manually completed again. Only managers can access reports, configure rates, view activity logs, cancel or manually complete pending invoices, create accounts, edit staff details and roles, or lock/unlock accounts. Accounts are locked rather than permanently deleted to preserve audit history.

The frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `client/.env` for sign-in and Realtime. Keep only the publishable/anon key there; do not put any service-role secret in the client environment.

The API validates the Supabase access token and staff role on every application endpoint. The SePay webhook remains separately authenticated with its configured API key.
