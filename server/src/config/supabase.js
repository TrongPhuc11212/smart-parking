import "dotenv/config"; // Nạp env ngay lập tức khi file được đọc
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "❌ Lỗi: SUPABASE_URL hoặc SUPABASE_KEY chưa được cấu hình trong file .env",
  );
  console.error("Giá trị hiện tại:", { supabaseUrl, supabaseKey });
}

export const supabase = createClient(supabaseUrl, supabaseKey);
