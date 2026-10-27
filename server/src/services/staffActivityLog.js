import { createSupabaseAdminClient } from "../config/supabase.js";

const isDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export const listStaffActivity = async (req, res) => {
  const page = Number.parseInt(req.query.page, 10) || 1;
  const requestedPageSize = Number.parseInt(req.query.pageSize, 10) || 25;
  const pageSize = Math.min(requestedPageSize, 250);
  const { action, staffId, from, to } = req.query;
  const validActions = [
    "CHECK_IN",
    "CHECK_OUT",
    "CHECK_OUT_UNPAID_DEPARTURE",
  ];
  const days =
    from && to
      ? (Date.parse(`${to}T00:00:00Z`) -
          Date.parse(`${from}T00:00:00Z`)) /
          86_400_000 +
        1
      : 0;

  if (
    page < 1 ||
    requestedPageSize < 1 ||
    (action && !validActions.includes(action)) ||
    (staffId &&
      (typeof staffId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          staffId,
        ))) ||
    (from && !isDate(from)) ||
    (to && !isDate(to)) ||
    (from && to && from > to) ||
    days > 90
  ) {
    return res.status(400).json({
      message:
        "Bộ lọc nhật ký không hợp lệ. Khoảng thời gian tối đa là 90 ngày.",
    });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    let query = adminSupabase
      .from("staff_activity_logs")
      .select(
        "id, actor_id, actor_email, actor_name, action, ticket_code, license_plate, slot_code, amount, payment_reference, details, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (action) query = query.eq("action", action);
    if (staffId) query = query.eq("actor_id", staffId);
    if (from) {
      query = query.gte(
        "created_at",
        new Date(`${from}T00:00:00.000+07:00`).toISOString(),
      );
    }
    if (to) {
      const endExclusive = new Date(
        new Date(`${to}T00:00:00.000+07:00`).getTime() + 86_400_000,
      ).toISOString();
      query = query.lt("created_at", endExclusive);
    }

    const start = (page - 1) * pageSize;
    const { data, count, error } = await query.range(
      start,
      start + pageSize - 1,
    );
    if (error) throw error;
    res.json({
      activities: data || [],
      page,
      pageSize,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (error) {
    console.error("Lỗi tải nhật ký nhân viên:", error.message);
    if (error.code === "42P01" || error.code === "PGRST205") {
      return res.status(503).json({
        message:
          "Chưa cài đặt nhật ký nhân viên. Hãy chạy migration 20261020900000_staff_activity_log.sql trong Supabase SQL Editor.",
      });
    }
    res.status(500).json({ message: "Không thể tải nhật ký nhân viên." });
  }
};
