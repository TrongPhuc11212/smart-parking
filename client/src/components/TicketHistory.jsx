import { useEffect, useRef, useState } from "react";
import PrintableTicket from "./PrintableTicket";

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid var(--border-color)",
  background: "rgba(0,0,0,0.25)",
  color: "var(--text-main)",
  boxSizing: "border-box",
};

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

const formatMoney = (value) =>
  value == null ? "—" : `${Number(value).toLocaleString("vi-VN")} VNĐ`;

export default function TicketHistory({
  apiFetch,
  isManager = false,
  initialSearch = "",
}) {
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [filters, setFilters] = useState({
    search: initialSearch,
    status: "",
    unpaidDeparture: "",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState({
    tickets: [],
    total: 0,
    totalPages: 0,
  });
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isCancellingInvoice, setIsCancellingInvoice] = useState(false);
  const [isCompletingManually, setIsCompletingManually] = useState(false);
  const [showManualCompletionForm, setShowManualCompletionForm] = useState(false);
  const [manualCompletionReason, setManualCompletionReason] = useState("");
  const [showDepartureForm, setShowDepartureForm] = useState(false);
  const [departureReason, setDepartureReason] = useState("");
  const [isRecordingDeparture, setIsRecordingDeparture] = useState(false);
  const [invoiceActionMessage, setInvoiceActionMessage] = useState("");
  const [invoiceActionError, setInvoiceActionError] = useState("");
  const cancellationLoadId = useRef(0);
  const autoOpenedTicketCode = useRef("");
  const selectedTicketCode = selectedTicket?.ticket_code;

  useEffect(() => {
    if (!isManager || !selectedTicketCode) return;

    const controller = new AbortController();
    const loadId = ++cancellationLoadId.current;
    const encodedTicketCode = encodeURIComponent(selectedTicketCode);
    Promise.all([
      apiFetch(`/tickets/invoices/${encodedTicketCode}/cancellations`, {
        signal: controller.signal,
      }),
      apiFetch(`/tickets/invoices/${encodedTicketCode}/manual-completions`, {
        signal: controller.signal,
      }),
    ])
      .then(([cancellationResult, completionResult]) => {
        if (cancellationLoadId.current !== loadId) return;
        setSelectedTicket((current) =>
          current?.ticket_code === selectedTicketCode
            ? {
                ...current,
                invoice_cancellations: cancellationResult.cancellations,
                manual_completions: completionResult.completions,
              }
            : current,
        );
      })
      .catch((error) => {
        if (
          error.name !== "AbortError" &&
          cancellationLoadId.current === loadId
        ) {
          setInvoiceActionError(error.message || "Không thể tải lịch sử hóa đơn.");
        }
      });

    return () => controller.abort();
  }, [apiFetch, isManager, selectedTicketCode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setFilters((current) => ({ ...current, search: searchInput.trim() }));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const loadHistory = async () => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const result = await apiFetch(
          `/tickets/history?${params.toString()}`,
          { signal: controller.signal },
        );
        setHistory(result);
        if (
          initialSearch.startsWith("PK-") &&
          autoOpenedTicketCode.current !== initialSearch
        ) {
          const ticket = result.tickets.find(
            (entry) => entry.ticket_code === initialSearch,
          );
          if (ticket) {
            autoOpenedTicketCode.current = initialSearch;
            setSelectedTicket(ticket);
          }
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          setErrorMessage(error.message || "Không thể tải lịch sử vé.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    loadHistory();
    return () => controller.abort();
  }, [apiFetch, filters, initialSearch, page, refreshKey]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="glass-card" aria-labelledby="ticket-history-heading">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "18px",
        }}
      >
        <div>
          <h2 id="ticket-history-heading" style={{ margin: "0 0 4px" }}>
            Lịch sử gửi xe
          </h2>
          <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
            {history.total} lượt xe
          </span>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((current) => current + 1)}
          style={{
            ...inputStyle,
            width: "auto",
            cursor: "pointer",
          }}
        >
          Tải lại
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "10px",
          marginBottom: "18px",
        }}
      >
        <input
          aria-label="Tìm biển số hoặc mã vé"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Tìm biển số / mã vé"
          style={inputStyle}
        />
        <select
          aria-label="Lọc theo trạng thái"
          value={filters.status}
          onChange={(event) => updateFilter("status", event.target.value)}
          style={inputStyle}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang gửi</option>
          <option value="COMPLETED">Đã hoàn tất</option>
        </select>
        <select
          aria-label="Lọc theo thanh toán"
          value={filters.paymentStatus || ""}
          onChange={(event) =>
            updateFilter("paymentStatus", event.target.value)
          }
          style={inputStyle}
        >
          <option value="">Mọi thanh toán</option>
          <option value="PENDING">Chờ thanh toán</option>
          <option value="PAID">Đã thanh toán</option>
          <option value="UNPAID">Chưa thanh toán</option>
          <option value="UNKNOWN">Chưa xác minh</option>
          <option value="CANCELLED">Hóa đơn đã hủy</option>
        </select>
        {isManager && (
          <select
            aria-label="Lọc công nợ xe đã rời bãi"
            value={filters.unpaidDeparture}
            onChange={(event) =>
              updateFilter("unpaidDeparture", event.target.value)
            }
            style={inputStyle}
          >
            <option value="">Tất cả lượt xe</option>
            <option value="true">Xe đã rời bãi · còn nợ</option>
          </select>
        )}
        <label style={{ color: "var(--text-muted)", fontSize: "12px" }}>
          Từ ngày
          <input
            aria-label="Từ ngày"
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => updateFilter("from", event.target.value)}
            style={{ ...inputStyle, marginTop: "4px" }}
          />
        </label>
        <label style={{ color: "var(--text-muted)", fontSize: "12px" }}>
          Đến ngày
          <input
            aria-label="Đến ngày"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => updateFilter("to", event.target.value)}
            style={{ ...inputStyle, marginTop: "4px" }}
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
            minWidth: "760px",
            borderCollapse: "collapse",
            textAlign: "left",
          }}
        >
          <thead>
            <tr style={{ color: "var(--text-muted)", fontSize: "12px" }}>
              {["Mã vé", "Biển số", "Vị trí", "Giờ vào", "Giờ ra", "Trạng thái", ""].map(
                (heading) => (
                  <th
                    key={heading || "details"}
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
              history.tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td style={{ padding: "12px 8px" }}>{ticket.ticket_code}</td>
                  <td
                    style={{
                      padding: "12px 8px",
                      color: "#60a5fa",
                      fontWeight: 700,
                    }}
                  >
                    {ticket.license_plate}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    {ticket.parking_slots?.slot_code || "—"}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    {formatDateTime(ticket.check_in_time)}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    {formatDateTime(ticket.check_out_time)}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <span
                      style={{
                        color:
                          ticket.payment_status === "PENDING"
                            ? "#f59e0b"
                            : ticket.payment_status === "CANCELLED"
                              ? "#fca5a5"
                            : ticket.status === "ACTIVE"
                              ? "var(--accent-green)"
                              : "var(--text-muted)",
                      }}
                    >
                      {ticket.departed_unpaid_at &&
                      ticket.payment_status === "PENDING"
                        ? "Đã rời bãi · còn nợ"
                        : ticket.payment_status === "PENDING"
                          ? "Chờ thanh toán"
                        : ticket.payment_status === "CANCELLED"
                          ? "Đang gửi · hóa đơn đã hủy"
                        : ticket.status === "ACTIVE"
                          ? "Đang gửi"
                          : ticket.payment_status === "PAID"
                            ? ticket.settlement_method === "MANUAL"
                              ? "Hoàn tất thủ công"
                              : "Đã thanh toán"
                            : "Hoàn tất"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        cancellationLoadId.current += 1;
                        setInvoiceActionError("");
                        setInvoiceActionMessage("");
                        setSelectedTicket(ticket);
                      }}
                      style={{
                        ...inputStyle,
                        width: "auto",
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                      }}
                    >
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {isLoading && <p role="status">Đang tải lịch sử...</p>}
      {!isLoading && !errorMessage && history.tickets.length === 0 && (
        <p style={{ color: "var(--text-muted)", textAlign: "center" }}>
          Không tìm thấy lượt gửi xe phù hợp.
        </p>
      )}

      {history.totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
            marginTop: "16px",
          }}
        >
          <button
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((current) => current - 1)}
            style={inputStyle}
          >
            Trang trước
          </button>
          <span>
            {page} / {history.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= history.totalPages || isLoading}
            onClick={() => setPage((current) => current + 1)}
            style={inputStyle}
          >
            Trang sau
          </button>
        </div>
      )}

      {selectedTicket && (
        <div
          role="presentation"
          onClick={() => {
            if (!isCancellingInvoice) setSelectedTicket(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 110,
            display: "grid",
            placeItems: "center",
            padding: "16px",
            background: "rgba(0,0,0,0.75)",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-detail-title"
            onClick={(event) => event.stopPropagation()}
            className="glass-card"
            style={{ width: "100%", maxWidth: "440px" }}
          >
            <h3 id="ticket-detail-title" style={{ marginTop: 0 }}>
              Chi tiết vé {selectedTicket.ticket_code}
            </h3>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                margin: 0,
              }}
            >
              {[
                ["Biển số", selectedTicket.license_plate],
                [
                  "Trạng thái",
                  selectedTicket.payment_status === "PENDING"
                    ? selectedTicket.departed_unpaid_at
                      ? "Đã rời bãi, chưa thanh toán"
                      : "Chờ thanh toán"
                    : selectedTicket.status === "ACTIVE"
                      ? "Đang gửi"
                      : "Hoàn tất",
                ],
                [
                  "Thanh toán",
                  selectedTicket.payment_status === "PAID"
                  ? selectedTicket.settlement_method === "MANUAL"
                    ? "Hoàn tất thủ công"
                    : "Đã thanh toán"
                    : selectedTicket.payment_status === "PENDING"
                      ? "Đang chờ"
                      : selectedTicket.payment_status === "CANCELLED"
                        ? "Hóa đơn đã hủy"
                      : selectedTicket.payment_status === "UNKNOWN"
                        ? "Chưa xác minh"
                        : "Chưa thanh toán",
                ],
                ["Loại xe", selectedTicket.parking_slots?.vehicle_type || "—"],
                ["Ô đỗ", selectedTicket.parking_slots?.slot_code || "—"],
                ["Khu vực", selectedTicket.parking_slots?.zone || "—"],
                ["Giờ vào", formatDateTime(selectedTicket.check_in_time)],
                ["Giờ ra", formatDateTime(selectedTicket.check_out_time)],
                ...(selectedTicket.departed_unpaid_at
                  ? [
                      [
                        "Rời bãi khi chưa thanh toán",
                        formatDateTime(selectedTicket.departed_unpaid_at),
                      ],
                    ]
                  : []),
                ["Phí gửi xe", formatMoney(selectedTicket.total_amount)],
                ...(selectedTicket.settlement_method === "MANUAL"
                  ? [["Phương thức", "Hoàn tất thủ công bởi quản lý"]]
                  : selectedTicket.settlement_method === "SEPAY"
                    ? [["Phương thức", "Chuyển khoản SePay"]]
                    : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <dt style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                    {label}
                  </dt>
                  <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {selectedTicket.invoice_cancellations?.length > 0 && (
              <section
                aria-label="Lịch sử hóa đơn đã hủy"
                style={{
                  marginTop: 18,
                  padding: 12,
                  border: "1px solid rgba(248, 113, 113, 0.2)",
                  borderRadius: 10,
                  background: "rgba(239, 68, 68, 0.06)",
                }}
              >
                <h4 style={{ margin: "0 0 8px", color: "#fecaca" }}>
                  Lịch sử hóa đơn đã hủy
                </h4>
                {selectedTicket.invoice_cancellations.map((cancellation) => (
                  <div
                    key={`${cancellation.payment_code}-${cancellation.cancelled_at}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "6px 0",
                      color: "var(--text-muted)",
                      fontSize: 12,
                    }}
                  >
                    <span>
                      {cancellation.payment_code || "Mã thanh toán"}
                      {" · "}
                      {formatDateTime(cancellation.cancelled_at)}
                    </span>
                    <strong>{formatMoney(cancellation.amount)}</strong>
                  </div>
                ))}
              </section>
            )}
            {selectedTicket.manual_completions?.length > 0 && (
              <section
                aria-label="Lịch sử hoàn tất thủ công"
                style={{
                  marginTop: 18,
                  padding: 12,
                  border: "1px solid rgba(251, 191, 36, 0.25)",
                  borderRadius: 10,
                  background: "rgba(245, 158, 11, 0.07)",
                }}
              >
                <h4 style={{ margin: "0 0 8px", color: "#fde68a" }}>
                  Lịch sử hoàn tất thủ công
                </h4>
                {selectedTicket.manual_completions.map((completion) => (
                  <div
                    key={`${completion.completed_by}-${completion.completed_at}`}
                    style={{
                      padding: "6px 0",
                      color: "var(--text-muted)",
                      fontSize: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <span>{formatDateTime(completion.completed_at)}</span>
                      <strong>{formatMoney(completion.amount)}</strong>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      Lý do: {completion.reason}
                    </div>
                  </div>
                ))}
              </section>
            )}
            {invoiceActionError && (
              <p role="alert" style={{ color: "#fca5a5" }}>
                {invoiceActionError}
              </p>
            )}
            {invoiceActionMessage && (
              <p role="status" style={{ color: "#6ee7b7" }}>
                {invoiceActionMessage}
              </p>
            )}
            {selectedTicket.departed_unpaid_at && (
              <section
                aria-label="Công nợ xe đã rời bãi"
                style={{
                  marginTop: 16,
                  padding: 12,
                  border: "1px solid rgba(248, 113, 113, 0.3)",
                  borderRadius: 10,
                  background: "rgba(127, 29, 29, 0.12)",
                }}
              >
                <strong style={{ color: "#fca5a5" }}>
                  {selectedTicket.payment_status === "PENDING"
                    ? "Khoản cần thu: "
                    : "Đã thanh toán: "}
                  {formatMoney(selectedTicket.total_amount)}
                </strong>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 12,
                    marginTop: 6,
                  }}
                >
                  {selectedTicket.departure_reason}
                </div>
              </section>
            )}
            {selectedTicket.status === "ACTIVE" &&
              selectedTicket.payment_status === "PENDING" && (
                <section style={{ marginTop: 16 }}>
                  {!showDepartureForm ? (
                    <button
                      type="button"
                      className="cancel-invoice-button"
                      disabled={isRecordingDeparture}
                      onClick={() => {
                        setInvoiceActionError("");
                        setInvoiceActionMessage("");
                        setShowDepartureForm(true);
                      }}
                    >
                      Ghi nhận xe đã rời bãi chưa thanh toán
                    </button>
                  ) : (
                    <form
                      className="manual-completion-form"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const confirmed = window.confirm(
                          `Xác nhận xe ${selectedTicket.license_plate} đã rời bãi khi chưa thanh toán ${formatMoney(selectedTicket.total_amount)}? Ô đỗ sẽ được giải phóng nhưng hóa đơn vẫn là khoản chưa thu.`,
                        );
                        if (!confirmed) return;

                        setIsRecordingDeparture(true);
                        setInvoiceActionError("");
                        setInvoiceActionMessage("");
                        try {
                          const result = await apiFetch(
                            `/tickets/invoices/${encodeURIComponent(selectedTicket.ticket_code)}/depart-unpaid`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                reason: departureReason.trim(),
                              }),
                            },
                          );
                          const updatedTicket = {
                            ...selectedTicket,
                            status: "COMPLETED",
                            departed_unpaid_at: result.departedAt,
                            departure_reason: result.reason,
                          };
                          setSelectedTicket(updatedTicket);
                          setHistory((current) => ({
                            ...current,
                            tickets: current.tickets.map((ticket) =>
                              ticket.ticket_code === selectedTicket.ticket_code
                                ? updatedTicket
                                : ticket,
                            ),
                          }));
                          setDepartureReason("");
                          setShowDepartureForm(false);
                          setInvoiceActionMessage(
                            `Đã ghi nhận xe rời bãi. Ô ${result.slotCode} đã được giải phóng; hóa đơn vẫn chờ thu.`,
                          );
                        } catch (error) {
                          setInvoiceActionError(
                            error.message ||
                              "Không thể ghi nhận xe rời bãi chưa thanh toán.",
                          );
                        } finally {
                          setIsRecordingDeparture(false);
                        }
                      }}
                    >
                      <p>
                        Thao tác này giải phóng ô đỗ nhưng không xác nhận đã thu
                        tiền. Nhập lý do và xác nhận xe thực tế đã rời bãi.
                      </p>
                      <label>
                        Lý do ghi nhận (bắt buộc)
                        <textarea
                          required
                          minLength={3}
                          maxLength={500}
                          rows={3}
                          value={departureReason}
                          onChange={(event) =>
                            setDepartureReason(event.target.value)
                          }
                          placeholder="Ví dụ: khách rời bãi trước khi thanh toán"
                        />
                      </label>
                      <div className="manual-completion-actions">
                        <button
                          type="submit"
                          className="cancel-invoice-button"
                          disabled={
                            isRecordingDeparture ||
                            departureReason.trim().length < 3
                          }
                        >
                          {isRecordingDeparture
                            ? "Đang ghi nhận..."
                            : "Xác nhận xe đã rời"}
                        </button>
                        <button
                          type="button"
                          disabled={isRecordingDeparture}
                          onClick={() => {
                            setShowDepartureForm(false);
                            setDepartureReason("");
                          }}
                        >
                          Hủy
                        </button>
                      </div>
                    </form>
                  )}
                </section>
              )}
            {isManager &&
              selectedTicket.payment_status === "PENDING" &&
              !selectedTicket.departed_unpaid_at && (
              <div className="invoice-manager-actions">
                {!showManualCompletionForm ? (
                  <button
                    type="button"
                    disabled={isCancellingInvoice || isCompletingManually}
                    className="complete-invoice-button"
                    onClick={() => {
                      setInvoiceActionError("");
                      setInvoiceActionMessage("");
                      setShowManualCompletionForm(true);
                    }}
                  >
                    Hoàn thành thủ công
                  </button>
                ) : (
                  <form
                    className="manual-completion-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const confirmed = window.confirm(
                        `Xác nhận hoàn tất thủ công hóa đơn ${selectedTicket.ticket_code} với số tiền ${formatMoney(selectedTicket.total_amount)}? Vị trí đỗ sẽ được giải phóng và giao dịch được ghi nhận là đã thu.`,
                      );
                      if (!confirmed) return;

                      setIsCompletingManually(true);
                      setInvoiceActionError("");
                      setInvoiceActionMessage("");
                      try {
                        cancellationLoadId.current += 1;
                        const result = await apiFetch(
                          `/tickets/invoices/${encodeURIComponent(selectedTicket.ticket_code)}/complete-manually`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              reason: manualCompletionReason.trim(),
                            }),
                          },
                        );
                        const completion = {
                          amount: result.amount,
                          reason: result.reason,
                          completed_by: result.completedBy,
                          completed_at: result.completedAt,
                        };
                        setSelectedTicket((current) => ({
                          ...current,
                          status: "COMPLETED",
                          payment_status: "PAID",
                          settlement_method: "MANUAL",
                          manual_completions: [
                            completion,
                            ...(current.manual_completions || []),
                          ],
                        }));
                        setHistory((current) => ({
                          ...current,
                          tickets: current.tickets.map((ticket) =>
                            ticket.ticket_code === selectedTicket.ticket_code
                              ? {
                                  ...ticket,
                                  status: "COMPLETED",
                                  payment_status: "PAID",
                                  settlement_method: "MANUAL",
                                }
                              : ticket,
                          ),
                        }));
                        setManualCompletionReason("");
                        setShowManualCompletionForm(false);
                        setInvoiceActionMessage(
                          `Đã hoàn tất thủ công. Vị trí ${result.slotCode} đã được giải phóng.`,
                        );
                      } catch (error) {
                        setInvoiceActionError(
                          error.message || "Không thể hoàn tất hóa đơn thủ công.",
                        );
                      } finally {
                        setIsCompletingManually(false);
                      }
                    }}
                  >
                    <p>
                      Đây là thao tác quản lý, ghi nhận khoản thu thủ công và
                      giải phóng vị trí đỗ.
                    </p>
                    <label>
                      Lý do hoàn tất (bắt buộc)
                      <textarea
                        required
                        minLength={3}
                        maxLength={500}
                        rows={3}
                        value={manualCompletionReason}
                        onChange={(event) =>
                          setManualCompletionReason(event.target.value)
                        }
                        placeholder="Ví dụ: kiểm thử luồng check-out"
                      />
                    </label>
                    <div className="manual-completion-actions">
                      <button
                        type="submit"
                        className="complete-invoice-button"
                        disabled={
                          isCompletingManually ||
                          manualCompletionReason.trim().length < 3
                        }
                      >
                        {isCompletingManually
                          ? "Đang hoàn tất..."
                          : "Xác nhận hoàn tất"}
                      </button>
                      <button
                        type="button"
                        disabled={isCompletingManually}
                        onClick={() => {
                          setShowManualCompletionForm(false);
                          setManualCompletionReason("");
                        }}
                      >
                        Hủy
                      </button>
                    </div>
                  </form>
                )}
                <button
                  type="button"
                  disabled={isCancellingInvoice || isCompletingManually}
                  className="cancel-invoice-button"
                  onClick={async () => {
                    const confirmed = window.confirm(
                      `Hủy hóa đơn đang chờ thanh toán của vé ${selectedTicket.ticket_code}? Xe vẫn giữ nguyên vị trí đỗ.`,
                    );
                    if (!confirmed) return;

                    setIsCancellingInvoice(true);
                    setInvoiceActionError("");
                    setInvoiceActionMessage("");
                    try {
                      cancellationLoadId.current += 1;
                      const result = await apiFetch(
                        `/tickets/invoices/${encodeURIComponent(selectedTicket.ticket_code)}/cancel`,
                        { method: "POST" },
                      );
                      const cancellation = result.cancellation;
                      setSelectedTicket((current) => ({
                        ...current,
                        payment_status: "CANCELLED",
                        invoice_cancellations: [
                          cancellation,
                          ...(current.invoice_cancellations || []),
                        ],
                      }));
                      setHistory((current) => ({
                        ...current,
                        tickets: current.tickets.map((ticket) =>
                          ticket.ticket_code === selectedTicket.ticket_code
                            ? {
                                ...ticket,
                                payment_status: "CANCELLED",
                                invoice_cancellations: [
                                  cancellation,
                                  ...(ticket.invoice_cancellations || []),
                                ],
                              }
                            : ticket,
                        ),
                      }));
                      setInvoiceActionMessage(
                        "Đã hủy hóa đơn. Vé và vị trí đỗ vẫn được giữ nguyên.",
                      );
                    } catch (error) {
                      setInvoiceActionError(error.message || "Không thể hủy hóa đơn.");
                    } finally {
                      setIsCancellingInvoice(false);
                    }
                  }}
                >
                  {isCancellingInvoice ? "Đang hủy..." : "Hủy hóa đơn"}
                </button>
              </div>
            )}
            {selectedTicket.status === "COMPLETED" && (
              <div style={{ marginTop: 20 }}>
                <PrintableTicket ticket={selectedTicket} />
              </div>
            )}
            <button
              type="button"
              disabled={isCancellingInvoice}
              onClick={() => setSelectedTicket(null)}
              style={{
                ...inputStyle,
                marginTop: "20px",
                background: "var(--accent-blue)",
                cursor: "pointer",
              }}
            >
              Đóng
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
