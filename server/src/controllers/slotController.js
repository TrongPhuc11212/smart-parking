import { createSupabaseAdminClient } from "../config/supabase.js";

// Lấy danh sách toàn bộ ô đỗ xe
export const getSlots = async (req, res) => {
  try {
    const adminSupabase = createSupabaseAdminClient();
    const { data, error } = await adminSupabase
      .from("parking_slots")
      .select("*")
      .order("id", { ascending: true });

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
