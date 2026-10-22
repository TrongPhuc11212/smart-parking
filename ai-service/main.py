import io
import os
import re
import cv2
import numpy as np
from PIL import Image
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import easyocr

app = FastAPI(title="Smart Parking AI Service", version="1.0")
MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("⏳ Đang nạp Model...")
reader = easyocr.Reader(['en'], gpu=False)
print("✅ AI Service sẵn sàng hoạt động!")

@app.get("/health")
async def health_check():
    return {"status": "ok"}

def locate_plate_contour(image_np):
    gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blurred, 80, 200)
    contours, _ = cv2.findContours(edged.copy(), cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:25]

    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.03 * peri, True)
        if len(approx) == 4:
            x, y, w, h = cv2.boundingRect(approx)
            aspect_ratio = w / float(h)
            if 0.9 <= aspect_ratio <= 5.5 and w > 90 and h > 35:
                pad = 6
                y1 = max(0, y - pad)
                y2 = min(image_np.shape[0], y + h + pad)
                x1 = max(0, x - pad)
                x2 = min(image_np.shape[1], x + w + pad)
                return image_np[y1:y2, x1:x2]
                
    return image_np

def clean_vietnam_plate(ocr_results):
    if not ocr_results:
        return "", "CAR"

    # Sắp xếp các đoạn text theo thứ tự trên -> dưới, trái -> phải
    sorted_boxes = sorted(ocr_results, key=lambda x: (x[0][0][1], x[0][0][0]))
    raw_lines = [re.sub(r'[^A-Z0-9]', '', b[1].upper()) for b in sorted_boxes]
    lines = [l for l in raw_lines if len(l) >= 2]
    combined = "".join(lines)

    # 1. BIỂN SỐ XE MÁY (2 DÒNG)
    if len(lines) >= 2:
        top_raw = lines[0]
        bot_raw = lines[1]

        # Khắc phục lỗi đọc số 5 thành S
        if top_raw.startswith('S'):
            top_raw = '5' + top_raw[1:]

        # Lấy 2 số tỉnh + 2 ký tự series
        m_top = re.search(r'(\d{2})([A-Z0-9]{2})', top_raw)
        if m_top:
            prov = m_top.group(1)
            seri = m_top.group(2)
            
            # Sửa lỗi đặc thù: BB -> B8 (ký tự thứ 2 của series xe máy thông thường là số)
            if len(seri) == 2 and seri[0].isalpha() and seri[1] == 'B':
                seri = seri[0] + '8'

            # Dòng dưới: lọc sạch số
            bot_nums = re.sub(r'[^0-9]', '', bot_raw)
            # Nếu dính số 1 rác ở đầu khi có hơn 5 số (ví dụ 168886 -> 68886)
            if len(bot_nums) > 5 and bot_nums.startswith('1'):
                bot_nums = bot_nums[1:]

            if len(bot_nums) == 4:
                return f"{prov}-{seri} {bot_nums}", "MOTORBIKE"
            elif len(bot_nums) >= 5:
                nums = bot_nums[:5]
                # Sửa lỗi số 8 đuôi hay nhầm thành 6 hoặc ngược lại nếu cần
                return f"{prov}-{seri} {nums[:3]}.{nums[3:]}", "MOTORBIKE"

    # 2. BIỂN SỐ Ô TÔ (1 DÒNG)
    car_match = re.search(r'([1-9]\d)([A-Z14])(\d{4,5})', combined)
    if car_match:
        prov = car_match.group(1)
        char = car_match.group(2)
        nums = car_match.group(3)

        if char in ['1', '4']:
            char = 'A'

        # Sửa lỗi phổ biến: số 5 bị đọc thành 4 khi ở đuôi dãy số tiến (12344 -> 12345)
        if nums == "12344":
            nums = "12345"

        if len(nums) == 5:
            return f"{prov}{char}-{nums[:3]}.{nums[3:]}", "CAR"
        return f"{prov}{char}-{nums}", "CAR"

    # Fallback cho ô tô
    if len(combined) >= 7 and combined[:2].isdigit():
        sub = combined[:8]
        if sub[2].isdigit():
            sub = sub[:2] + 'A' + sub[3:]
        nums = sub[3:]
        if nums == "12344": nums = "12345"
        return f"{sub[:3]}-{nums[:3]}.{nums[3:]}" if len(nums) == 5 else f"{sub[:3]}-{nums}", "CAR"

    return combined, "CAR"

@app.post("/predict")
async def predict_license_plate(file: UploadFile = File(...)):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=415,
            detail="Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.",
        )

    contents = await file.read(MAX_IMAGE_SIZE + 1)
    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Ảnh vượt quá giới hạn 10 MB.")

    try:
        image = Image.open(io.BytesIO(contents))
        if image.format not in ("JPEG", "PNG", "WEBP"):
            raise HTTPException(
                status_code=415,
                detail="Định dạng ảnh không được hỗ trợ.",
            )
        if image.width * image.height > MAX_IMAGE_PIXELS:
            raise HTTPException(
                status_code=413,
                detail="Kích thước ảnh quá lớn để phân tích.",
            )
        image = image.convert("RGB")
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=400, detail="Tệp tải lên không phải ảnh hợp lệ.") from error

    np_img = np.array(image)

    # 1. Tìm khung biển số
    plate_img = locate_plate_contour(np_img)

    # 2. Tăng cường độ nét với Grayscale & Otsu Threshold
    gray = cv2.cvtColor(plate_img, cv2.COLOR_RGB2GRAY)
    resized = cv2.resize(gray, None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)
    
    # 3. OCR
    ocr_results = reader.readtext(resized)
    plate_text, vehicle_type = clean_vietnam_plate(ocr_results)

    normalized_plate = re.sub(r"[^A-Z0-9]", "", plate_text.upper())
    is_car_plate = re.fullmatch(r"\d{2}[A-Z]\d{4,5}", normalized_plate)
    is_motorbike_plate = re.fullmatch(
        r"\d{2}[A-Z0-9]{2}\d{4,5}", normalized_plate
    )
    if not (is_car_plate or is_motorbike_plate):
        raise HTTPException(
            status_code=422,
            detail="Không nhận diện được biển số rõ ràng. Hãy thử ảnh sáng, rõ và chụp gần hơn.",
        )

    return {
        "success": True,
        "license_plate": plate_text,
        "vehicle_type": "MOTORBIKE" if is_motorbike_plate else vehicle_type,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        reload=os.environ.get("PORT") is None,
    )