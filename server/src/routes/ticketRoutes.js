import express from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import {
  checkIn,
  checkOutByPlate,
  getTicketHistory,
  getInvoiceCancellations,
  cancelPendingInvoice,
  completeInvoiceManually,
  getManualInvoiceCompletions,
  getRevenueReport,
  getPaymentStatus,
  receiveSePayWebhook,
  getActivePlates,
  getOperationalAlerts,
  recordUnpaidVehicleDeparture,
} from "../controllers/ticketController.js";
import { requireManager, requireStaff } from "../middleware/requireStaff.js";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const AI_SERVICE_URL = (
  process.env.AI_SERVICE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return callback(new Error("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP."));
    }
    callback(null, true);
  },
});
const router = express.Router();

router.post("/sepay/webhook", receiveSePayWebhook);
router.use(requireStaff);

router.post(
  "/scan-plate",
  (req, res, next) => {
    upload.single("image")(req, res, (error) => {
      if (!error) return next();

      const isTooLarge =
        error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
      const status = isTooLarge
        ? 413
        : error instanceof multer.MulterError
          ? 400
          : 415;

      return res.status(status).json({
        message: isTooLarge
          ? "Ảnh vượt quá giới hạn 10 MB."
          : error.message,
      });
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Vui lòng tải lên ảnh!" });
      }

      const formData = new FormData();
      formData.append("file", req.file.buffer, {
        filename: req.file.originalname || "plate.jpg",
        contentType: req.file.mimetype,
      });

      const aiRes = await axios.post(
        `${AI_SERVICE_URL}/predict`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 60000,
        },
      );

      res.status(aiRes.status).json(aiRes.data);
    } catch (error) {
      const aiMessage = error.response?.data?.detail;
      if (error.response) {
        return res.status(error.response.status).json({
          message: aiMessage || "Dịch vụ AI không thể phân tích ảnh này.",
        });
      }

      console.error("Lỗi kết nối AI Service:", error.message);
      res.status(503).json({
        message: "Không thể kết nối đến AI Service Python. Hãy kiểm tra dịch vụ AI.",
      });
    }
  },
);
router.get("/history", getTicketHistory);
router.post(
  "/invoices/:ticketCode/depart-unpaid",
  recordUnpaidVehicleDeparture,
);
router.get("/reports/revenue", requireManager, getRevenueReport);
router.get(
  "/invoices/:ticketCode/cancellations",
  requireManager,
  getInvoiceCancellations,
);
router.post(
  "/invoices/:ticketCode/cancel",
  requireManager,
  cancelPendingInvoice,
);
router.get(
  "/invoices/:ticketCode/manual-completions",
  requireManager,
  getManualInvoiceCompletions,
);
router.post(
  "/invoices/:ticketCode/complete-manually",
  requireManager,
  completeInvoiceManually,
);
router.get("/active-plates", getActivePlates);
router.get("/alerts", getOperationalAlerts);
router.get("/payment-status/:reference", getPaymentStatus);
router.post("/check-in", checkIn);
router.post("/check-out-plate", checkOutByPlate);

export default router;
