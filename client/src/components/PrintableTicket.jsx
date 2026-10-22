const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

const formatMoney = (value) =>
  value == null ? "—" : `${Number(value).toLocaleString("vi-VN")} VNĐ`;

export default function PrintableTicket({ ticket }) {
  const ticketCode = ticket.ticketCode || ticket.ticket_code || "—";
  const licensePlate = ticket.licensePlate || ticket.license_plate || "—";
  const slotCode =
    ticket.slotCode || ticket.slot_code || ticket.parking_slots?.slot_code || "—";
  const checkInTime = ticket.checkInTime || ticket.check_in_time;
  const checkOutTime = ticket.checkOutTime || ticket.check_out_time;
  const amount = ticket.amount ?? ticket.totalAmount ?? ticket.total_amount;
  const paymentStatus = ticket.paymentStatus || ticket.payment_status;
  const paymentLabel =
    paymentStatus === "PAID"
      ? ticket.settlement_method === "MANUAL"
        ? "Hoàn tất thủ công"
        : "Đã thanh toán"
      : paymentStatus === "PENDING"
        ? "Đang chờ thanh toán"
        : paymentStatus === "UNKNOWN"
          ? "Chưa xác minh"
            : paymentStatus === "CANCELLED"
              ? "Hóa đơn đã hủy"
            : "Chưa thanh toán";

  return (
    <>
      <button
        type="button"
        className="print-action-button"
        onClick={() => window.print()}
      >
        In hóa đơn
      </button>
      <article className="print-document">
        <header className="print-document-header">
          <div className="print-document-brand">SMART PARKING</div>
          <h1>HÓA ĐƠN GỬI XE</h1>
          <p>Mã vé: {ticketCode}</p>
        </header>
        <dl className="print-document-details">
          <div>
            <dt>Biển số xe</dt>
            <dd>{licensePlate}</dd>
          </div>
          <div>
            <dt>Vị trí đỗ</dt>
            <dd>{slotCode}</dd>
          </div>
          <div>
            <dt>Giờ vào</dt>
            <dd>{formatDateTime(checkInTime)}</dd>
          </div>
          <div>
            <dt>Giờ ra</dt>
            <dd>{formatDateTime(checkOutTime)}</dd>
          </div>
          {ticket.duration && (
            <div>
              <dt>Thời gian gửi</dt>
              <dd>{ticket.duration}</dd>
            </div>
          )}
          <div>
            <dt>Thanh toán</dt>
            <dd>{paymentLabel}</dd>
          </div>
        </dl>
        <div className="print-document-total">
          <span>Tổng cộng</span>
          <strong>{formatMoney(amount)}</strong>
        </div>
        <footer className="print-document-footer">
          Cảm ơn quý khách đã sử dụng dịch vụ.
        </footer>
      </article>
    </>
  );
}
