import { createSupabaseAdminClient } from "../config/supabase.js";
import { recordManagerActivity } from "../services/managerActivityLog.js";
import { randomUUID, timingSafeEqual } from "crypto";

const getPaymentConfig = () => {
  const requiredVariables = [
    "SEPAY_BANK_CODE",
    "SEPAY_ACCOUNT_NUMBER",
    "SEPAY_ACCOUNT_NAME",
    "SEPAY_WEBHOOK_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const missingVariables = requiredVariables.filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missingVariables.length) {
    return { config: null, missingVariables };
  }

  return {
    config: {
      bankCode: process.env.SEPAY_BANK_CODE.trim().replace(/\s+Bank$/i, ""),
      accountNumber: process.env.SEPAY_ACCOUNT_NUMBER,
      accountName: process.env.SEPAY_ACCOUNT_NAME,
    },
    missingVariables: [],
  };
};

const makeQrUrl = (receipt, paymentConfig) => {
  const params = new URLSearchParams({
    acc: paymentConfig.accountNumber,
    bank: paymentConfig.bankCode,
    amount: String(receipt.amount),
    des: receipt.paymentCode,
    template: "compact",
    showinfo: "true",
    holder: paymentConfig.accountName,
  });
  return `https://vietqr.app/img?${params.toString()}`;
};

export const checkIn = async (req, res) => {
  try {
    const { licensePlate, slotId } = req.body;
    const parsedSlotId = Number(slotId);
    if (
      typeof licensePlate !== "string" ||
      !licensePlate.trim() ||
      !Number.isSafeInteger(parsedSlotId) ||
      parsedSlotId < 1
    ) {
      return res
        .status(400)
        .json({ message: "Thiếu thông tin biển số hoặc vị trí đỗ!" });
    }

    const cleanPlate = licensePlate.trim().toUpperCase();
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase.rpc(
      "check_in_vehicle_with_activity",
      {
        p_license_plate: cleanPlate,
        p_slot_id: parsedSlotId,
        p_actor_id: req.user.id,
      },
    );
    if (error) throw error;

    if (!data.success) {
      const statusCode =
        data.code === "slot_not_found" ? 404 :
          data.code === "duplicate_plate" || data.code === "slot_unavailable"
            ? 409
            : 400;
      return res.status(statusCode).json({ message: data.message });
    }

    res.json({ success: true, ticket: data.ticket });
  } catch (err) {
    console.error("Lỗi check-in:", err);
    if (err.code === "PGRST202" || err.code === "42883") {
      return res.status(503).json({
        message:
          "Supabase chưa có hàm ghi nhật ký check-in. Hãy chạy migration 20261020900000_staff_activity_log.sql trong Supabase SQL Editor rồi thử lại.",
      });
    }
    res.status(500).json({ message: "Không thể hoàn tất check-in." });
  }
};

export const checkOutByPlate = async (req, res) => {
  try {
    const { licensePlate } = req.body;
    if (typeof licensePlate !== "string" || !licensePlate.trim()) {
      return res.status(400).json({ message: "Vui lòng cung cấp biển số xe!" });
    }

    const { config: paymentConfig, missingVariables } = getPaymentConfig();
    if (!paymentConfig) {
      return res.status(503).json({
        message:
          `Thiếu cấu hình trong server/.env: ${missingVariables.join(", ")}. Xem server/PAYMENTS.md.`,
      });
    }

    const cleanPlate = licensePlate.trim().toUpperCase();
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase.rpc(
      "check_out_vehicle_with_activity",
      {
        p_license_plate: cleanPlate,
        p_payment_reference: randomUUID(),
        p_actor_id: req.user.id,
      },
    );
    if (error) throw error;

    if (!data.success) {
      return res.status(data.code === "active_ticket_not_found" ? 404 : 409).json({
        message: data.message,
      });
    }

    res.json({
      ...data,
      receipt: {
        ...data.receipt,
        qrUrl: makeQrUrl(data.receipt, paymentConfig),
      },
    });
  } catch (error) {
    console.error("Lỗi check-out:", error);
    if (error.code === "PGRST202" || error.code === "42883") {
      return res.status(503).json({
        message:
          "Supabase chưa có hàm ghi nhật ký check-out. Hãy chạy migration 20261020900000_staff_activity_log.sql sau các migration hiện có.",
      });
    }
    res.status(500).json({ message: "Không thể hoàn tất check-out." });
  }
};

export const getPaymentStatus = async (req, res) => {
  try {
    const { reference } = req.params;
    if (
      typeof reference !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        reference,
      )
    ) {
      return res.status(400).json({ message: "Mã thanh toán không hợp lệ." });
    }

    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase
      .from("tickets")
      .select("payment_status")
      .eq("payment_reference", reference)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ message: "Không tìm thấy giao dịch." });
    }

    res.json({ paymentStatus: data.payment_status });
  } catch (error) {
    console.error("Lỗi kiểm tra thanh toán:", error.message);
    res.status(503).json({
      message: "Không thể kiểm tra thanh toán. Vui lòng thử lại sau.",
    });
  }
};

const isValidApiKey = (authorization, expectedKey) => {
  if (!authorization?.startsWith("Apikey ")) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(expectedKey);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};

export const receiveSePayWebhook = async (req, res) => {
  const webhookKey = process.env.SEPAY_WEBHOOK_API_KEY;
  if (!webhookKey) {
    return res.status(503).json({ success: false, message: "Webhook chưa được cấu hình." });
  }
  if (!isValidApiKey(req.get("authorization"), webhookKey)) {
    return res.status(401).json({ success: false, message: "Unauthorized." });
  }

  const transaction = req.body;
  const transactionId = Number(transaction?.id);
  const amount = Number(transaction?.transferAmount);
  const accountNumber = String(transaction?.accountNumber || "");
  const configuredAccount = process.env.SEPAY_ACCOUNT_NUMBER;

  if (
    !Number.isSafeInteger(transactionId) ||
    transactionId <= 0 ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    transaction?.transferType !== "in" ||
    !configuredAccount ||
    accountNumber !== configuredAccount
  ) {
    return res.status(400).json({
      success: false,
      message: "Thông tin giao dịch không hợp lệ.",
    });
  }

  const transferText = [
    transaction.content,
    transaction.description,
    transaction.subAccount,
  ]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toUpperCase();
  const paymentCodeMatch = transferText.match(
    /(?:^|[^A-Z0-9])(SP[0-9A-F]{24})(?:$|[^A-Z0-9])/,
  );
  if (!paymentCodeMatch) {
    return res.status(200).json({ success: true, processed: false });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase.rpc("confirm_sepay_payment", {
      p_sepay_transaction_id: transactionId,
      p_payment_code: paymentCodeMatch[1],
      p_amount: amount,
      p_account_number: accountNumber,
    });

    if (error) throw error;
    if (!data.success) {
      console.warn("Bỏ qua giao dịch SePay:", data.code);
      return res.status(200).json({ success: true, processed: false });
    }

    res.status(200).json({ success: true, processed: true });
  } catch (error) {
    console.error("Lỗi xử lý webhook SePay:", error.message);
    res.status(500).json({ success: false, message: "Không thể xử lý giao dịch." });
  }
};

export const getTicketHistory = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const pageSize = 15;
    const status = req.query.status;
    const search =
      typeof req.query.search === "string"
        ? req.query.search
            .replace(/[^a-zA-Z0-9 -]/g, "")
            .trim()
            .replace(/\s+/g, "%")
        : "";
    const from = req.query.from;
    const to = req.query.to;
    const paymentStatus = req.query.paymentStatus;

    if (page < 1) {
      return res.status(400).json({ message: "Số trang không hợp lệ." });
    }
    if (status && !["ACTIVE", "COMPLETED"].includes(status)) {
      return res.status(400).json({ message: "Trạng thái vé không hợp lệ." });
    }
    if (
      paymentStatus &&
      !["UNPAID", "PENDING", "PAID", "UNKNOWN", "CANCELLED"].includes(
        paymentStatus,
      )
    ) {
      return res.status(400).json({ message: "Trạng thái thanh toán không hợp lệ." });
    }
    if (
      (from && Number.isNaN(Date.parse(from))) ||
      (to && Number.isNaN(Date.parse(to)))
    ) {
      return res.status(400).json({ message: "Khoảng thời gian không hợp lệ." });
    }

    const adminSupabase = createSupabaseAdminClient();
    let query = adminSupabase
      .from("tickets")
      .select(
        "id, ticket_code, license_plate, slot_id, check_in_time, check_out_time, total_amount, status, payment_status, settlement_method, parking_slots(slot_code, zone, vehicle_type)",
        { count: "exact" },
      )
      .order("check_in_time", { ascending: false });

    if (status) query = query.eq("status", status);
    if (paymentStatus) query = query.eq("payment_status", paymentStatus);
    if (search) {
      query = query.or(
        `license_plate.ilike.%${search}%,ticket_code.ilike.%${search}%`,
      );
    }
    if (from) query = query.gte("check_in_time", new Date(from).toISOString());
    if (to) {
      const endOfDay = new Date(to);
      endOfDay.setUTCHours(23, 59, 59, 999);
      query = query.lte("check_in_time", endOfDay.toISOString());
    }

    const start = (page - 1) * pageSize;
    const { data, count, error } = await query.range(
      start,
      start + pageSize - 1,
    );
    if (error) throw error;

    res.json({
      tickets: data || [],
      page,
      pageSize,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (error) {
    console.error("Lỗi tải lịch sử vé:", error);
    if (error.code === "42703") {
      return res.status(503).json({
        message:
          "Chưa cài đặt phương thức hoàn tất hóa đơn. Hãy chạy migration 20261020700000_manual_invoice_completion.sql trong Supabase SQL Editor.",
      });
    }
    res.status(500).json({ message: "Không thể tải lịch sử vé." });
  }
};

export const getInvoiceCancellations = async (req, res) => {
  const ticketCode =
    typeof req.params.ticketCode === "string" ? req.params.ticketCode.trim() : "";
  if (!ticketCode || ticketCode.length > 64) {
    return res.status(400).json({ message: "Mã vé không hợp lệ." });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase
      .from("parking_invoice_cancellations")
      .select("payment_code, amount, cancelled_at")
      .eq("ticket_code", ticketCode)
      .order("cancelled_at", { ascending: false });
    if (error) throw error;
    res.json({ cancellations: data || [] });
  } catch (error) {
    console.error("Lỗi tải lịch sử hủy hóa đơn:", error.message);
    if (error.code === "42P01" || error.code === "PGRST205") {
      return res.status(503).json({
        message:
          "Chưa cài đặt lịch sử hủy hóa đơn. Hãy chạy migration 20261020600000_cancel_pending_invoices.sql trong Supabase SQL Editor.",
      });
    }
    res.status(500).json({ message: "Không thể tải lịch sử hủy hóa đơn." });
  }
};

export const cancelPendingInvoice = async (req, res) => {
  const ticketCode =
    typeof req.params.ticketCode === "string" ? req.params.ticketCode.trim() : "";
  if (!ticketCode || ticketCode.length > 64) {
    return res.status(400).json({ message: "Mã vé không hợp lệ." });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase.rpc(
      "cancel_pending_parking_invoice",
      {
        p_actor_id: req.user.id,
        p_ticket_code: ticketCode,
      },
    );
    if (error) throw error;
    if (!data.success) {
      const status =
        data.code === "ticket_not_found"
          ? 404
          : data.code === "actor_not_manager"
            ? 403
            : 409;
      return res.status(status).json({ message: data.message });
    }
    try {
      await recordManagerActivity(req.user, {
        action: "INVOICE_CANCELLED",
        targetType: "TICKET",
        targetId: ticketCode,
        details: {
          licensePlate: data.licensePlate,
          paymentStatus: data.paymentStatus,
          amount: data.cancellation?.amount,
          paymentCode: data.cancellation?.payment_code,
        },
      });
    } catch (auditError) {
      console.error("Không ghi được nhật ký hủy hóa đơn:", auditError.message);
      return res.status(500).json({
        message:
          "Hóa đơn đã được hủy nhưng không ghi được nhật ký hoạt động. Không hủy lại; hãy kiểm tra cấu hình nhật ký.",
      });
    }
    res.json(data);
  } catch (error) {
    console.error("Lỗi hủy hóa đơn:", error.message);
    if (error.code === "PGRST202" || error.code === "42883") {
      return res.status(503).json({
        message:
          "Chưa cài đặt hủy hóa đơn. Hãy chạy migration 20261020600000_cancel_pending_invoices.sql trong Supabase SQL Editor.",
      });
    }
    if (error.code === "42P01" || error.code === "PGRST205") {
      return res.status(503).json({
        message:
          "Chưa cài đặt lịch sử hủy hóa đơn. Hãy chạy migration 20261020600000_cancel_pending_invoices.sql trong Supabase SQL Editor.",
      });
    }
    res.status(500).json({ message: "Không thể hủy hóa đơn." });
  }
};

export const completeInvoiceManually = async (req, res) => {
  const ticketCode =
    typeof req.params.ticketCode === "string" ? req.params.ticketCode.trim() : "";
  const reason =
    typeof req.body.reason === "string" ? req.body.reason.trim() : "";

  if (!ticketCode || ticketCode.length > 64 || reason.length < 3 || reason.length > 500) {
    return res.status(400).json({
      message: "Mã vé không hợp lệ. Lý do cần từ 3 đến 500 ký tự.",
    });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase.rpc(
      "complete_parking_invoice_manually",
      {
        p_actor_id: req.user.id,
        p_ticket_code: ticketCode,
        p_reason: reason,
      },
    );
    if (error) throw error;
    if (!data.success) {
      const status =
        data.code === "ticket_not_found" || data.code === "slot_not_found"
          ? 404
          : data.code === "actor_not_manager"
            ? 403
            : 409;
      return res.status(status).json({ message: data.message });
    }
    try {
      await recordManagerActivity(req.user, {
        action: "INVOICE_COMPLETED_MANUALLY",
        targetType: "TICKET",
        targetId: ticketCode,
        details: {
          licensePlate: data.licensePlate,
          amount: data.amount,
          slotCode: data.slotCode,
          reason: data.reason,
        },
      });
    } catch (auditError) {
      console.error(
        "Không ghi được nhật ký hoàn tất hóa đơn thủ công:",
        auditError.message,
      );
      return res.status(500).json({
        message:
          "Hóa đơn đã được hoàn tất nhưng không ghi được nhật ký hoạt động. Không thực hiện lại; hãy kiểm tra cấu hình nhật ký.",
      });
    }
    res.json(data);
  } catch (error) {
    console.error("Lỗi hoàn tất hóa đơn thủ công:", error.message);
    if (error.code === "PGRST202" || error.code === "42883") {
      return res.status(503).json({
        message:
          "Chưa cài đặt hoàn tất hóa đơn thủ công. Hãy chạy migration 20261020700000_manual_invoice_completion.sql trong Supabase SQL Editor.",
      });
    }
    res.status(500).json({ message: "Không thể hoàn tất hóa đơn thủ công." });
  }
};

export const getManualInvoiceCompletions = async (req, res) => {
  const ticketCode =
    typeof req.params.ticketCode === "string" ? req.params.ticketCode.trim() : "";
  if (!ticketCode || ticketCode.length > 64) {
    return res.status(400).json({ message: "Mã vé không hợp lệ." });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase
      .from("parking_invoice_manual_completions")
      .select("amount, reason, completed_by, completed_at")
      .eq("ticket_code", ticketCode)
      .order("completed_at", { ascending: false });
    if (error) throw error;
    res.json({ completions: data || [] });
  } catch (error) {
    console.error("Lỗi tải lịch sử hoàn tất thủ công:", error.message);
    if (error.code === "42P01" || error.code === "PGRST205") {
      return res.status(503).json({
        message:
          "Chưa cài đặt lịch sử hoàn tất thủ công. Hãy chạy migration 20261020700000_manual_invoice_completion.sql trong Supabase SQL Editor.",
      });
    }
    res.status(500).json({ message: "Không thể tải lịch sử hoàn tất hóa đơn." });
  }
};

export const getRevenueReport = async (req, res) => {
  const { from, to } = req.query;
  const isDate = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

  if (!isDate(from) || !isDate(to) || from > to) {
    return res.status(400).json({ message: "Khoảng ngày báo cáo không hợp lệ." });
  }

  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000 + 1;
  if (days > 90) {
    return res.status(400).json({
      message: "Khoảng báo cáo tối đa là 90 ngày.",
    });
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase.rpc(
      "get_parking_revenue_report",
      {
        p_from_date: from,
        p_to_date: to,
      },
    );
    if (error) throw error;
    res.json({ from, to, days: data || [] });
  } catch (error) {
    console.error("Lỗi tải báo cáo doanh thu:", error.message);
    if (error.code === "PGRST202" || error.code === "42883") {
      return res.status(503).json({
        message:
          "Supabase chưa có hàm báo cáo doanh thu. Hãy chạy migration 20261020400000_revenue_reporting.sql rồi thử lại.",
      });
    }
    res.status(500).json({ message: "Không thể tải báo cáo doanh thu." });
  }
};

export const getActivePlates = async (_req, res) => {
  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase
      .from("tickets")
      .select("license_plate")
      .in("status", ["ACTIVE", "PENDING_PAYMENT"]);
    if (error) throw error;
    res.json({ plates: (data || []).map((ticket) => ticket.license_plate) });
  } catch (error) {
    console.error("Lỗi tải biển số đang gửi:", error.message);
    res.status(500).json({ message: "Không thể tải danh sách xe đang gửi." });
  }
};

export const getOperationalAlerts = async (_req, res) => {
  const now = Date.now();
  const overdueVehicleThresholdHours = 24;
  const pendingPaymentThresholdMinutes = 15;
  const overdueVehicleCutoff = new Date(
    now - overdueVehicleThresholdHours * 60 * 60 * 1000,
  ).toISOString();
  const pendingPaymentCutoff = new Date(
    now - pendingPaymentThresholdMinutes * 60 * 1000,
  ).toISOString();

  try {
    const adminSupabase = createSupabaseAdminClient();
    const selectFields =
      "ticket_code, license_plate, check_in_time, check_out_time, total_amount, payment_code, parking_slots(slot_code)";
    const [overdueResult, pendingResult] = await Promise.all([
      adminSupabase
        .from("tickets")
        .select(selectFields)
        .eq("status", "ACTIVE")
        .lt("check_in_time", overdueVehicleCutoff)
        .order("check_in_time", { ascending: true }),
      adminSupabase
        .from("tickets")
        .select(selectFields)
        .eq("status", "ACTIVE")
        .eq("payment_status", "PENDING")
        .not("check_out_time", "is", null)
        .lt("check_out_time", pendingPaymentCutoff)
        .order("check_out_time", { ascending: true }),
    ]);

    if (overdueResult.error) throw overdueResult.error;
    if (pendingResult.error) throw pendingResult.error;

    res.json({
      thresholds: {
        overdueVehicleHours: overdueVehicleThresholdHours,
        pendingPaymentMinutes: pendingPaymentThresholdMinutes,
      },
      overdueVehicles: overdueResult.data || [],
      pendingPayments: pendingResult.data || [],
      checkedAt: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error("Lỗi tải cảnh báo vận hành:", error.message);
    res.status(500).json({ message: "Không thể tải cảnh báo vận hành." });
  }
};
