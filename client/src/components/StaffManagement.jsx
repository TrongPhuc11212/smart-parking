import { useEffect, useState } from "react";

export default function StaffManagement({ apiFetch }) {
  const [staff, setStaff] = useState([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("STAFF");
  const [editingStaff, setEditingStaff] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const loadStaff = async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const result = await apiFetch("/auth/staff");
      setStaff(result.staff);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    apiFetch("/auth/staff")
      .then((result) => {
        if (isMounted) setStaff(result.staff);
      })
      .catch((error) => {
        if (isMounted) setErrorMessage(error.message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [apiFetch]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsCreating(true);
    setMessage("");
    setErrorMessage("");
    try {
      await apiFetch("/auth/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, password, role }),
      });
      setMessage(`Đã tạo tài khoản ${role === "MANAGER" ? "quản lý" : "nhân viên"} ${email}.`);
      setEmail("");
      setFullName("");
      setPassword("");
      setRole("STAFF");
      await loadStaff();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const startEditing = (person) => {
    setEditingStaff(person.user_id);
    setEditForm({
      email: person.email,
      fullName: person.full_name || "",
      role: person.role,
      isActive: person.is_active,
      password: "",
    });
    setMessage("");
    setErrorMessage("");
  };

  const saveStaff = async (event) => {
    event.preventDefault();
    setIsCreating(true);
    setMessage("");
    setErrorMessage("");
    try {
      const body = { ...editForm };
      if (!body.password) delete body.password;
      await apiFetch(`/auth/staff/${editingStaff}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setMessage("Đã cập nhật tài khoản nhân viên.");
      setEditingStaff(null);
      setEditForm(null);
      await loadStaff();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const toggleStaffStatus = async (person) => {
    const action = person.is_active ? "khóa" : "mở khóa";
    if (!window.confirm(`Bạn có chắc muốn ${action} tài khoản ${person.email}?`)) {
      return;
    }
    setErrorMessage("");
    setMessage("");
    try {
      await apiFetch(`/auth/staff/${person.user_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: person.email,
          fullName: person.full_name || "",
          role: person.role,
          isActive: !person.is_active,
        }),
      });
      setMessage(`Đã ${action} tài khoản ${person.email}.`);
      await loadStaff();
    } catch (error) {
      setErrorMessage(error.message);
    }
  };

  return (
    <section className="glass-card" aria-labelledby="staff-management-heading">
      <h2 id="staff-management-heading" style={{ marginTop: 0 }}>
        Quản lý nhân viên
      </h2>
      <p style={{ color: "var(--text-muted)" }}>
        Quản lý có thể tạo tài khoản, chỉnh sửa hồ sơ/quyền và khóa hoặc mở khóa tài khoản.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          alignItems: "end",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <label>
          Họ tên
          <input
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>
        <label>
          Email đăng nhập
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Mật khẩu tạm thời (ít nhất 12 ký tự)
          <input
            type="password"
            minLength={12}
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          Vai trò
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="STAFF">Nhân viên</option>
            <option value="MANAGER">Quản lý</option>
          </select>
        </label>
        <button type="submit" disabled={isCreating}>
          {isCreating ? "Đang tạo..." : "Tạo tài khoản"}
        </button>
      </form>

      {message && <p role="status">{message}</p>}
      {errorMessage && (
        <p role="alert" style={{ color: "#fca5a5" }}>
          {errorMessage}
        </p>
      )}
      {isLoading ? (
        <p role="status">Đang tải danh sách...</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
            }}
          >
            <thead>
              <tr>
                <th style={{ padding: "10px" }}>Nhân viên</th>
                <th style={{ padding: "10px" }}>Email</th>
                <th style={{ padding: "10px" }}>Vai trò</th>
                <th style={{ padding: "10px" }}>Trạng thái</th>
                <th style={{ padding: "10px" }}>Ngày tạo</th>
                <th style={{ padding: "10px" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((person) => (
                <tr key={person.user_id}>
                  <td style={{ padding: "10px" }}>{person.full_name || "—"}</td>
                  <td style={{ padding: "10px" }}>{person.email}</td>
                  <td style={{ padding: "10px" }}>
                    {person.role === "MANAGER" ? "Quản lý" : "Nhân viên"}
                  </td>
                  <td style={{ padding: "10px" }}>
                    {person.is_active ? "Đang hoạt động" : "Đã khóa"}
                  </td>
                  <td style={{ padding: "10px" }}>
                    {person.created_at
                      ? new Date(person.created_at).toLocaleDateString("vi-VN")
                      : "—"}
                  </td>
                  <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                    <button type="button" onClick={() => startEditing(person)}>
                      Sửa
                    </button>{" "}
                    <button
                      type="button"
                      onClick={() => toggleStaffStatus(person)}
                    >
                      {person.is_active ? "Khóa" : "Mở khóa"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingStaff && editForm && (
        <div
          role="presentation"
          onClick={() => setEditingStaff(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            display: "grid",
            placeItems: "center",
            padding: "16px",
            background: "rgba(0,0,0,0.75)",
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-staff-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={saveStaff}
            className="glass-card"
            style={{
              width: "min(100%, 460px)",
              display: "grid",
              gap: "14px",
            }}
          >
            <h3 id="edit-staff-title" style={{ margin: 0 }}>
              Chỉnh sửa tài khoản
            </h3>
            <label>
              Họ tên
              <input
                required
                value={editForm.fullName}
                onChange={(event) =>
                  setEditForm({ ...editForm, fullName: event.target.value })
                }
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                value={editForm.email}
                onChange={(event) =>
                  setEditForm({ ...editForm, email: event.target.value })
                }
              />
            </label>
            <label>
              Vai trò
              <select
                value={editForm.role}
                onChange={(event) =>
                  setEditForm({ ...editForm, role: event.target.value })
                }
              >
                <option value="STAFF">Nhân viên</option>
                <option value="MANAGER">Quản lý</option>
              </select>
            </label>
            <label>
              Mật khẩu mới (để trống nếu không đổi)
              <input
                type="password"
                minLength={12}
                autoComplete="new-password"
                value={editForm.password}
                onChange={(event) =>
                  setEditForm({ ...editForm, password: event.target.value })
                }
              />
            </label>
            <label>
              <span>Trạng thái tài khoản</span>
              <select
                value={editForm.isActive ? "active" : "inactive"}
                onChange={(event) =>
                  setEditForm({
                    ...editForm,
                    isActive: event.target.value === "active",
                  })
                }
              >
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Đã khóa</option>
              </select>
            </label>
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="submit" disabled={isCreating}>
                {isCreating ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                disabled={isCreating}
              >
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
