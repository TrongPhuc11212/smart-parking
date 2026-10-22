import { useCallback, useEffect, useRef, useState } from "react";
import PrintableTicket from "./PrintableTicket";

export default function ReceiptModal({ data, onClose, apiFetch }) {
  const [paymentResult, setPaymentResult] = useState(null);
  const [failedQrUrl, setFailedQrUrl] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceError, setVoiceError] = useState("");
  const announcedPayments = useRef(new Set());
  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const paymentStatus =
    paymentResult && paymentResult.reference === data?.paymentReference
      ? paymentResult.status
      : data?.paymentStatus;
  const paymentError =
    paymentResult && paymentResult.reference === data?.paymentReference
      ? paymentResult.error
      : "";

  const speakPaymentSuccess = useCallback(
    (reference, allowReplay = false) => {
      if (!voiceEnabled || !speechSupported || !reference) return;
      if (!allowReplay && announcedPayments.current.has(reference)) return;

      const utterance = new SpeechSynthesisUtterance(
        "Thanh toán thành công, cảm ơn quý khách.",
      );
      utterance.lang = "vi-VN";
      utterance.rate = 0.95;
      utterance.onstart = () => setVoiceError("");
      utterance.onerror = () =>
        setVoiceError("Không phát được giọng đọc trên thiết bị này.");

      if (!allowReplay) announcedPayments.current.add(reference);
      setVoiceError("");
      window.speechSynthesis.speak(utterance);
    },
    [speechSupported, voiceEnabled],
  );

  useEffect(() => {
    if (!data?.paymentReference || data.paymentStatus === "PAID") return;

    let timeoutId;
    let cancelled = false;
    const checkPayment = async () => {
      try {
        const result = await apiFetch(
          `/tickets/payment-status/${data.paymentReference}`,
        );
        if (cancelled) return;

        setPaymentResult({
          reference: data.paymentReference,
          status: result.paymentStatus,
          error: "",
        });
        if (result.paymentStatus === "PAID") {
          speakPaymentSuccess(data.paymentReference);
        } else {
          timeoutId = window.setTimeout(checkPayment, 3000);
        }
      } catch (error) {
        if (cancelled) return;
        setPaymentResult({
          reference: data.paymentReference,
          status: data.paymentStatus,
          error: error.message,
        });
        timeoutId = window.setTimeout(checkPayment, 5000);
      }
    };

    timeoutId = window.setTimeout(checkPayment, 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    apiFetch,
    data?.paymentReference,
    data?.paymentStatus,
    speakPaymentSuccess,
  ]);

  if (!data) return null;

  const amount = data.totalAmount || data.amount || 0;

  const formatTime = (timeStr) => {
    if (!timeStr) return "--:--";
    return new Date(timeStr).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 100,
        padding: "16px",
      }}
    >
      <div
        className="glass-card receipt-modal-card"
        style={{
          width: "100%",
          maxWidth: "420px",
          textAlign: "center",
          background: "#131b2e",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        }}
      >
        <h3 style={{ margin: "0 0 16px 0", color: "#fff", fontSize: "20px" }}>
          🧾 THANH TOÁN HÓA ĐƠN
        </h3>

        {/* Thông tin vé */}
        <div
          style={{
            textAlign: "left",
            background: "rgba(255,255,255,0.05)",
            padding: "14px",
            borderRadius: "10px",
            marginBottom: "16px",
            fontSize: "14px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>Biển số:</span>
            <strong style={{ color: "#60a5fa", fontSize: "16px" }}>
              {data.licensePlate || data.license_plate}
            </strong>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>Vị trí ô đỗ:</span>
            <strong style={{ color: "#34d399" }}>
              {data.slotCode || data.slot_code || "N/A"}
            </strong>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>Giờ vào:</span>
            <span>{formatTime(data.checkInTime || data.check_in_time)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)" }}>Thời gian đỗ:</span>
            <span>{data.duration || `${data.totalHours || 1} giờ`}</span>
          </div>
        </div>

        {/* Số tiền cần thanh toán */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            TỔNG TIỀN PHẢI TRẢ
          </div>
          <div
            style={{ fontSize: "26px", fontWeight: "800", color: "#f59e0b" }}
          >
            {amount.toLocaleString("vi-VN")} VNĐ
          </div>
        </div>

        {data.qrUrl && failedQrUrl !== data.qrUrl ? (
          <div
            style={{
              background: "#fff",
              padding: "10px",
              borderRadius: "12px",
              display: "inline-block",
              marginBottom: "16px",
            }}
          >
            <img
              src={data.qrUrl}
              alt="Mã QR chuyển khoản"
              onError={() => setFailedQrUrl(data.qrUrl)}
              style={{ width: "180px", height: "180px", display: "block" }}
            />
          </div>
        ) : (
          <p role="alert" style={{ color: "#fca5a5" }}>
            {data.qrUrl
              ? "Không tải được mã QR. Kiểm tra SEPAY_BANK_CODE trong server/.env (dùng mã ngân hàng, ví dụ MB), rồi tải lại hóa đơn."
              : "Chưa có mã QR thanh toán. Vui lòng liên hệ nhân viên."}
          </p>
        )}

        {data.paymentCode && (
          <p style={{ fontSize: "13px", margin: "0 0 14px" }}>
            Nội dung chuyển khoản: <strong>{data.paymentCode}</strong>
          </p>
        )}

        <p
          role={paymentError ? "alert" : "status"}
          style={{
            color: paymentError
              ? "#fca5a5"
              : paymentStatus === "PAID"
                ? "var(--accent-green)"
                : "var(--text-muted)",
            fontSize: "13px",
            margin: "0 0 14px",
          }}
        >
          {paymentError ||
            (paymentStatus === "PAID"
              ? "Đã nhận thanh toán."
              : "Đang chờ SePay xác nhận chuyển khoản...")}
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <button
            type="button"
            onClick={() => setVoiceEnabled((enabled) => !enabled)}
            disabled={!speechSupported}
          >
            {voiceEnabled ? "Tắt giọng đọc" : "Bật giọng đọc"}
          </button>
          {paymentStatus === "PAID" && (
            <button
              type="button"
              onClick={() =>
                speakPaymentSuccess(data.paymentReference, true)
              }
              disabled={!speechSupported || !voiceEnabled}
            >
              🔊 Đọc lại thông báo
            </button>
          )}
        </div>
        {voiceError && (
          <p role="status" style={{ color: "var(--text-muted)", fontSize: 12 }}>
            {voiceError}
          </p>
        )}
        {!speechSupported && (
          <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Trình duyệt hoặc thiết bị này chưa hỗ trợ giọng đọc.
          </p>
        )}

        <div className="receipt-modal-actions">
          {paymentStatus === "PAID" && (
            <PrintableTicket
              ticket={{ ...data, paymentStatus, amount }}
            />
          )}
          <button
            type="button"
            onClick={onClose}
            className="receipt-close-button"
          >
            {paymentStatus === "PAID" ? "✓ Đóng hóa đơn" : "Đóng"}
          </button>
        </div>
      </div>
    </div>
  );
}
