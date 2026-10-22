import { useEffect, useState } from "react";

const formatDateTime = (value) =>
  new Date(value).toLocaleString("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const getElapsed = (value) => {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;

  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${remainingMinutes} phút`;
  return `${minutes} phút`;
};

const formatMoney = (value) =>
  value == null ? "—" : `${Number(value).toLocaleString("vi-VN")} ₫`;

export default function OperationalAlerts({ apiFetch, onViewTicket }) {
  const [alerts, setAlerts] = useState({
    thresholds: { overdueVehicleHours: 24, pendingPaymentMinutes: 15 },
    overdueVehicles: [],
    pendingPayments: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadAlerts = async () => {
      setErrorMessage("");
      try {
        const result = await apiFetch("/tickets/alerts", {
          signal: controller.signal,
        });
        setAlerts(result);
      } catch (error) {
        if (error.name !== "AbortError") {
          setErrorMessage(error.message || "Không thể tải cảnh báo vận hành.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    loadAlerts();
    const intervalId = window.setInterval(loadAlerts, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [apiFetch, refreshKey]);

  const alertCount =
    alerts.overdueVehicles.length + alerts.pendingPayments.length;

  return (
    <section
      className="glass-card"
      aria-labelledby="operational-alerts-heading"
      style={{ marginBottom: 20 }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div>
          <h2 id="operational-alerts-heading" style={{ margin: "0 0 5px" }}>
            Cảnh báo vận hành{!isLoading && ` · ${alertCount}`}
          </h2>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
            Xe gửi quá {alerts.thresholds.overdueVehicleHours} giờ hoặc hóa đơn
            chờ thanh toán quá {alerts.thresholds.pendingPaymentMinutes} phút.
            Cảnh báo tự cập nhật mỗi phút.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsLoading(true);
            setRefreshKey((current) => current + 1);
          }}
          disabled={isLoading}
        >
          Tải lại
        </button>
      </header>

      {errorMessage && (
        <p role="alert" style={{ color: "#fca5a5" }}>
          {errorMessage}
        </p>
      )}
      {isLoading && <p role="status">Đang kiểm tra cảnh báo...</p>}
      {!isLoading && !errorMessage && alertCount === 0 && (
        <p style={{ color: "var(--text-muted)", marginBottom: 0 }}>
          Hiện không có cảnh báo cần xử lý.
        </p>
      )}

      {!isLoading && !errorMessage && alertCount > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          {alerts.overdueVehicles.map((ticket) => (
            <article
              key={`overdue-${ticket.ticket_code}`}
              style={{
                border: "1px solid rgba(251, 191, 36, 0.35)",
                borderRadius: 12,
                padding: 14,
                background: "rgba(120, 53, 15, 0.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <strong style={{ color: "#fcd34d" }}>Xe gửi quá lâu</strong>
                  <div style={{ marginTop: 6 }}>
                    {ticket.license_plate} · Ô {ticket.parking_slots?.slot_code || "—"} · Vé{" "}
                    {ticket.ticket_code}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                    Đã gửi {getElapsed(ticket.check_in_time)} · Vào bãi{" "}
                    {formatDateTime(ticket.check_in_time)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onViewTicket(ticket)}
                >
                  Xem chi tiết vé
                </button>
              </div>
            </article>
          ))}

          {alerts.pendingPayments.map((ticket) => (
            <article
              key={`pending-${ticket.ticket_code}`}
              style={{
                border: "1px solid rgba(248, 113, 113, 0.4)",
                borderRadius: 12,
                padding: 14,
                background: "rgba(127, 29, 29, 0.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <strong style={{ color: "#fca5a5" }}>Hóa đơn chờ thanh toán lâu</strong>
                  <div style={{ marginTop: 6 }}>
                    {ticket.license_plate} · Ô {ticket.parking_slots?.slot_code || "—"} · Vé{" "}
                    {ticket.ticket_code}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                    Chờ {getElapsed(ticket.check_out_time)} · {formatMoney(ticket.total_amount)}
                    {ticket.payment_code ? ` · Mã ${ticket.payment_code}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onViewTicket(ticket)}
                >
                  Xem chi tiết vé
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
