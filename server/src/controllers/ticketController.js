// Xe ra bãi (Check-out & Tính tiền)
export const checkOut = async (req, res) => {
  try {
    const { ticketCode } = req.body;

    if (!ticketCode) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp mã vé (ticketCode)!" });
    }

    // 1. Tìm vé đang còn hoạt động (ACTIVE)
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("*, parking_slots(*)")
      .eq("ticket_code", ticketCode)
      .eq("status", "ACTIVE")
      .single();

    if (ticketError || !ticket) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy vé hợp lệ hoặc xe đã rời bãi!" });
    }

    const checkInTime = new Date(ticket.check_in_time);
    const checkOutTime = new Date();

    // 2. Tính số giờ gửi xe (làm tròn lên tối thiểu 1 giờ)
    const diffHours = Math.max(
      1,
      Math.ceil((checkOutTime - checkInTime) / (1000 * 60 * 60)),
    );

    // Biểu giá mẫu: Xe máy 5.000đ/h, Ô tô 20.000đ/h
    const ratePerHour =
      ticket.parking_slots.vehicle_type === "CAR" ? 20000 : 5000;
    const totalAmount = diffHours * ratePerHour;

    // 3. Cập nhật trạng thái vé thành COMPLETED
    const { data: updatedTicket, error: updateTicketError } = await supabase
      .from("tickets")
      .update({
        check_out_time: checkOutTime.toISOString(),
        total_amount: totalAmount,
        status: "COMPLETED",
      })
      .eq("id", ticket.id)
      .select()
      .single();

    if (updateTicketError) throw updateTicketError;

    // 4. Giải phóng ô đỗ xe về trạng thái AVAILABLE
    await supabase
      .from("parking_slots")
      .update({ status: "AVAILABLE" })
      .eq("id", ticket.slot_id);

    res.status(200).json({
      message: "Check-out thành công!",
      data: {
        ticketCode: updatedTicket.ticket_code,
        licensePlate: updatedTicket.license_plate,
        hours: diffHours,
        totalAmount: totalAmount,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// Check-out bằng biển số xe nhận diện từ OCR
export const checkOutByPlate = async (req, res) => {
  try {
    const { licensePlate } = req.body;

    // Tìm vé ACTIVE gần nhất của biển số này
    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .select("*, parking_slots(*)")
      .eq("license_plate", licensePlate)
      .eq("status", "ACTIVE")
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (ticketErr || !ticket) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy xe đang gửi với biển số này!" });
    }

    const checkInTime = new Date(ticket.check_in_time);
    const checkOutTime = new Date();
    const durationHours = Math.max(
      1,
      Math.ceil((checkOutTime - checkInTime) / (1000 * 60 * 60)),
    );
    const pricePerHour =
      ticket.parking_slots.vehicle_type === "CAR" ? 25000 : 5000;
    const totalAmount = durationHours * pricePerHour;

    // Cập nhật vé
    await supabase
      .from("tickets")
      .update({
        check_out_time: checkOutTime.toISOString(),
        total_amount: totalAmount,
        status: "COMPLETED",
      })
      .eq("id", ticket.id);

    // Giải phóng ô đỗ
    await supabase
      .from("parking_slots")
      .update({ status: "AVAILABLE" })
      .eq("id", ticket.slot_id);

    res.json({
      message: "Check-out thành công",
      data: {
        licensePlate: ticket.license_plate,
        durationHours,
        totalAmount,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
