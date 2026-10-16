export default function ParkingMatrix({ slots }) {
  const zones = ["Khu A", "Khu B"];

  return (
    <div className="glass-card">
      <h3
        style={{
          margin: "0 0 16px 0",
          fontSize: "16px",
          letterSpacing: "-0.3px",
        }}
      >
        🗺️ SƠ ĐỒ MẶT BẰNG BÃI ĐỖ XE (REAL-TIME MATRIX)
      </h3>

      {zones.map((zoneName) => {
        const zoneSlots = slots.filter((s) => s.zone === zoneName);
        return (
          <div key={zoneName} style={{ marginBottom: "20px" }}>
            <div
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                marginBottom: "10px",
                fontWeight: "600",
              }}
            >
              {zoneName.toUpperCase()}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                gap: "12px",
              }}
            >
              {zoneSlots.map((slot) => {
                const isOccupied = slot.status === "OCCUPIED";
                return (
                  <div
                    key={slot.id}
                    style={{
                      padding: "16px 8px",
                      borderRadius: "10px",
                      textAlign: "center",
                      background: isOccupied
                        ? "rgba(239, 68, 68, 0.15)"
                        : "rgba(16, 185, 129, 0.15)",
                      border: `1px solid ${isOccupied ? "var(--accent-red)" : "var(--accent-green)"}`,
                      boxShadow: isOccupied
                        ? "0 0 12px rgba(239,68,68,0.2)"
                        : "0 0 12px rgba(16,185,129,0.2)",
                      transition: "all 0.3s ease",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "18px",
                        fontWeight: "800",
                        color: isOccupied
                          ? "var(--accent-red)"
                          : "var(--accent-green)",
                      }}
                    >
                      {slot.slot_code}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        marginTop: "4px",
                      }}
                    >
                      {slot.vehicle_type}
                    </div>
                    <div
                      style={{
                        marginTop: "8px",
                        fontSize: "10px",
                        fontWeight: "700",
                        color: isOccupied
                          ? "var(--accent-red)"
                          : "var(--accent-green)",
                      }}
                    >
                      {isOccupied ? "CÓ XE" : "TRỐNG"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
