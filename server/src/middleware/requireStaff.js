import { createSupabaseAdminClient, supabase } from "../config/supabase.js";

export const requireStaff = async (req, res, next) => {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer (.+)$/i);
  if (!match) {
    return res.status(401).json({ message: "Vui lòng đăng nhập để tiếp tục." });
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser(
      match[1],
    );
    if (authError || !authData.user) {
      return res.status(401).json({ message: "Phiên đăng nhập không hợp lệ." });
    }

    const adminSupabase = createSupabaseAdminClient();
    const { data: profile, error: profileError } = await adminSupabase
      .from("staff_profiles")
      .select("role, full_name")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) {
      return res
        .status(403)
        .json({ message: "Tài khoản chưa được cấp quyền." });
    }

    req.user = {
      id: authData.user.id,
      email: authData.user.email,
      role: profile.role,
      fullName: profile.full_name,
    };
    next();
  } catch (error) {
    console.error("Lỗi xác thực nhân viên:", error.message);
    res.status(503).json({ message: "Không thể xác minh tài khoản." });
  }
};

export const requireManager = (req, res, next) => {
  if (req.user?.role !== "MANAGER") {
    return res
      .status(403)
      .json({ message: "Chỉ quản lý mới được phép thực hiện." });
  }
  next();
};
