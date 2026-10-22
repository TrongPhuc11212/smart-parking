import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import slotRoutes from "./routes/slotRoutes.js";
import ticketRoutes from "./routes/ticketRoutes.js";
import authRoutes from "./routes/authRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Khai báo API
app.use("/api/slots", slotRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("Server bãi đỗ xe đang chạy thành công trên cổng " + PORT);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`>>> Server đang giữ kết nối tại http://localhost:${PORT}`);
});
