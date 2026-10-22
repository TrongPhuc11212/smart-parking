import { createSupabaseAdminClient } from "../config/supabase.js";
import { recordManagerActivity } from "../services/managerActivityLog.js";

export const getCurrentStaff = (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    fullName: req.user.fullName,
  });
};

export const listStaff = async (_req, res) => {
  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase
      .from("staff_profiles")
      .select("user_id, email, full_name, role, is_active, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    res.json({ staff: data || [] });
  } catch (error) {
    console.error("Lỗi tải danh sách nhân viên:", error.message);
    res.status(500).json({ message: "Không thể tải danh sách nhân viên." });
  }
};

const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

export const createStaff = async (req, res) => {
  const email =
    typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body.password;
  const fullName =
    typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";
  const role = req.body.role || "STAFF";

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== "string" ||
    password.length < 12 ||
    !fullName ||
    !["MANAGER", "STAFF"].includes(role)
  ) {
    return res.status(400).json({
      message:
        "Vui lòng nhập email hợp lệ, họ tên và mật khẩu có ít nhất 12 ký tự.",
    });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      if (error.code === "email_exists") {
        return res.status(409).json({ message: "Email này đã có tài khoản." });
      }
      throw error;
    }

    if (role === "MANAGER") {
      const { data: profile, error: profileError } = await adminSupabase
        .from("staff_profiles")
        .update({ role })
        .eq("user_id", data.user.id)
        .select("user_id")
        .maybeSingle();
      if (profileError || !profile) {
        console.error(
          "Không thể cấp vai trò quản lý:",
          profileError?.message || "Không tìm thấy hồ sơ nhân viên.",
        );
        return res.status(500).json({
          message:
            "Tài khoản đã tạo nhưng chưa cấp được vai trò. Hãy tải lại danh sách và cập nhật quyền.",
        });
      }
    }

    try {
      await recordManagerActivity(req.user, {
        action: "STAFF_CREATED",
        targetType: "STAFF",
        targetId: data.user.id,
        details: { email: data.user.email, fullName, role },
      });
    } catch (auditError) {
      console.error("Không ghi được nhật ký tạo nhân viên:", auditError.message);
      return res.status(500).json({
        message:
          "Tài khoản đã được tạo nhưng không ghi được nhật ký hoạt động. Không tạo lại tài khoản; hãy kiểm tra cấu hình nhật ký.",
      });
    }

    res.status(201).json({
      staff: {
        id: data.user.id,
        email: data.user.email,
        fullName,
        role,
        is_active: true,
      },
    });
  } catch (error) {
    console.error("Lỗi tạo tài khoản nhân viên:", error.message);
    res.status(500).json({ message: "Không thể tạo tài khoản nhân viên." });
  }
};

export const updateStaff = async (req, res) => {
  const { id } = req.params;
  const email =
    typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const fullName =
    typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";
  const role = req.body.role;
  const isActive = req.body.isActive;
  const password = req.body.password;

  if (
    !isUuid(id) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !fullName ||
    !["MANAGER", "STAFF"].includes(role) ||
    typeof isActive !== "boolean" ||
    (password !== undefined &&
      (typeof password !== "string" || password.length < 12))
  ) {
    return res.status(400).json({
      message: "Thông tin nhân viên không hợp lệ. Mật khẩu mới cần ít nhất 12 ký tự.",
    });
  }

  if (id === req.user.id && (!isActive || role !== "MANAGER")) {
    return res.status(400).json({
      message: "Bạn không thể tự khóa tài khoản hoặc tự hạ quyền quản lý.",
    });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data: profileResult, error: profileRpcError } =
      await adminSupabase.rpc("update_staff_profile", {
        p_actor_id: req.user.id,
        p_target_user_id: id,
        p_email: email,
        p_full_name: fullName,
        p_role: role,
        p_is_active: isActive,
      });
    if (profileRpcError) throw profileRpcError;
    if (!profileResult.success) {
      const status = profileResult.code === "staff_not_found" ? 404 : 409;
      return res.status(status).json({ message: profileResult.message });
    }

    const authChanges = {
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    };
    if (password) authChanges.password = password;
    authChanges.ban_duration = isActive ? "none" : "876000h";

    const { error: authError } = await adminSupabase.auth.admin.updateUserById(
      id,
      authChanges,
    );
    if (authError) {
      console.error("Lỗi cập nhật tài khoản xác thực:", authError.message);
      return res.status(500).json({
        message:
          "Hồ sơ đã lưu nhưng email/mật khẩu/trạng thái đăng nhập chưa đồng bộ. Hãy thử lại hoặc kiểm tra tài khoản.",
      });
    }

    try {
      await recordManagerActivity(req.user, {
        action: "STAFF_UPDATED",
        targetType: "STAFF",
        targetId: id,
        details: {
          email,
          fullName,
          role,
          isActive,
          passwordChanged: Boolean(password),
        },
      });
    } catch (auditError) {
      console.error("Không ghi được nhật ký cập nhật nhân viên:", auditError.message);
      return res.status(500).json({
        message:
          "Tài khoản đã được cập nhật nhưng không ghi được nhật ký hoạt động. Không lặp lại thao tác; hãy kiểm tra cấu hình nhật ký.",
      });
    }

    res.json({ staff: profileResult.staff });
  } catch (error) {
    console.error("Lỗi cập nhật nhân viên:", error.message);
    res.status(500).json({ message: "Không thể cập nhật tài khoản nhân viên." });
  }
};
