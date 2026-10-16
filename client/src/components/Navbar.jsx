export default function Navbar() {
  return (
    <header
      className="glass-card"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "24px",
        borderRadius: "0 0 16px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "28px" }}>🅿️</span>
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: "700",
              letterSpacing: "-0.5px",
            }}
          >
            SMART PARKING OS
          </h2>
          <small style={{ color: "var(--text-muted)", fontSize: "12px" }}>
            AI-Powered Automated Management System
          </small>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span
          style={{
            width: "10px",
            height: "10px",
            backgroundColor: "var(--accent-green)",
            borderRadius: "50%",
            display: "inline-block",
            boxShadow: "0 0 8px #10b981",
          }}
        ></span>
        <span style={{ fontSize: "13px", fontWeight: "500" }}>
          Cloud Real-time Active
        </span>
      </div>
    </header>
  );
}
