import { useCallback, useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import StatsOverview from "./components/StatsOverview";
import PlateScanner from "./components/PlateScanner";
import ParkingMatrix from "./components/ParkingMatrix";
import ReceiptModal from "./components/ReceiptModal";
import TicketHistory from "./components/TicketHistory";
import StaffManagement from "./components/StaffManagement";
import RevenueReport from "./components/RevenueReport";
import ParkingRateManagement from "./components/ParkingRateManagement";
import ManagerActivityLog from "./components/ManagerActivityLog";
import StaffActivityLog from "./components/StaffActivityLog";
import OperationalAlerts from "./components/OperationalAlerts";
import ParkingSlotManagement from "./components/ParkingSlotManagement";
import PublicAvailability from "./components/PublicAvailability";
import "./components/LoginScreen.css";
import { supabase } from "./services/supabase";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5001/api";

export default function App() {
  if (window.location.pathname === "/availability") {
    return <PublicAvailability apiBase={API_BASE} />;
  }

  return <StaffApp />;
}

function StaffApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [slots, setSlots] = useState([]);
  const [activeTickets, setActiveTickets] = useState([]);
  const [receiptData, setReceiptData] = useState(null);
  const [currentView, setCurrentView] = useState("dashboard");
  const [ticketSearch, setTicketSearch] = useState("");

  useEffect(() => {
    let isMounted = true;
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!isMounted) return;
        setSession(nextSession);
        setProfile(null);
        setAuthError("");
        setAuthReady(true);
      },
    );

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) setAuthError("Không thể kiểm tra phiên đăng nhập.");
        setSession(data.session);
        setAuthReady(true);
      })
      .catch(() => {
        if (isMounted) {
          setAuthError("Không thể kết nối dịch vụ đăng nhập.");
          setAuthReady(true);
        }
      });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const apiFetch = useCallback(async (path, options = {}) => {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) throw new Error("Không thể kiểm tra phiên đăng nhập.");

    let session = sessionData.session;
    if (!session) throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");

    if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
      const { data: refreshedData, error: refreshError } =
        await supabase.auth.refreshSession();
      if (refreshError || !refreshedData.session) {
        throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      }
      session = refreshedData.session;
    }

    const sendRequest = (accessToken) => {
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);
      return fetch(`${API_BASE}${path}`, { ...options, headers });
    };

    let response = await sendRequest(session.access_token);
    if (response.status === 401) {
      const { data: refreshedData, error: refreshError } =
        await supabase.auth.refreshSession();
      if (refreshError || !refreshedData.session) {
        throw new Error("Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.");
      }
      response = await sendRequest(refreshedData.session.access_token);
    }

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "Yêu cầu không thành công.");
    }
    return result;
  }, []);

  useEffect(() => {
    if (!session) return;
    let isMounted = true;

    apiFetch("/auth/me")
      .then((staffProfile) => {
        if (isMounted) setProfile(staffProfile);
      })
      .catch((error) => {
        if (isMounted) setAuthError(error.message);
      });

    return () => {
      isMounted = false;
    };
  }, [apiFetch, session]);

  const loadData = useCallback(async () => {
    try {
      const [slotsResult, ticketsResult] = await Promise.all([
        apiFetch("/slots"),
        apiFetch("/tickets/active-plates"),
      ]);
      const slotsData = Array.isArray(slotsResult) ? slotsResult : [];
      setSlots(slotsData);
      setActiveTickets(ticketsResult.plates || []);
    } catch (err) {
      console.error("Lỗi nạp dữ liệu:", err);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel("parking-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parking_slots" },
        loadData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        loadData,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") loadData();
      });

    return () => supabase.removeChannel(channel);
  }, [loadData, profile]);

  // Xử lý Check-in
  const handleCheckIn = async (body, onError) => {
    try {
      await apiFetch("/tickets/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      alert(`✓ Check-in thành công cho xe ${body.licensePlate}!`);
      loadData();
    } catch (err) {
      if (onError) onError(err.message);
    }
  };

  // Xử lý Check-out
  const handleCheckOut = async (licensePlate, onError) => {
    try {
      const result = await apiFetch("/tickets/check-out-plate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licensePlate }),
      });
      setReceiptData(result.receipt);
      loadData();
    } catch (err) {
      if (onError) onError(err.message);
    }
  };

  const availableSlots = slots.filter((s) => s.status === "AVAILABLE");

  if (!authReady) {
    return <main className="auth-message">Đang kiểm tra đăng nhập...</main>;
  }

  if (!session) {
    return (
      <LoginScreen
        error={authError}
        onLogin={async (email, password) => {
          setAuthError("");
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) setAuthError("Email hoặc mật khẩu không chính xác.");
        }}
      />
    );
  }

  if (!profile) {
    return (
      <main className="auth-message">
        {authError ? (
          <>
            <p role="alert">{authError}</p>
            <button
              type="button"
              className="app-signout-button"
              onClick={() => supabase.auth.signOut()}
            >
              Đăng xuất
            </button>
          </>
        ) : (
          "Đang xác minh quyền nhân viên..."
        )}
      </main>
    );
  }

  return (
    <div className="app-shell">
      <Navbar />
      <header className="app-toolbar">
        <nav className="app-nav" aria-label="Điều hướng bãi đỗ">
          {[
            { id: "dashboard", label: "Tổng quan bãi xe" },
            { id: "history", label: "Lịch sử vé" },
            ...(profile.role === "MANAGER"
              ? [
                  { id: "reports", label: "Báo cáo doanh thu" },
                  { id: "rates", label: "Cấu hình giá" },
                  { id: "slots", label: "Quản lý vị trí đỗ" },
                  { id: "activity", label: "Nhật ký hoạt động" },
                  { id: "staff-activity", label: "Nhật ký nhân viên" },
                  { id: "staff", label: "Quản lý nhân viên" },
                ]
              : []),
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`app-nav-button${currentView === item.id ? " is-active" : ""}`}
              onClick={() => setCurrentView(item.id)}
              aria-current={currentView === item.id ? "page" : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="app-userbar">
          <div className="app-user-identity">
            <span className="app-user-avatar" aria-hidden="true">
              {(profile.fullName || profile.email || "U").charAt(0).toUpperCase()}
            </span>
            <span className="app-user-details">
              <strong>{profile.fullName || profile.email}</strong>
              <span>{profile.role === "MANAGER" ? "Quản lý" : "Nhân viên"}</span>
            </span>
          </div>
          <button
            type="button"
            className="app-signout-button"
            onClick={() => supabase.auth.signOut()}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M8 3H4.75A1.75 1.75 0 0 0 3 4.75v10.5A1.75 1.75 0 0 0 4.75 17H8M12.5 6.5 16 10l-3.5 3.5M7 10h9" />
            </svg>
            <span>Đăng xuất</span>
          </button>
        </div>
      </header>
      {currentView === "dashboard" ? (
        <>
          <StatsOverview slots={slots} />
          <OperationalAlerts
            apiFetch={apiFetch}
            onViewTicket={(ticket) => {
              setTicketSearch(ticket.ticket_code);
              setCurrentView("history");
            }}
          />
          <PlateScanner
            availableSlots={availableSlots}
            occupiedPlates={activeTickets}
            apiFetch={apiFetch}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
          />
          <ParkingMatrix slots={slots} />
        </>
      ) : currentView === "history" ? (
        <TicketHistory
          apiFetch={apiFetch}
          isManager={profile.role === "MANAGER"}
          initialSearch={ticketSearch}
        />
      ) : currentView === "reports" ? (
        <RevenueReport apiFetch={apiFetch} />
      ) : currentView === "rates" ? (
        <ParkingRateManagement apiFetch={apiFetch} />
      ) : currentView === "slots" ? (
        <ParkingSlotManagement apiFetch={apiFetch} />
      ) : currentView === "activity" ? (
        <ManagerActivityLog apiFetch={apiFetch} />
      ) : currentView === "staff-activity" ? (
        <StaffActivityLog apiFetch={apiFetch} />
      ) : (
        <StaffManagement apiFetch={apiFetch} />
      )}
      <ReceiptModal
        data={receiptData}
        onClose={() => setReceiptData(null)}
        apiFetch={apiFetch}
      />
    </div>
  );
}

function LoginScreen({ error, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onLogin(email.trim(), password);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-screen">
      <form className="glass-card auth-card" onSubmit={handleSubmit}>
        <div className="auth-brand" aria-hidden="true">
          <span>🅿️</span>
          <span>SMART PARKING</span>
        </div>
        <div className="auth-heading">
          <h1>Đăng nhập hệ thống</h1>
          <p>Dành cho nhân viên và quản lý bãi đỗ xe.</p>
        </div>
        <label className="auth-field">
          Email
          <input
            type="email"
            autoComplete="username"
            required
            placeholder="example@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="auth-field">
          Mật khẩu
          <span className="auth-password-wrap">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="Nhập mật khẩu được cấp"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              className="auth-password-toggle"
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c5.5 0 9 7 9 7a15 15 0 0 1-3.1 3.8M6.2 6.2C3.9 7.7 3 12 3 12s3.5 7 9 7a10 10 0 0 0 3-.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
              )}
            </button>
          </span>
          <span className="auth-field-hint">
            Mật khẩu mới được quản lý tạo cần tối thiểu 12 ký tự. Nếu đã có tài
            khoản, hãy nhập mật khẩu hiện tại.
          </span>
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="auth-submit"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
        <p className="auth-footer">
          Chỉ tài khoản được quản lý cấp mới có thể truy cập hệ thống.
        </p>
      </form>
    </main>
  );
}
