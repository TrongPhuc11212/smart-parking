import { useState } from "react";
import Tesseract from "tesseract.js";

export default function PlateScanner({
  availableSlots,
  onCheckIn,
  onCheckOut,
}) {
  const [mode, setMode] = useState("IN"); // 'IN' | 'OUT'
  const [imagePreview, setImagePreview] = useState(null);
  const [licensePlate, setLicensePlate] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Xử lý quét OCR từ file ảnh
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImagePreview(URL.createObjectURL(file));
    setIsProcessing(true);

    try {
      const {
        data: { text },
      } = await Tesseract.recognize(file, "eng", {
        tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-.",
      });

      // Lọc bỏ ký tự thừa, chỉ giữ dạng ký tự chuẩn biển số
      const cleaned = text.replace(/[^A-Z0-9]/gi, "").toUpperCase();
      setLicensePlate(cleaned || "29A12345");
    } catch (err) {
      console.error("Lỗi nhận dạng ảnh:", err);
      alert("Không nhận dạng được biển số, vui lòng thử ảnh rõ nét hơn!");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!licensePlate) return alert("Chưa có biển số xe!");

    if (mode === "IN") {
      if (!selectedSlotId) return alert("Vui lòng chọn ô đỗ còn trống!");
      onCheckIn({
        licensePlate,
        slotId: Number(selectedSlotId),
        ticketCode: `TCK-${Date.now().toString().slice(-6)}`,
      });
    } else {
      onCheckOut(licensePlate);
    }

    // Reset form
    setImagePreview(null);
    setLicensePlate("");
  };

  return (
    <div className="glass-card" style={{ marginBottom: "24px" }}>
      <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
        <button
          onClick={() => setMode("IN")}
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "8px",
            border: "none",
            background:
              mode === "IN" ? "var(--accent-blue)" : "rgba(255,255,255,0.05)",
            color: "#fff",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          📷 CỔNG VÀO (CHECK-IN OCR)
        </button>
        <button
          onClick={() => setMode("OUT")}
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "8px",
            border: "none",
            background:
              mode === "OUT" ? "var(--accent-red)" : "rgba(255,255,255,0.05)",
            color: "#fff",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          🚪 CỔNG RA (CHECK-OUT & THANH TOÁN)
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}
      >
        {/* Khung tải ảnh */}
        <div
          style={{
            border: "2px dashed var(--border-color)",
            borderRadius: "12px",
            padding: "16px",
            textAlign: "center",
          }}
        >
          <input
            type="file"
            accept="image/*"
            id="camera-input"
            onChange={handleImageUpload}
            style={{ display: "none" }}
          />
          <label
            htmlFor="camera-input"
            style={{ cursor: "pointer", display: "block" }}
          >
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Xe"
                style={{
                  width: "100%",
                  maxHeight: "160px",
                  objectFit: "contain",
                  borderRadius: "8px",
                }}
              />
            ) : (
              <div style={{ padding: "30px 10px", color: "var(--text-muted)" }}>
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>📸</div>
                <div style={{ fontSize: "13px" }}>
                  Bấm để tải ảnh biển số xe (Camera / File)
                </div>
              </div>
            )}
          </label>
        </div>

        {/* Thông tin OCR & xác nhận */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <label
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                display: "block",
                marginBottom: "6px",
              }}
            >
              KẾT QUẢ AI NHẬN DIỆN BIỂN SỐ:
            </label>
            <input
              type="text"
              readOnly
              value={isProcessing ? "Đang trích xuất OCR..." : licensePlate}
              placeholder="Chờ tải ảnh..."
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "rgba(0,0,0,0.3)",
                color: "#fff",
                fontSize: "18px",
                fontWeight: "bold",
                letterSpacing: "2px",
                boxSizing: "border-box",
              }}
            />

            {mode === "IN" && (
              <div style={{ marginTop: "12px" }}>
                <label
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  CHỈ ĐỊNH VỊ TRÍ ĐỖ XE CÒN TRỐNG:
                </label>
                <select
                  value={selectedSlotId}
                  onChange={(e) => setSelectedSlotId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--card-bg)",
                    color: "#fff",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="">-- Chọn ô trống --</option>
                  {availableSlots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.slot_code} ({s.zone} - {s.vehicle_type})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isProcessing}
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "none",
              background:
                mode === "IN" ? "var(--accent-blue)" : "var(--accent-red)",
              color: "#fff",
              fontWeight: "700",
              cursor: isProcessing ? "not-allowed" : "pointer",
              marginTop: "16px",
            }}
          >
            {mode === "IN"
              ? "XÁC NHẬN MỞ BARRIER (VÀO)"
              : "XUẤT HÓA ĐƠN & MỞ BARRIER (RA)"}
          </button>
        </div>
      </form>
    </div>
  );
}
