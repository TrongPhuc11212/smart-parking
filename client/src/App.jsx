import { useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import StatsOverview from "./components/StatsOverview";
import PlateScanner from "./components/PlateScanner";
import ParkingMatrix from "./components/ParkingMatrix";
import ReceiptModal from "./components/ReceiptModal";
import { supabase } from "./services/supabase";

const API_BASE = "http://localhost:5001/api";

export default function App() {
  const [slots, setSlots] = useState([]);
  const [receiptData, setReceiptData] = useState(null);

  const loadSlots = async () => {
    try {
      const res = await fetch(`${API_BASE}/slots`);
      const data = await res.json();
      setSlots(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadSlots();

    // Lắng nghe Realtime tự đổi màu ô xe
    const channel = supabase
      .channel("parking-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "parking_slots" },
        (payload) => {
          setSlots((prev) =>
            prev.map((s) => (s.id === payload.new.id ? payload.new : s)),
          );
        },
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const handleCheckIn = async (body) => {
    const res = await fetch(`${API_BASE}/tickets/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) alert(result.message);
    else alert(`Check-in thành công cho xe ${body.licensePlate}!`);
    loadSlots();
  };

  const handleCheckOut = async (licensePlate) => {
    const res = await fetch(`${API_BASE}/tickets/check-out-plate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licensePlate }),
    });
    const result = await res.json();
    if (!res.ok) alert(result.message);
    else {
      setReceiptData(result.data);
      loadSlots();
    }
  };

  const availableSlots = slots.filter((s) => s.status === "AVAILABLE");

  return (
    <div
      style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px 40px" }}
    >
      <Navbar />
      <StatsOverview slots={slots} />
      <PlateScanner
        availableSlots={availableSlots}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
      />
      <ParkingMatrix slots={slots} />
      <ReceiptModal data={receiptData} onClose={() => setReceiptData(null)} />
    </div>
  );
}
