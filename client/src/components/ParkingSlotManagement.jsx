import { useEffect, useState } from "react";

const EMPTY_DRAFT = {
  slotCode: "",
  zone: "",
  vehicleType: "CAR",
};

const VEHICLE_LABELS = {
  CAR: "Ô tô",
  MOTORBIKE: "Xe máy",
};

export default function ParkingSlotManagement({ apiFetch }) {
  const [slots, setSlots] = useState([]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [busySlotId, setBusySlotId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiFetch("/slots/manage", { signal: controller.signal })
      .then((result) => {
        setSlots(result.slots || []);
        setErrorMessage("");
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setErrorMessage(error.message || "Không thể tải danh sách vị trí.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [apiFetch, refreshKey]);

  const resetForm = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  };

  const submitSlot = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const isEditing = editingId !== null;
      await apiFetch(
        isEditing ? `/slots/${editingId}` : "/slots",
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotCode: draft.slotCode.trim(),
            zone: draft.zone.trim(),
            vehicleType: draft.vehicleType,
          }),
        },
      );
      setSuccessMessage(
        isEditing
          ? `Đã cập nhật vị trí ${draft.slotCode.trim().toUpperCase()}.`
          : `Đã thêm vị trí ${draft.slotCode.trim().toUpperCase()}.`,
      );
      resetForm();
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setErrorMessage(error.message || "Không thể lưu vị trí đỗ.");
    } finally {
      setIsSaving(false);
    }
  };

  const setSlotActive = async (slot, isActive) => {
    const action = isActive ? "khôi phục" : "xóa";
    const confirmed = window.confirm(
      isActive
        ? `Khôi phục vị trí ${slot.slot_code} để nhận xe?`
        : `Xóa vị trí ${slot.slot_code} khỏi danh sách sử dụng? Lịch sử vé được giữ nguyên và vị trí có thể khôi phục sau.`,
    );
    if (!confirmed) return;

    setBusySlotId(slot.id);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await apiFetch(
        isActive ? `/slots/${slot.id}/restore` : `/slots/${slot.id}`,
        { method: isActive ? "POST" : "DELETE" },
      );
      setSuccessMessage(
        isActive
          ? `Đã khôi phục vị trí ${slot.slot_code}.`
          : `Đã xóa vị trí ${slot.slot_code} khỏi danh sách sử dụng. Lịch sử vé vẫn được giữ.`,
      );
      if (editingId === slot.id) resetForm();
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setErrorMessage(error.message || `Không thể ${action} vị trí.`);
    } finally {
      setBusySlotId(null);
    }
  };

  const deleteSlotByCode = () => {
    const slotCode = draft.slotCode.trim().toUpperCase();
    if (!slotCode) {
      setErrorMessage("Nhập mã vị trí cần xóa.");
      setSuccessMessage("");
      return;
    }

    const slot = slots.find(
      (item) => item.slot_code.toUpperCase() === slotCode && item.is_active,
    );
    if (!slot) {
      setErrorMessage(`Không tìm thấy vị trí đang sử dụng có mã ${slotCode}.`);
      setSuccessMessage("");
      return;
    }

    setSlotActive(slot, false);
  };

  return (
    <section className="glass-card" aria-labelledby="parking-slots-heading">
      <h2 id="parking-slots-heading" style={{ margin: "0 0 6px" }}>
        Quản lý vị trí đỗ
      </h2>
      <p style={{ color: "var(--text-muted)", margin: "0 0 18px" }}>
        Thêm khu vực và ô đỗ tùy ý. Vị trí đang có xe hoặc vé còn hoạt động
        không thể sửa hay xóa. Xóa vị trí sẽ ngừng đưa vị trí vào sử dụng,
        giữ nguyên lịch sử vé và cho phép khôi phục sau. Để xóa nhanh, nhập
        chính xác mã vị trí rồi chọn “Xóa vị trí”.
      </p>

      {errorMessage && (
        <p role="alert" style={{ color: "#fca5a5" }}>
          {errorMessage}
        </p>
      )}
      {successMessage && (
        <p role="status" style={{ color: "#6ee7b7" }}>
          {successMessage}
        </p>
      )}

      <form
        onSubmit={submitSlot}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          alignItems: "end",
          marginBottom: 24,
          padding: 16,
          borderRadius: 12,
          border: "1px solid var(--border-color)",
          background: "rgba(0, 0, 0, 0.12)",
        }}
      >
        <label>
          Mã vị trí
          <input
            required
            maxLength={32}
            pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,31}"
            title="Dùng chữ, số, dấu gạch ngang hoặc gạch dưới."
            placeholder="Ví dụ: C-01"
            value={draft.slotCode}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                slotCode: event.target.value,
              }))
            }
          />
        </label>
        <label>
          Khu vực
          <input
            required
            maxLength={80}
            placeholder="Ví dụ: Khu C"
            value={draft.zone}
            onChange={(event) =>
              setDraft((current) => ({ ...current, zone: event.target.value }))
            }
          />
        </label>
        <label>
          Loại xe
          <select
            value={draft.vehicleType}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                vehicleType: event.target.value,
              }))
            }
          >
            <option value="CAR">Ô tô</option>
            <option value="MOTORBIKE">Xe máy</option>
          </select>
        </label>
        <div className="slot-management-actions">
          <button className="slot-management-action" type="submit" disabled={isSaving}>
            {isSaving
              ? "Đang lưu..."
              : editingId === null
                ? "Thêm vị trí"
                : "Lưu chỉnh sửa"}
          </button>
          {editingId === null && (
            <button
              type="button"
              className="cancel-invoice-button slot-management-action"
              disabled={isSaving || busySlotId !== null || isLoading}
              onClick={deleteSlotByCode}
              title="Tìm vị trí theo mã đang nhập rồi xóa khỏi danh sách sử dụng."
            >
              Xóa vị trí
            </button>
          )}
          {editingId !== null && (
            <button
              className="slot-management-action"
              type="button"
              onClick={resetForm}
              disabled={isSaving}
            >
              Hủy sửa
            </button>
          )}
        </div>
      </form>

      {isLoading ? (
        <p role="status">Đang tải danh sách vị trí...</p>
      ) : slots.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Chưa có vị trí đỗ nào.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 760,
              borderCollapse: "collapse",
              textAlign: "left",
            }}
          >
            <thead>
              <tr style={{ color: "var(--text-muted)", fontSize: 12 }}>
                {[
                  "Mã vị trí",
                  "Khu vực",
                  "Loại xe",
                  "Tình trạng",
                  "Thao tác",
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    style={{
                      padding: "10px 8px",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => {
                const isBusy =
                  busySlotId === slot.id || (isSaving && editingId === slot.id);
                return (
                  <tr key={slot.id}>
                    <td style={{ padding: "12px 8px", fontWeight: 700 }}>
                      {slot.slot_code}
                    </td>
                    <td style={{ padding: "12px 8px" }}>{slot.zone}</td>
                    <td style={{ padding: "12px 8px" }}>
                      {VEHICLE_LABELS[slot.vehicle_type] || slot.vehicle_type}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      {!slot.is_active
                        ? "Ngừng sử dụng"
                        : slot.status === "OCCUPIED"
                          ? "Đang có xe"
                          : "Còn trống"}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {slot.is_active ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy || slot.status !== "AVAILABLE"}
                              onClick={() => {
                                setDraft({
                                  slotCode: slot.slot_code,
                                  zone: slot.zone,
                                  vehicleType: slot.vehicle_type,
                                });
                                setEditingId(slot.id);
                                setErrorMessage("");
                                setSuccessMessage("");
                              }}
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className="cancel-invoice-button"
                              disabled={isBusy || slot.status !== "AVAILABLE"}
                              title={
                                slot.status !== "AVAILABLE"
                                  ? "Chỉ có thể xóa vị trí đang trống."
                                  : "Xóa vị trí khỏi danh sách sử dụng; lịch sử vé vẫn được giữ."
                              }
                              onClick={() => setSlotActive(slot, false)}
                            >
                              Xóa vị trí
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setSlotActive(slot, true)}
                          >
                            Khôi phục
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
