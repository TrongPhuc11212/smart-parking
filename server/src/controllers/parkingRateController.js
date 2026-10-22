import { createSupabaseAdminClient } from "../config/supabase.js";
import { recordManagerActivity } from "../services/managerActivityLog.js";

const VEHICLE_TYPES = ["MOTORBIKE", "CAR"];
const MAX_RATE_AMOUNT = 100_000_000;

export const getParkingRates = async (_req, res) => {
  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase
      .from("parking_rates")
      .select("vehicle_type, first_two_hours_amount, additional_hour_amount, updated_at")
      .order("vehicle_type", { ascending: true });
    if (error) throw error;
    res.json({ rates: data || [] });
  } catch (error) {
    console.error("Lỗi tải bảng giá gửi xe:", error.message);
    if (error.code === "42P01" || error.code === "PGRST205") {
      return res.status(503).json({
        message:
          "Chưa cài đặt bảng giá gửi xe. Hãy chạy migration 20261020500000_parking_rate_management.sql trong Supabase SQL Editor.",
      });
    }
    res.status(500).json({ message: "Không thể tải bảng giá gửi xe." });
  }
};

export const updateParkingRate = async (req, res) => {
  const vehicleType = req.params.vehicleType;
  const { firstTwoHoursAmount, additionalHourAmount } = req.body;
  const isValidAmount = (value) =>
    Number.isSafeInteger(value) && value >= 0 && value <= MAX_RATE_AMOUNT;

  if (
    !VEHICLE_TYPES.includes(vehicleType) ||
    !isValidAmount(firstTwoHoursAmount) ||
    !isValidAmount(additionalHourAmount)
  ) {
    return res.status(400).json({
      message:
        "Giá gửi xe phải là số nguyên từ 0 đến 100.000.000 đồng cho mỗi mức.",
    });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase.rpc("update_parking_rate", {
      p_actor_id: req.user.id,
      p_vehicle_type: vehicleType,
      p_first_two_hours_amount: firstTwoHoursAmount,
      p_additional_hour_amount: additionalHourAmount,
    });
    if (error) throw error;
    if (!data.success) {
      const status = data.code === "rate_not_found" ? 404 : 403;
      return res.status(status).json({ message: data.message });
    }
    try {
      await recordManagerActivity(req.user, {
        action: "PARKING_RATE_UPDATED",
        targetType: "PARKING_RATE",
        targetId: vehicleType,
        details: {
          firstTwoHoursAmount,
          additionalHourAmount,
        },
      });
    } catch (auditError) {
      console.error("Không ghi được nhật ký cập nhật bảng giá:", auditError.message);
      return res.status(500).json({
        message:
          "Bảng giá đã được cập nhật nhưng không ghi được nhật ký hoạt động. Không lặp lại thao tác; hãy kiểm tra cấu hình nhật ký.",
      });
    }
    res.json({ rate: data.rate });
  } catch (error) {
    console.error("Lỗi cập nhật bảng giá gửi xe:", error.message);
    if (error.code === "PGRST202" || error.code === "42883") {
      return res.status(503).json({
        message:
          "Chưa cài đặt cập nhật bảng giá. Hãy chạy migration 20261020500000_parking_rate_management.sql trong Supabase SQL Editor.",
      });
    }
    res.status(500).json({ message: "Không thể cập nhật bảng giá gửi xe." });
  }
};
