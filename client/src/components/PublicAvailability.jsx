import { useEffect, useState } from "react";

const REFRESH_INTERVAL_MS = 15_000;
const vehicleSections = [
  { type: "CAR", label: "KHU VỰC Ô TÔ", icon: "🚘" },
  { type: "MOTORBIKE", label: "KHU VỰC XE MÁY", icon: "🏍️" },
];

const formatTime = (value) =>
  new Date(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export default function PublicAvailability({ apiBase }) {
  const [slots, setSlots] = useState([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;
    let isRequestInFlight = false;

    const loadAvailability = async () => {
      if (isRequestInFlight) return;
      isRequestInFlight = true;
      try {
        const response = await fetch(`${apiBase}/slots/public`, {
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || "Không thể tải trạng thái bãi xe.");
        }
        if (isMounted) {
          setSlots(result.slots || []);
          setUpdatedAt(result.updatedAt || "");
          setErrorMessage("");
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.message || "Không thể kết nối đến máy chủ bãi xe.",
          );
        }
      } finally {
        isRequestInFlight = false;
        if (isMounted) setIsLoading(false);
      }
    };

    loadAvailability();
    const intervalId = window.setInterval(
      loadAvailability,
      REFRESH_INTERVAL_MS,
    );
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [apiBase]);

  const availableCount = slots.filter(
    (slot) => slot.status === "AVAILABLE",
  ).length;
  const occupiedCount = slots.length - availableCount;
  const sections = vehicleSections
    .map((section) => {
      const sectionSlots = slots.filter(
        (slot) => slot.vehicleType === section.type,
      );
      const zones = [...new Set(sectionSlots.map((slot) => slot.zone).filter(Boolean))];
      return { ...section, slots: sectionSlots, zones };
    })
    .filter((section) => section.slots.length > 0);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "24px 16px 40px",
        boxSizing: "border-box",
        color: "#f8fafc",
        background:
          "radial-gradient(ellipse at top, rgba(37, 99, 235, 0.16), transparent 46%), #080d18",
      }}
    >
      <div style={{ width: "min(100%, 1080px)", margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            padding: "20px 22px",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            borderRadius: 18,
            background: "rgba(20, 29, 48, 0.92)",
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: "#93c5fd", fontWeight: 700 }}>
              SMART PARKING
            </div>
            <h1 style={{ fontSize: "clamp(24px, 5vw, 34px)", margin: "6px 0" }}>
              Tình trạng chỗ đỗ
            </h1>
            <p style={{ color: "#94a3b8", margin: 0 }}>
              Thông tin cập nhật tự động mỗi 15 giây
            </p>
          </div>
          {updatedAt && (
            <div
              style={{
                color: "#cbd5e1",
                fontSize: 13,
                textAlign: "right",
              }}
            >
              Cập nhật lúc
              <strong style={{ display: "block", marginTop: 4 }}>
                {formatTime(updatedAt)}
              </strong>
            </div>
          )}
        </header>

        <section
          aria-label="Tổng quan vị trí đỗ"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            margin: "16px 0",
          }}
        >
          {[
            ["Còn trống", availableCount, "#34d399"],
            ["Đang sử dụng", occupiedCount, "#f87171"],
            ["Tổng vị trí", slots.length, "#e2e8f0"],
          ].map(([label, value, color]) => (
            <div
              key={label}
              style={{
                padding: "16px 18px",
                border: "1px solid rgba(148, 163, 184, 0.16)",
                borderRadius: 14,
                background: "rgba(20, 29, 48, 0.82)",
              }}
            >
              <div style={{ color: "#94a3b8", fontSize: 13 }}>{label}</div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  color,
                  marginTop: 4,
                }}
              >
                {isLoading && slots.length === 0 ? "—" : value}
                <span style={{ fontSize: 14, fontWeight: 500, marginLeft: 6 }}>
                  ô
                </span>
              </div>
            </div>
          ))}
        </section>

        {errorMessage && (
          <p
            role="alert"
            style={{
              padding: 14,
              borderRadius: 12,
              color: "#fecaca",
              background: "rgba(127, 29, 29, 0.25)",
            }}
          >
            {errorMessage}
          </p>
        )}

        {isLoading && slots.length === 0 && !errorMessage && (
          <p role="status" style={{ color: "#cbd5e1" }}>
            Đang tải sơ đồ bãi xe...
          </p>
        )}

        <div className="parking-lot">
          {sections.map((section) => (
            <section
              className={`parking-lot__section parking-lot__section--${section.type.toLowerCase()}`}
              key={section.type}
              aria-label={section.label}
            >
              <h2 className="parking-lot__section-title">
                <span aria-hidden="true">{section.icon}</span>
                {section.label}
                <span className="parking-lot__section-count">
                  {section.slots.length} vị trí
                </span>
              </h2>

              {section.zones.map((zone, index) => {
                const zoneSlots = section.slots.filter(
                  (slot) => slot.zone === zone,
                );
                return (
                  <div key={zone}>
                    {index > 0 && (
                      <div className="parking-lot__aisle" aria-hidden="true">
                        LỐI LƯU THÔNG
                      </div>
                    )}
                    <div className="parking-lot__zone">
                      <div className="parking-lot__zone-title">
                        <span>{zone.toUpperCase()}</span>
                        <span>{zoneSlots.length} ô</span>
                      </div>
                      <div className="parking-lot__slots">
                        {zoneSlots.map((slot) => {
                          const available = slot.status === "AVAILABLE";
                          return (
                            <article
                              key={slot.slotCode}
                              className={`parking-stall ${available ? "parking-stall--available" : "parking-stall--occupied"}`}
                              aria-label={`${slot.slotCode}: ${available ? "Còn trống" : "Đang sử dụng"}`}
                            >
                              <strong>{slot.slotCode}</strong>
                              <span>{available ? "CÒN TRỐNG" : "ĐANG DÙNG"}</span>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        {!isLoading && !errorMessage && slots.length === 0 && (
          <p style={{ color: "#cbd5e1", textAlign: "center", padding: 24 }}>
            Chưa có dữ liệu vị trí đỗ.
          </p>
        )}

        <p
          style={{
            color: "#94a3b8",
            fontSize: 12,
            textAlign: "center",
            lineHeight: 1.6,
            marginTop: 20,
          }}
        >
          Tình trạng có thể thay đổi nhanh. Vui lòng xác nhận lại với nhân viên
          khi đến bãi.
        </p>
      </div>
    </main>
  );
}
