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
      icon: "▦",
      tone: "blue",
      color: "var(--text-main)",
    },
    {
      label: "Đang đỗ",
      value: occupied,
      unit: "xe",
      icon: "●",
      tone: "red",
      color: "var(--accent-red)",
    },
    {
      label: "Vị trí còn trống",
      value: available,
      unit: "ô",
      icon: "✓",
      tone: "green",
      color: "var(--accent-green)",
    },
    {
      label: "Tỷ lệ lấp đầy",
      value: `${occupancyRate}%`,
      unit: "",
      icon: "%",
      tone: "violet",
      color: "var(--accent-blue)",
    },
  ];

  return (
    <div className="stats-grid">
      {stats.map((stat) => (
        <article
          key={stat.label}
          className={`glass-card stat-card stat-card--${stat.tone}`}
        >
          <div className="stat-card-heading">
            <span className="stat-icon" aria-hidden="true">
              {stat.icon}
            </span>
            <span className="stat-label">{stat.label}</span>
          </div>
          <div className="stat-value" style={{ color: stat.color }}>
            {stat.value} <span>{stat.unit}</span>
          </div>
          {stat.label === "Tỷ lệ lấp đầy" && (
            <div
              className="occupancy-track"
              role="progressbar"
              aria-label="Tỷ lệ lấp đầy"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={occupancyRate}
            >
              <span style={{ width: `${occupancyRate}%` }} />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
