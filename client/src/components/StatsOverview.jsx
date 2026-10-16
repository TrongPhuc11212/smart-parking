export default function StatsOverview({ slots }) {
  const total = slots.length;
  const occupied = slots.filter((s) => s.status === "OCCUPIED").length;
  const available = total - occupied;
  const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

  const stats = [
    {
      label: "Tổng số vị trí",
      value: total,
      unit: "ô",
      color: "var(--text-main)",
    },
    {
      label: "Đang đỗ",
      value: occupied,
      unit: "xe",
      color: "var(--accent-red)",
    },
    {
      label: "Vị trí còn trống",
      value: available,
      unit: "ô",
      color: "var(--accent-green)",
    },
    {
      label: "Tỷ lệ lấp đầy",
      value: `${occupancyRate}%`,
      unit: "",
      color: "var(--accent-blue)",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "16px",
        marginBottom: "24px",
      }}
    >
      {stats.map((stat, idx) => (
        <div key={idx} className="glass-card">
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "13px",
              marginBottom: "8px",
            }}
          >
            {stat.label}
          </div>
          <div
            style={{ fontSize: "28px", fontWeight: "700", color: stat.color }}
          >
            {stat.value}{" "}
            <span
              style={{
                fontSize: "14px",
                fontWeight: "400",
                color: "var(--text-muted)",
              }}
            >
              {stat.unit}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
