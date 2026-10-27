import { useEffect, useState } from "react";

const ACTIONS = [
  ["", "Tất cả hoạt động"],
  ["STAFF_CREATED", "Tạo tài khoản"],
  ["STAFF_UPDATED", "Cập nhật tài khoản"],
  ["PARKING_RATE_UPDATED", "Đổi bảng giá"],
  ["INVOICE_CANCELLED", "Hủy hóa đơn"],
  ["INVOICE_COMPLETED_MANUALLY", "Hoàn tất thủ công"],
  ["PARKING_SLOT_CREATED", "Thêm vị trí đỗ"],
  ["PARKING_SLOT_UPDATED", "Sửa vị trí đỗ"],
  ["PARKING_SLOT_ARCHIVED", "Ngừng sử dụng vị trí"],
  ["PARKING_SLOT_RESTORED", "Khôi phục vị trí"],
];

const formatDateTime = (value) =>
  new Date(value).toLocaleString("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const formatMoney = (value) =>
  value == null ? null : `${Number(value).toLocaleString("vi-VN")} ₫`;

const describeActivity = (activity) => {
  const details = activity.details || {};
  switch (activity.action) {
    case "STAFF_CREATED":
      return `Tạo tài khoản ${details.email || activity.target_id} (${details.role === "MANAGER" ? "Quản lý" : "Nhân viên"})`;
    case "STAFF_UPDATED":
      return `Cập nhật ${details.email || activity.target_id}: ${details.role === "MANAGER" ? "Quản lý" : "Nhân viên"} · ${details.isActive ? "Đang hoạt động" : "Đã khóa"}${details.passwordChanged ? " · đã đặt lại mật khẩu" : ""}`;
    case "PARKING_RATE_UPDATED":
      return `Cập nhật giá ${activity.target_id === "CAR" ? "ô tô" : "xe máy"}: ${formatMoney(details.firstTwoHoursAmount)} / 2 giờ đầu, ${formatMoney(details.additionalHourAmount)} mỗi giờ tiếp theo`;
    case "INVOICE_CANCELLED":
      return `Hủy hóa đơn vé ${activity.target_id} · ${details.licensePlate || ""} · ${formatMoney(details.amount)}`;
    case "INVOICE_COMPLETED_MANUALLY":
      return `Hoàn tất thủ công vé ${activity.target_id} · ${details.licensePlate || ""} · ${formatMoney(details.amount)}`;
    case "PARKING_SLOT_CREATED":
    case "PARKING_SLOT_ARCHIVED":
    case "PARKING_SLOT_RESTORED":
      return `${details.slotCode || activity.target_id} · ${details.zone || ""} · ${details.vehicleType === "CAR" ? "Ô tô" : "Xe máy"}`;
    case "PARKING_SLOT_UPDATED":
      return `${details.before?.slotCode || activity.target_id} → ${details.after?.slotCode || activity.target_id} · ${details.after?.zone || ""}`;
    default:
      return `${activity.action} · ${activity.target_id}`;
  }
};

export default function ManagerActivityLog({ apiFetch }) {
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({
    activities: [],
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (action) params.set("action", action);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const loadActivities = async () => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const data = await apiFetch(
          `/auth/activity-log?${params.toString()}`,
          { signal: controller.signal },
        );
        setResult(data);
      } catch (error) {
        if (error.name !== "AbortError") {
          setErrorMessage(error.message || "Không thể tải nhật ký hoạt động.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    loadActivities();
    return () => controller.abort();
  }, [action, apiFetch, from, page, refreshKey, to]);

  const updateFilter = (setter, value) => {
    setter(value);
    setPage(1);
  };

  return (
    <section className="glass-card" aria-labelledby="activity-log-heading">
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div>
          <h2 id="activity-log-heading" style={{ margin: "0 0 5px" }}>
            Nhật ký hoạt động
          </h2>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
            Theo dõi thay đổi tài khoản, bảng giá và xử lý hóa đơn của quản lý.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((current) => current + 1)}
        >
          Tải lại
        </button>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 10,
          marginBottom: 18,
        }}
      >
        <label>
          Loại hoạt động
          <select
            value={action}
            onChange={(event) => updateFilter(setAction, event.target.value)}
          >
            {ACTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Từ ngày
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => updateFilter(setFrom, event.target.value)}
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => updateFilter(setTo, event.target.value)}
          />
        </label>
      </div>

      {errorMessage && (
        <p role="alert" style={{ color: "#fca5a5" }}>
          {errorMessage}
        </p>
      )}

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            minWidth: 650,
            borderCollapse: "collapse",
            textAlign: "left",
          }}
        >
          <thead>
            <tr style={{ color: "var(--text-muted)", fontSize: 12 }}>
              {["Thời gian", "Người thực hiện", "Hoạt động", "Chi tiết"].map(
                (heading) => (
                  <th
                    key={heading}
                    scope="col"
                    style={{
                      padding: "10px 8px",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {!isLoading &&
              !errorMessage &&
              result.activities.map((activity) => (
                <tr key={activity.id}>
                  <td style={{ padding: "12px 8px", whiteSpace: "nowrap" }}>
                    {formatDateTime(activity.created_at)}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <strong>{activity.actor_name || "Quản lý"}</strong>
                    <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {activity.actor_email}
                    </div>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    {ACTIONS.find(([value]) => value === activity.action)?.[1] ||
                      activity.action}
                  </td>
                  <td style={{ padding: "12px 8px", minWidth: 280 }}>
                    {describeActivity(activity)}
                    {activity.details?.reason && (
                      <div
                        style={{
                          marginTop: 5,
                          color: "var(--text-muted)",
                          fontSize: 12,
                        }}
                      >
                        Lý do: {activity.details.reason}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {isLoading && <p role="status">Đang tải nhật ký...</p>}
      {!isLoading && !errorMessage && result.activities.length === 0 && (
        <p style={{ color: "var(--text-muted)", textAlign: "center" }}>
          Chưa có hoạt động phù hợp với bộ lọc.
        </p>
      )}
      {result.totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
            marginTop: 16,
          }}
        >
          <button
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((current) => current - 1)}
          >
            Trang trước
          </button>
          <span>
            {page} / {result.totalPages} · {result.total} hoạt động
          </span>
          <button
            type="button"
            disabled={page >= result.totalPages || isLoading}
            onClick={() => setPage((current) => current + 1)}
          >
            Trang sau
          </button>
        </div>
      )}
    </section>
  );
}
