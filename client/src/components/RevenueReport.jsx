import { useEffect, useMemo, useState } from "react";

const todayInVietnam = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );

const shiftDate = (date, offset) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};

const formatMoney = (value) =>
  `${Number(value || 0).toLocaleString("vi-VN")} ₫`;

const formatDate = (value) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export default function RevenueReport({ apiFetch }) {
  const today = todayInVietnam();
  const [range, setRange] = useState({
    from: shiftDate(today, -6),
    to: today,
  });
  const [report, setReport] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const loadReport = async () => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const params = new URLSearchParams(range);
        const result = await apiFetch(
          `/tickets/reports/revenue?${params.toString()}`,
          { signal: controller.signal },
        );
        setReport(result.days || []);
      } catch (error) {
        if (error.name !== "AbortError") {
          setErrorMessage(error.message || "Không thể tải báo cáo doanh thu.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    loadReport();
    return () => controller.abort();
  }, [apiFetch, range]);

  const rows = useMemo(() => {
    const rowsByDate = new Map(report.map((row) => [row.report_date, row]));
    const days = [];
    for (
      let date = range.from;
      date <= range.to;
      date = shiftDate(date, 1)
    ) {
      const row = rowsByDate.get(date);
      days.push({
        date,
        checkoutTickets: Number(row?.checkout_tickets || 0),
        paidTickets: Number(row?.paid_tickets || 0),
        paidRevenue: Number(row?.paid_revenue || 0),
        pendingTickets: Number(row?.pending_tickets || 0),
        pendingAmount: Number(row?.pending_amount || 0),
      });
    }
    return days;
  }, [range, report]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          checkoutTickets: sum.checkoutTickets + row.checkoutTickets,
          paidTickets: sum.paidTickets + row.paidTickets,
          paidRevenue: sum.paidRevenue + row.paidRevenue,
          pendingTickets: sum.pendingTickets + row.pendingTickets,
          pendingAmount: sum.pendingAmount + row.pendingAmount,
        }),
        {
          checkoutTickets: 0,
          paidTickets: 0,
          paidRevenue: 0,
          pendingTickets: 0,
          pendingAmount: 0,
        },
      ),
    [rows],
  );

  const setPreset = (days) =>
    setRange({ from: shiftDate(today, -(days - 1)), to: today });

  const downloadCsv = () => {
    const columns = [
      ["Ngày", "date"],
      ["Lượt check-out", "checkoutTickets"],
      ["Đã thanh toán", "paidTickets"],
      ["Doanh thu đã thu (VND)", "paidRevenue"],
      ["Chờ thanh toán", "pendingTickets"],
      ["Số tiền chờ thanh toán (VND)", "pendingAmount"],
    ];
    const csv = [
      columns.map(([label]) => label).join(","),
      ...rows.map((row) => columns.map(([, key]) => row[key]).join(",")),
      [
        "Tổng",
        totals.checkoutTickets,
        totals.paidTickets,
        totals.paidRevenue,
        totals.pendingTickets,
        totals.pendingAmount,
      ].join(","),
    ].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bao-cao-doanh-thu-${range.from}-${range.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const maxRevenue = Math.max(...rows.map((row) => row.paidRevenue), 0);

  return (
    <section className="glass-card" aria-labelledby="revenue-report-heading">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 id="revenue-report-heading" style={{ margin: "0 0 6px" }}>
            Báo cáo doanh thu
          </h2>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
            Doanh thu chỉ tính các giao dịch đã xác nhận thanh toán.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={isLoading || rows.length === 0}
        >
          Tải báo cáo CSV
        </button>
      </header>

      <div
        style={{
          display: "flex",
          alignItems: "end",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <label>
          Từ ngày
          <input
            type="date"
            value={range.from}
            min={shiftDate(range.to, -89)}
            max={range.to}
            onChange={(event) =>
              setRange((current) => ({ ...current, from: event.target.value }))
            }
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            value={range.to}
            min={range.from}
            max={shiftDate(range.from, 89) < today ? shiftDate(range.from, 89) : today}
            onChange={(event) =>
              setRange((current) => ({ ...current, to: event.target.value }))
            }
          />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setPreset(7)}>
            7 ngày
          </button>
          <button type="button" onClick={() => setPreset(30)}>
            30 ngày
          </button>
        </div>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
          Tối đa 90 ngày mỗi lần xem
        </span>
      </div>

      {errorMessage && (
        <p role="alert" style={{ color: "#fca5a5" }}>
          {errorMessage}
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[
          ["Doanh thu đã thu", formatMoney(totals.paidRevenue), "#6ee7b7"],
          ["Lượt check-out", totals.checkoutTickets, "var(--text-main)"],
          ["Giao dịch đã thu", totals.paidTickets, "#60a5fa"],
          [
            "Đang chờ thanh toán",
            `${totals.pendingTickets} · ${formatMoney(totals.pendingAmount)}`,
            "#fbbf24",
          ],
        ].map(([label, value, color]) => (
          <article
            key={label}
            style={{
              padding: 16,
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              background: "rgba(0, 0, 0, 0.12)",
            }}
          >
            <div
              style={{
                marginBottom: 8,
                color: "var(--text-muted)",
                fontSize: 12,
              }}
            >
              {label}
            </div>
            <strong style={{ color, fontSize: 20 }}>{value}</strong>
          </article>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            minWidth: 680,
            borderCollapse: "collapse",
            textAlign: "left",
          }}
        >
          <thead>
            <tr style={{ color: "var(--text-muted)", fontSize: 12 }}>
              {[
                "Ngày",
                "Lượt check-out",
                "Đã thanh toán",
                "Doanh thu đã thu",
                "Chờ thanh toán",
                "Tiến độ doanh thu",
              ].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  style={{
                    padding: "11px 8px",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date}>
                <td style={{ padding: "12px 8px" }}>{formatDate(row.date)}</td>
                <td style={{ padding: "12px 8px" }}>{row.checkoutTickets}</td>
                <td style={{ padding: "12px 8px" }}>{row.paidTickets}</td>
                <td style={{ padding: "12px 8px", color: "#6ee7b7" }}>
                  {formatMoney(row.paidRevenue)}
                </td>
                <td style={{ padding: "12px 8px", color: "#fbbf24" }}>
                  {row.pendingTickets}
                </td>
                <td style={{ padding: "12px 8px", minWidth: 120 }}>
                  <div
                    aria-label={`${row.date}: ${formatMoney(row.paidRevenue)}`}
                    style={{
                      height: 7,
                      overflow: "hidden",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      style={{
                        width: `${
                          maxRevenue > 0
                            ? (row.paidRevenue / maxRevenue) * 100
                            : 0
                        }%`,
                        height: "100%",
                        borderRadius: 8,
                        background: "linear-gradient(90deg, #10b981, #34d399)",
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td style={{ padding: "12px 8px" }}>Tổng</td>
              <td style={{ padding: "12px 8px" }}>{totals.checkoutTickets}</td>
              <td style={{ padding: "12px 8px" }}>{totals.paidTickets}</td>
              <td style={{ padding: "12px 8px", color: "#6ee7b7" }}>
                {formatMoney(totals.paidRevenue)}
              </td>
              <td style={{ padding: "12px 8px", color: "#fbbf24" }}>
                {totals.pendingTickets}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {isLoading && <p role="status">Đang tải báo cáo...</p>}
      {!isLoading && !errorMessage && totals.checkoutTickets === 0 && (
        <p style={{ color: "var(--text-muted)", textAlign: "center" }}>
          Chưa có lượt check-out trong khoảng thời gian này.
        </p>
      )}
    </section>
  );
}
