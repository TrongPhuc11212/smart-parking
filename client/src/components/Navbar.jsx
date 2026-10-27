export default function Navbar() {
  return (
    <header className="glass-card app-brandbar">
      <div className="app-brand">
        <span className="app-brand-icon" aria-hidden="true">🅿️</span>
        <div className="app-brand-copy">
          <h2>SMART PARKING</h2>
          <small>Hệ thống quản lý bãi đỗ xe</small>
        </div>
      </div>
      <div className="app-live-status">
        <span className="app-live-indicator" aria-hidden="true" />
        <span>
          <strong>Đang hoạt động</strong>
          <small>Cập nhật trạng thái bãi xe</small>
        </span>
      </div>
    </header>
  );
}
