import express from "express";
import { getSlots } from "../controllers/slotController.js";
import { requireStaff } from "../middleware/requireStaff.js";

const router = express.Router();
router.use(requireStaff);
router.get("/", getSlots);

export default router;
