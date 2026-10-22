import { createSupabaseAdminClient } from "../config/supabase.js";

export const recordManagerActivity = async (
  actor,
  { action, targetType, targetId, details },
) => {
  const adminSupabase = createSupabaseAdminClient();
  const { error } = await adminSupabase.from("manager_activity_logs").insert({
    actor_id: actor.id,
    actor_email: actor.email || "",
    actor_name: actor.fullName || "",
    action,
    target_type: targetType,
    target_id: String(targetId),
    details,
  });
  if (error) throw error;
};

export const listManagerActivity = async (req, res) => {
  const page = Number.parseInt(req.query.page, 10) || 1;
  const pageSize = 25;
  const action = req.query.action;
  const from = req.query.from;
  const to = req.query.to;
  const validActions = [
    "STAFF_CREATED",
    "STAFF_UPDATED",
    "PARKING_RATE_UPDATED",
    "INVOICE_CANCELLED",
    "INVOICE_COMPLETED_MANUALLY",
  ];
  const isDate = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

  if (
    page < 1 ||
    (action && !validActions.includes(action)) ||
    (from && !isDate(from)) ||
    (to && !isDate(to)) ||
    (from && to && from > to)
  ) {
    return res.status(400).json({ message: "Bộ lọc nhật ký không hợp lệ." });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    let query = adminSupabase
      .from("manager_activity_logs")
      .select(
        "id, actor_email, actor_name, action, target_type, target_id, details, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (action) query = query.eq("action", action);
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
    console.error("Lỗi tải nhật ký hoạt động quản lý:", error.message);
    if (error.code === "42P01" || error.code === "PGRST205") {
      return res.status(503).json({
        message:
          "Chưa cài đặt nhật ký hoạt động. Hãy chạy migration 20261020800000_manager_activity_log.sql trong Supabase SQL Editor.",
      });
    }
    res.status(500).json({ message: "Không thể tải nhật ký hoạt động." });
  }
};
