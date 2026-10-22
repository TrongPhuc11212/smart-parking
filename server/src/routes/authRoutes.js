import express from "express";
import {
  createStaff,
  getCurrentStaff,
  listStaff,
  updateStaff,
} from "../controllers/staffController.js";
import { requireManager, requireStaff } from "../middleware/requireStaff.js";
import {
  getParkingRates,
  updateParkingRate,
} from "../controllers/parkingRateController.js";
import { listManagerActivity } from "../services/managerActivityLog.js";
import { listStaffActivity } from "../services/staffActivityLog.js";

const router = express.Router();

router.use(requireStaff);
router.get("/me", getCurrentStaff);
router.get("/staff", requireManager, listStaff);
router.post("/staff", requireManager, createStaff);
router.patch("/staff/:id", requireManager, updateStaff);
router.get("/parking-rates", requireManager, getParkingRates);
router.put("/parking-rates/:vehicleType", requireManager, updateParkingRate);
router.get("/activity-log", requireManager, listManagerActivity);
router.get("/staff-activity", requireManager, listStaffActivity);

export default router;
