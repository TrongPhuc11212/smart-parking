import express from "express";
import {
  createParkingSlot,
  getPublicSlots,
  getSlots,
  getSlotsForManagement,
  setParkingSlotActive,
  updateParkingSlot,
} from "../controllers/slotController.js";
import { requireManager, requireStaff } from "../middleware/requireStaff.js";

const router = express.Router();
router.get("/public", getPublicSlots);
router.use(requireStaff);
router.get("/manage", requireManager, getSlotsForManagement);
router.post("/", requireManager, createParkingSlot);
router.put("/:id", requireManager, updateParkingSlot);
router.delete("/:id", requireManager, setParkingSlotActive);
router.post("/:id/restore", requireManager, setParkingSlotActive);
router.get("/", getSlots);

export default router;
