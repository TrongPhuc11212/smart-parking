import { useEffect, useState } from "react";

const VEHICLE_LABELS = {
  MOTORBIKE: "Xe máy",
  CAR: "Ô tô",
};

const formatMoney = (value) =>
  `${Number(value || 0).toLocaleString("vi-VN")} ₫`;

export default function ParkingRateManagement({ apiFetch }) {
  const [rates, setRates] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingType, setSavingType] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let isMounted = true;
    const fetchRates = async () => {
      try {
        const result = await apiFetch("/auth/parking-rates");
        if (!isMounted) return;
        setErrorMessage("");
        setRates(result.rates);
        setDrafts(
          Object.fromEntries(
            result.rates.map((rate) => [
              rate.vehicle_type,
              {
                firstTwoHoursAmount: String(rate.first_two_hours_amount),
                additionalHourAmount: String(rate.additional_hour_amount),
              },
            ]),
          ),
        );
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error.message || "Không thể tải bảng giá.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchRates();
    return () => {
      isMounted = false;
    };
  }, [apiFetch]);

  const updateDraft = (vehicleType, field, value) => {
    setDrafts((current) => ({
      ...current,
      [vehicleType]: {
        ...current[vehicleType],
        [field]: value,
      },
    }));
  };

  const saveRate = async (vehicleType) => {
    const draft = drafts[vehicleType];
    const firstTwoHoursAmount = Number(draft?.firstTwoHoursAmount);
    const additionalHourAmount = Number(draft?.additionalHourAmount);
    if (
      !Number.isSafeInteger(firstTwoHoursAmount) ||
      !Number.isSafeInteger(additionalHourAmount) ||
      firstTwoHoursAmount < 0 ||
      additionalHourAmount < 0 ||
      firstTwoHoursAmount > 100_000_000 ||
      additionalHourAmount > 100_000_000
    ) {
      setErrorMessage("Mỗi mức giá cần là số nguyên từ 0 đến 100.000.000 đồng.");
      setSuccessMessage("");
      return;
    }

    setSavingType(vehicleType);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const result = await apiFetch(`/auth/parking-rates/${vehicleType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstTwoHoursAmount, additionalHourAmount }),
      });
      const updated = result.rate;
      setRates((current) =>
        current.map((rate) =>
          rate.vehicle_type === vehicleType ? updated : rate,
        ),
      );
      setDrafts((current) => ({
        ...current,
        [vehicleType]: {
          firstTwoHoursAmount: String(updated.first_two_hours_amount),
          additionalHourAmount: String(updated.additional_hour_amount),
        },
      }));
      setSuccessMessage(`Đã cập nhật giá gửi ${VEHICLE_LABELS[vehicleType]}.`);
    } catch (error) {
      setErrorMessage(error.message || "Không thể cập nhật bảng giá.");
    } finally {
      setSavingType("");
    }
  };

  return (
    <section className="glass-card" aria-labelledby="parking-rates-heading">
      <h2 id="parking-rates-heading" style={{ margin: "0 0 6px" }}>
        Cấu hình giá gửi xe
      </h2>
      <p style={{ margin: "0 0 22px", color: "var(--text-muted)" }}>
        Thay đổi giá áp dụng cho các lượt check-out mới. Vé đã tạo và đang chờ
        thanh toán giữ nguyên mức phí ban đầu.
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
      {isLoading ? (
        <p role="status">Đang tải bảng giá...</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {rates.map((rate) => {
            const draft = drafts[rate.vehicle_type] || {};
            const isDirty =
              Number(draft.firstTwoHoursAmount) !==
                rate.first_two_hours_amount ||
              Number(draft.additionalHourAmount) !==
                rate.additional_hour_amount;

            return (
              <form
                key={rate.vehicle_type}
                className="rate-card"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveRate(rate.vehicle_type);
                }}
              >
                <div>
                  <h3 style={{ margin: "0 0 4px" }}>
                    {VEHICLE_LABELS[rate.vehicle_type] || rate.vehicle_type}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      color: "var(--text-muted)",
                      fontSize: 13,
                    }}
                  >
                    Mức hiện tại:{" "}
                    {formatMoney(rate.first_two_hours_amount)} / 2 giờ đầu
                  </p>
                </div>

                <label>
                  Phí cho 2 giờ đầu (VNĐ)
                  <input
                    type="number"
                    min="0"
                    max="100000000"
                    step="1000"
                    required
                    value={draft.firstTwoHoursAmount ?? ""}
                    onChange={(event) =>
                      updateDraft(
                        rate.vehicle_type,
                        "firstTwoHoursAmount",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  Phụ phí mỗi giờ tiếp theo (VNĐ)
                  <input
                    type="number"
                    min="0"
                    max="100000000"
                    step="1000"
                    required
                    value={draft.additionalHourAmount ?? ""}
                    onChange={(event) =>
                      updateDraft(
                        rate.vehicle_type,
                        "additionalHourAmount",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <div className="rate-preview">
                  <span>Ví dụ gửi 3 giờ</span>
                  <strong>
                    {formatMoney(
                      Number(draft.firstTwoHoursAmount || 0) +
                        Number(draft.additionalHourAmount || 0),
                    )}
                  </strong>
                </div>

                <button
                  type="submit"
                  disabled={!isDirty || savingType === rate.vehicle_type}
                >
                  {savingType === rate.vehicle_type
                    ? "Đang lưu..."
                    : "Lưu bảng giá"}
                </button>
              </form>
            );
          })}
          {rates.length === 0 && (
            <p style={{ color: "var(--text-muted)" }}>
              Chưa có dữ liệu giá gửi xe.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
