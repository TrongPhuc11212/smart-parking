# SePay payment setup

1. If not already applied, first run `supabase/migrations/20261020000000_atomic_ticket_operations.sql`, then run `supabase/migrations/20261020100000_sepay_payment_webhook.sql` in the Supabase SQL Editor.
2. Copy `.env.example` to `.env` and configure the SePay bank details, webhook API key, Supabase **service-role** key, and staff authentication settings described in [STAFF_ACCESS.md](./STAFF_ACCESS.md). Keep `.env` private; never expose the service-role key to the client.
3. For local use, leave `AI_SERVICE_URL` at `http://127.0.0.1:8000`. For deployment, deploy `ai-service` as a separate Python web service using `ai-service/requirements.txt` as its dependency file and `uvicorn main:app --host 0.0.0.0 --port $PORT` as its start command. Set the Node server's `AI_SERVICE_URL` environment variable to the AI service's base HTTPS URL (without `/predict`). The AI service health-check path is `/health`; allow time and sufficient memory for EasyOCR to load its model.
4. Deploy the Node server with `server` as the root directory, `npm install` as the build command, and `npm start` as the start command. Configure the server environment variables there, including `AI_SERVICE_URL`, and expose its HTTPS endpoint publicly.
5. In SePay, create a webhook for incoming transactions and set its URL to `https://<your-domain>/api/tickets/sepay/webhook`. Select API Key authentication and use the same value as `SEPAY_WEBHOOK_API_KEY`.
6. The customer QR contains a unique `SP...` transfer code. SePay marks a ticket paid only when an authenticated incoming transaction matches that code, configured account, and exact fee.
7. Test with SePay's webhook test feature and a small real or sandbox transfer. The local callback is not reachable from SePay unless the server is exposed through a public HTTPS endpoint.

The parking space remains occupied while payment is pending and is released only after the webhook confirms payment. See SePay's [webhook integration](https://docs.sepay.vn/tich-hop-webhooks.html) and [dynamic VietQR](https://docs.sepay.vn/tao-qr-code-vietqr-dong.html) documentation.
