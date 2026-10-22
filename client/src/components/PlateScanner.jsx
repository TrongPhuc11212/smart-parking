import { useEffect, useState } from "react";

export default function PlateScanner({
  availableSlots,
  occupiedPlates = [],
  apiFetch,
  onCheckIn,
  onCheckOut,
}) {
  const [mode, setMode] = useState("IN");
  const [imagePreview, setImagePreview] = useState(null);
  const [licensePlate, setLicensePlate] = useState("");
  const [vehicleType, setVehicleType] = useState("MOTORBIKE");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    setErrorMessage("");
    setLicensePlate("");
    setImagePreview(null);
    setSelectedSlotId("");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrorMessage("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Ảnh vượt quá giới hạn 10 MB.");
      return;
    }

    setImagePreview(URL.createObjectURL(file));
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const data = await apiFetch("/tickets/scan-plate", {
        method: "POST",
        body: formData,
      });
      if (!data.success || !data.license_plate) {
        throw new Error(
          data.message || "Không nhận diện được biển số trong ảnh.",
        );
      }

      setLicensePlate(data.license_plate);
      setVehicleType(data.vehicle_type);

      // Cảnh báo nếu xe đang đỗ trong bãi
      if (mode === "IN" && occupiedPlates.includes(data.license_plate)) {
        setErrorMessage(
          `⚠️ CẢNH BÁO TRÙNG BIỂN SỐ: Xe [${data.license_plate}] hiện đang ở trong bãi!`,
        );
      }

      // Tự chọn ô đỗ còn trống theo loại xe
      const matchedSlot = availableSlots.find(
        (s) => s.vehicle_type === data.vehicle_type,
      );
      if (matchedSlot) {
        setSelectedSlotId(matchedSlot.id);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || "Lỗi nhận diện từ AI Service.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!licensePlate) {
      return setErrorMessage("Vui lòng quét hoặc nhập biển số xe!");
    }

    if (mode === "IN") {
      if (occupiedPlates.includes(licensePlate.trim().toUpperCase())) {
        return setErrorMessage(
          `⚠️ LỖI: Xe mang biển [${licensePlate}] đã có trong bãi, không thể check-in trùng!`,
        );
      }
      if (!selectedSlotId) {
        return setErrorMessage("Vui lòng chọn một vị trí ô đỗ còn trống!");
      }

      onCheckIn(
        {
          licensePlate: licensePlate.trim().toUpperCase(),
          slotId: Number(selectedSlotId),
          ticketCode: `TCK-${Date.now().toString().slice(-6)}`,
        },
        (errMsg) => setErrorMessage(errMsg),
      );
    } else {
      onCheckOut(licensePlate.trim().toUpperCase(), (errMsg) =>
        setErrorMessage(errMsg),
      );
    }
  };

  const filteredSlots = availableSlots.filter(
    (s) => s.vehicle_type === vehicleType,
  );

  return (
    <div className="glass-card" style={{ marginBottom: "24px" }}>
      {/* Tabs Chuyển Cổng */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
        <button
          type="button"
          onClick={() => {
            setMode("IN");
            setErrorMessage("");
          }}
          style={{
            flex: 1,
            padding: "12px",
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
          type="button"
          onClick={() => {
            setMode("OUT");
            setErrorMessage("");
          }}
          style={{
            flex: 1,
            padding: "12px",
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

      {/* Cảnh báo lỗi trùng biển số */}
      {errorMessage && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "rgba(239, 68, 68, 0.2)",
            border: "1px solid #ef4444",
            borderRadius: "8px",
            color: "#fca5a5",
            fontSize: "14px",
            fontWeight: "600",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>🚨</span>
          <div>{errorMessage}</div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: "24px",
        }}
      >
        {/* Khung Tải Ảnh */}
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
            accept="image/jpeg,image/png,image/webp"
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
                alt="Vehicle"
                style={{
                  width: "100%",
                  maxHeight: "180px",
                  objectFit: "contain",
                  borderRadius: "8px",
                }}
              />
            ) : (
              <div style={{ padding: "30px 10px", color: "var(--text-muted)" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>📸</div>
                <div style={{ fontSize: "13px" }}>
                  Nhấn để tải ảnh hoặc chụp biển số xe
                </div>
              </div>
            )}
          </label>
        </div>

        {/* Thông tin Biển số */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <label style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                BIỂN SỐ NHẬN DIỆN (CÓ THỂ SỬA NHANH):
              </label>
              <span
                style={{
                  fontSize: "11px",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  backgroundColor:
                    vehicleType === "CAR" ? "#3b82f6" : "#f59e0b",
                  color: "#fff",
                  fontWeight: "bold",
                }}
              >
                {vehicleType === "CAR" ? "🚗 Ô TÔ" : "🏍️ XE MÁY"}
              </span>
            </div>

            <input
              type="text"
              value={
                isProcessing ? "Đang phân tích ảnh..." : licensePlate
              }
              onChange={(e) => {
                setLicensePlate(e.target.value.toUpperCase());
                setErrorMessage("");
              }}
              placeholder="Chờ quét ảnh hoặc nhập biển..."
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: errorMessage
                  ? "1px solid #ef4444"
                  : "1px solid var(--border-color)",
                background: "rgba(0,0,0,0.4)",
                color: "#fff",
                fontSize: "20px",
                fontWeight: "bold",
                letterSpacing: "2px",
                boxSizing: "border-box",
              }}
            />

            {mode === "IN" && (
              <div style={{ marginTop: "14px" }}>
                <label
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  CHỌN Ô ĐỖ ({vehicleType === "CAR" ? "KHU Ô TÔ" : "KHU XE MÁY"}):
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
                  <option value="">-- Chọn vị trí còn trống --</option>
                  {filteredSlots.map((s) => (
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
              ? "XÁC NHẬN MỞ CỔNG (VÀO)"
              : "XUẤT HÓA ĐƠN & MỞ CỔNG (RA)"}
          </button>
        </div>
      </form>
    </div>
  );
}
