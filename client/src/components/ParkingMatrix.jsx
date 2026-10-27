const vehicleSections = [
  { type: "CAR", label: "KHU VỰC Ô TÔ", icon: "🚘" },
  { type: "MOTORBIKE", label: "KHU VỰC XE MÁY", icon: "🏍️" },
];

export default function ParkingMatrix({ slots }) {
  const sections = vehicleSections
    .map((section) => {
      const sectionSlots = slots.filter(
        (slot) => slot.vehicle_type === section.type,
      );
      const zones = [...new Set(sectionSlots.map((slot) => slot.zone).filter(Boolean))];
      return { ...section, slots: sectionSlots, zones };
    })
    .filter((section) => section.slots.length > 0);

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

      <div className="parking-lot">
        {sections.map((section) => (
          <section
            className={`parking-lot__section parking-lot__section--${section.type.toLowerCase()}`}
            key={section.type}
            aria-label={section.label}
          >
            <h4 className="parking-lot__section-title">
              <span aria-hidden="true">{section.icon}</span>
              {section.label}
              <span className="parking-lot__section-count">
                {section.slots.length} vị trí
              </span>
            </h4>

            {section.zones.map((zoneName, index) => {
              const zoneSlots = section.slots.filter(
                (slot) => slot.zone === zoneName,
              );
              return (
                <div key={zoneName}>
                  {index > 0 && (
                    <div className="parking-lot__aisle" aria-hidden="true">
                      LỐI LƯU THÔNG
                    </div>
                  )}
                  <div className="parking-lot__zone">
                    <div className="parking-lot__zone-title">
                      <span>{zoneName.toUpperCase()}</span>
                      <span>{zoneSlots.length} ô</span>
                    </div>
                    <div className="parking-lot__slots">
                      {zoneSlots.map((slot) => {
                        const isOccupied = slot.status === "OCCUPIED";
                        return (
                          <div
                            key={slot.id}
                            className={`parking-stall ${isOccupied ? "parking-stall--occupied" : "parking-stall--available"}`}
                            aria-label={`${slot.slot_code}: ${isOccupied ? "Đang có xe" : "Còn trống"}`}
                          >
                            <strong>{slot.slot_code}</strong>
                            <span>{isOccupied ? "CÓ XE" : "TRỐNG"}</span>
                          </div>
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
    </div>
  );
}
