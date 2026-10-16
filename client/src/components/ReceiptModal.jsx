export default function ReceiptModal({ data, onClose }) {
  if (!data) return null;

  // Cấu hình mã VietQR mẫu
  const BANK_ID = "MB";
  const ACCOUNT_NO = "0987654321";
  const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${data.totalAmount}&addInfo=GUI XE ${data.licensePlate}`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 100,
      }}
    >
      <div
        className="glass-card"
        style={{ width: "380px", textAlign: "center", background: "#131b2e" }}
      >
        <h3 style={{ margin: "0 0 8px 0", color: "var(--accent-green)" }}>
          ✓ THANH TOÁN CHECK-OUT
        </h3>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
          Mời tài xế quét mã QR chuyển khoản
        </p>

        <div
          style={{
            margin: "16px 0",
            background: "#fff",
            padding: "12px",
            borderRadius: "8px",
          }}
        >
          <img
            src={qrUrl}
            alt="VietQR"
            style={{ width: "100%", height: "auto" }}
          />
        </div>

        <div
          style={{ textAlign: "left", fontSize: "13px", marginBottom: "16px" }}
        >
          <div>
            Biển số xe: <strong>{data.licensePlate}</strong>
          </div>
          <div>
            Thời gian đỗ: <strong>{data.durationHours} giờ</strong>
          </div>
          <div
            style={{
              fontSize: "16px",
              marginTop: "6px",
              color: "var(--accent-blue)",
            }}
          >
            Tổng tiền:{" "}
            <strong>
              {Number(data.totalAmount).toLocaleString("vi-VN")} đ
            </strong>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "10px",
            background: "var(--accent-blue)",
            border: "none",
            color: "#fff",
            borderRadius: "8px",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          Hoàn tất & Mở cổng Barie
        </button>
      </div>
    </div>
  );
}
