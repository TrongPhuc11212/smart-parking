import { useEffect, useState } from "react";

const ACTIONS = [
  ["", "Tất cả hoạt động"],
  ["CHECK_IN", "Nhận xe"],
  ["CHECK_OUT", "Làm thủ tục ra xe"],
];

const formatDateTime = (value) =>
  new Date(value).toLocaleString("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const formatMoney = (value) =>
  value == null ? "—" : `${Number(value).toLocaleString("vi-VN")} ₫`;

const toCsvCell = (value) => {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export default function StaffActivityLog({ apiFetch }) {
  const [action, setAction] = useState("");
  const [staffId, setStaffId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [staff, setStaff] = useState([]);
  const [staffError, setStaffError] = useState("");
  const [result, setResult] = useState({
    activities: [],
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadStaff = async () => {
      setStaffError("");
      try {
        const data = await apiFetch("/auth/staff", {
          signal: controller.signal,
        });
        setStaff(data.staff || []);
      } catch (error) {
        if (error.name !== "AbortError") {
          setStaffError(error.message || "Không thể tải danh sách nhân viên.");
        }
      }
    };
    loadStaff();
    return () => controller.abort();
  }, [apiFetch]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (action) params.set("action", action);
    if (staffId) params.set("staffId", staffId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const loadActivities = async () => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const data = await apiFetch(
          `/auth/staff-activity?${params.toString()}`,
          { signal: controller.signal },
        );
        setResult(data);
      } catch (error) {
        if (error.name !== "AbortError") {
          setErrorMessage(error.message || "Không thể tải nhật ký nhân viên.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    loadActivities();
    return () => controller.abort();
  }, [action, apiFetch, from, page, refreshKey, staffId, to]);

  const updateFilter = (setter, value) => {
    setter(value);
    setPage(1);
  };

  const downloadCsv = async () => {
    setIsExporting(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "250" });
      if (action) params.set("action", action);
      if (staffId) params.set("staffId", staffId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const firstPage = await apiFetch(
        `/auth/staff-activity?${params.toString()}`,
      );
      const activities = [...firstPage.activities];
      for (let exportPage = 2; exportPage <= firstPage.totalPages; exportPage += 1) {
        params.set("page", String(exportPage));
        const nextPage = await apiFetch(
          `/auth/staff-activity?${params.toString()}`,
        );
        activities.push(...nextPage.activities);
      }

      const columns = [
        ["Thời gian", (activity) => formatDateTime(activity.created_at)],
        ["Nhân viên", (activity) => activity.actor_name],
        ["Email nhân viên", (activity) => activity.actor_email],
        [
          "Hoạt động",
          (activity) =>
            ACTIONS.find(([value]) => value === activity.action)?.[1] ||
            activity.action,
        ],
        ["Biển số", (activity) => activity.license_plate],
        ["Ô đỗ", (activity) => activity.slot_code],
        ["Mã vé", (activity) => activity.ticket_code],
        ["Số tiền (VND)", (activity) => activity.amount],
        ["Mã tham chiếu thanh toán", (activity) => activity.payment_reference],
      ];
      const csv = [
        columns.map(([label]) => toCsvCell(label)).join(","),
        ...activities.map((activity) =>
          columns.map(([, getValue]) => toCsvCell(getValue(activity))).join(","),
        ),
      ].join("\r\n");
      const blob = new Blob(["\uFEFF", csv], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nhat-ky-nhan-vien-${from || "tat-ca"}-${to || "tat-ca"}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(error.message || "Không thể xuất nhật ký nhân viên.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="glass-card" aria-labelledby="staff-activity-heading">
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
          <h2 id="staff-activity-heading" style={{ margin: "0 0 5px" }}>
            Nhật ký nhân viên
          </h2>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
            Theo dõi nhân viên đã nhận xe và làm thủ tục ra xe.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setRefreshKey((current) => current + 1)}
          >
            Tải lại
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={isLoading || isExporting || result.total === 0}
          >
            {isExporting ? "Đang xuất..." : "Tải nhật ký CSV"}
          </button>
        </div>
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
          Nhân viên
          <select
            value={staffId}
            onChange={(event) => updateFilter(setStaffId, event.target.value)}
          >
            <option value="">Tất cả nhân viên</option>
            {staff.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.full_name || member.email}
                {!member.is_active ? " (đã khóa)" : ""}
              </option>
            ))}
          </select>
        </label>
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

      {staffError && (
        <p role="alert" style={{ color: "#fca5a5" }}>
          {staffError}
        </p>
      )}
      {errorMessage && (
        <p role="alert" style={{ color: "#fca5a5" }}>
          {errorMessage}
        </p>
      )}

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            minWidth: 850,
            borderCollapse: "collapse",
            textAlign: "left",
          }}
        >
          <thead>
            <tr style={{ color: "var(--text-muted)", fontSize: 12 }}>
              {[
                "Thời gian",
                "Nhân viên",
                "Hoạt động",
                "Biển số",
                "Ô đỗ",
                "Mã vé",
                "Số tiền",
              ].map((heading) => (
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
              ))}
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
                    <strong>{activity.actor_name || "Nhân viên"}</strong>
                    <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {activity.actor_email}
                    </div>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    {ACTIONS.find(([value]) => value === activity.action)?.[1] ||
                      activity.action}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    {activity.license_plate}
                  </td>
                  <td style={{ padding: "12px 8px" }}>{activity.slot_code}</td>
                  <td style={{ padding: "12px 8px" }}>{activity.ticket_code}</td>
                  <td style={{ padding: "12px 8px", whiteSpace: "nowrap" }}>
                    {formatMoney(activity.amount)}
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
