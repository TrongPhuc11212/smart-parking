import { createSupabaseAdminClient } from "../config/supabase.js";

// Lấy danh sách toàn bộ ô đỗ xe
export const getSlots = async (req, res) => {
  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase
      .from("parking_slots")
      .select("*")
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getPublicSlots = async (_req, res) => {
  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase
      .from("parking_slots")
      .select("slot_code, status, zone, vehicle_type")
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (error) throw error;
    res.set("Cache-Control", "no-store");
    res.json({
      slots: (data || []).map((slot) => ({
        slotCode: slot.slot_code,
        status: slot.status === "AVAILABLE" ? "AVAILABLE" : "OCCUPIED",
        zone: slot.zone,
        vehicleType: slot.vehicle_type,
      })),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Lỗi tải trạng thái bãi xe công khai:", error.message);
    res.status(500).json({
      message: "Không thể tải trạng thái bãi xe. Vui lòng thử lại.",
    });
  }
};

export const getSlotsForManagement = async (_req, res) => {
  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase
      .from("parking_slots")
      .select("id, slot_code, status, zone, vehicle_type, is_active")
      .order("id", { ascending: true });

    if (error) throw error;
    res.json({ slots: data || [] });
  } catch (error) {
    console.error("Lỗi tải danh sách vị trí quản lý:", error.message);
    if (error.code === "42703") {
      return res.status(503).json({
        message:
          "Chưa cài đặt quản lý vị trí đỗ. Hãy chạy migration 20261021100000_parking_slot_management.sql trong Supabase SQL Editor.",
      });
    }
    res.status(500).json({ message: "Không thể tải danh sách vị trí đỗ." });
  }
};

const normalizeSlotInput = (body = {}) => ({
  slotCode: typeof body.slotCode === "string" ? body.slotCode.trim() : "",
  zone: typeof body.zone === "string" ? body.zone.trim() : "",
  vehicleType: body.vehicleType,
});

const validateSlotInput = ({ slotCode, zone, vehicleType }) =>
  /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(slotCode) &&
  zone.length >= 1 &&
  zone.length <= 80 &&
  ["CAR", "MOTORBIKE"].includes(vehicleType);

const rpcErrorResponse = (res, error, action) => {
  console.error(`Lỗi ${action} vị trí đỗ:`, error.message);
  if (error.code === "PGRST202" || error.code === "42883") {
    return res.status(503).json({
      message:
        "Chưa cài đặt quản lý vị trí đỗ. Hãy chạy migration 20261021100000_parking_slot_management.sql trong Supabase SQL Editor.",
    });
  }
  res.status(500).json({ message: `Không thể ${action} vị trí đỗ.` });
};

const respondToSlotRpc = (res, data) => {
  if (data.success) return res.json(data);
  const status =
    data.code === "slot_not_found"
      ? 404
      : data.code === "actor_not_manager"
        ? 403
        : data.code === "slot_code_exists" || data.code === "slot_occupied"
          ? 409
          : 400;
  return res.status(status).json({ message: data.message });
};

export const createParkingSlot = async (req, res) => {
  const input = normalizeSlotInput(req.body);
  if (!validateSlotInput(input)) {
    return res.status(400).json({
      message:
        "Mã ô chỉ gồm chữ, số, gạch ngang hoặc gạch dưới (tối đa 32 ký tự); khu vực tối đa 80 ký tự; hãy chọn loại xe hợp lệ.",
    });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase.rpc("create_parking_slot", {
      p_actor_id: req.user.id,
      p_slot_code: input.slotCode,
      p_zone: input.zone,
      p_vehicle_type: input.vehicleType,
    });
    if (error) return rpcErrorResponse(res, error, "thêm");
    return respondToSlotRpc(res, data);
  } catch (error) {
    return rpcErrorResponse(res, error, "thêm");
  }
};

export const updateParkingSlot = async (req, res) => {
  const slotId = Number(req.params.id);
  const input = normalizeSlotInput(req.body);
  if (
    !Number.isSafeInteger(slotId) ||
    slotId < 1 ||
    !validateSlotInput(input)
  ) {
    return res.status(400).json({ message: "Thông tin vị trí đỗ không hợp lệ." });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase.rpc("update_parking_slot", {
      p_actor_id: req.user.id,
      p_slot_id: slotId,
      p_slot_code: input.slotCode,
      p_zone: input.zone,
      p_vehicle_type: input.vehicleType,
    });
    if (error) return rpcErrorResponse(res, error, "cập nhật");
    return respondToSlotRpc(res, data);
  } catch (error) {
    return rpcErrorResponse(res, error, "cập nhật");
  }
};

export const setParkingSlotActive = async (req, res) => {
  const slotId = Number(req.params.id);
  if (!Number.isSafeInteger(slotId) || slotId < 1) {
    return res.status(400).json({ message: "Mã vị trí đỗ không hợp lệ." });
  }

  const isActive = req.method === "POST";
  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase.rpc("set_parking_slot_active", {
      p_actor_id: req.user.id,
      p_slot_id: slotId,
      p_is_active: isActive,
    });
    if (error) return rpcErrorResponse(res, error, "cập nhật trạng thái");
    return respondToSlotRpc(res, data);
  } catch (error) {
    return rpcErrorResponse(res, error, "cập nhật trạng thái");
  }
};
