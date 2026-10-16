import express from "express";
import { checkIn, checkOut } from "../controllers/ticketController.js";

const router = express.Router();

router.post("/check-in", checkIn);
router.post("/check-out", checkOut);

export default router;
import { checkIn, checkOutByPlate } from "../controllers/ticketController.js";

router.post("/check-in", checkIn);
router.post("/check-out-plate", checkOutByPlate);
