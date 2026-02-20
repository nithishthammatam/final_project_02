from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import shutil, os
import numpy as np
import io
from PIL import Image

# Import Prediction Modules
from predict import predict_image  # X-ray (ResNet18)
from predict_ecg import predict_ecg  # ECG (Vision ResNet18)

# Import Cloudinary configuration
from cloudinary_config import upload_to_cloudinary, delete_from_cloudinary

app = FastAPI()

# ---- CORS FIX ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Allow all for deployment, can be narrowed later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Upload Folder ----
UPLOAD_FOLDER = "uploaded_images"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ---- Serve Static Files (Locally) ----
app.mount("/uploaded_images", StaticFiles(directory=UPLOAD_FOLDER), name="uploaded_images")

# ---- Root Endpoint ----
@app.get("/")
def home():
    return {"message": "Integrated Healthcare System AI Backend Running"}

# ---- X-RAY PREDICTION ENDPOINT ----
@app.post("/predict")
async def predict_xray_endpoint(file: UploadFile = File(...), symptoms: str = Form(None)):
    try:
        # Save file locally
        file_path = os.path.join(UPLOAD_FOLDER, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Run AI prediction
        print(f"Analyzing X-ray: {file.filename}")
        result = predict_image(file_path, symptoms)
        
        # Upload X-ray image to Cloudinary
        print("Uploading X-ray to Cloudinary...")
        xray_upload = upload_to_cloudinary(file_path, folder="healthcare/xrays")
        
        if not xray_upload.get("success"):
            print(f"Cloudinary upload failed: {xray_upload.get('error')}")
            # Continue with local URL in worst case (though frontend expects Cloudinary)
        else:
            result["file_url"] = xray_upload["url"]
            result["cloudinary_public_id"] = xray_upload["public_id"]
        
        # Upload heatmap to Cloudinary if it exists
        if result.get("heatmap_path"):
            heatmap_local_path = result["heatmap_path"]
            if os.path.exists(heatmap_local_path):
                print("Uploading Heatmap to Cloudinary...")
                heatmap_upload = upload_to_cloudinary(heatmap_local_path, folder="healthcare/heatmaps")
                if heatmap_upload.get("success"):
                    result["heatmap_url"] = heatmap_upload["url"]
        
        return result
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ---- ECG PREDICTION ENDPOINT (VISION BASED) ----
@app.post("/predict_ecg")
async def predict_ecg_endpoint(file: UploadFile = File(...)):
    try:
        # Save file locally
        file_path = os.path.join(UPLOAD_FOLDER, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Run AI prediction
        print(f"Analyzing ECG: {file.filename}")
        result = predict_ecg(file_path)
        
        if "error" in result:
             # If model not ready, proceed with upload but return error in result or mock?
             # For now, let's allow it to return so we can see the UI at least
             pass

        # Upload ECG image to Cloudinary
        print("Uploading ECG to Cloudinary...")
        ecg_upload = upload_to_cloudinary(file_path, folder="healthcare/ecgs")
        
        response_data = result.copy()
        
        if ecg_upload.get("success"):
            response_data["file_url"] = ecg_upload["url"]
            response_data["cloudinary_public_id"] = ecg_upload["public_id"]
        else:
            response_data["file_url"] = f"http://localhost:8000/uploaded_images/{file.filename}"
            
        # Upload heatmap if available
        if result.get("heatmap_path"):
            heatmap_local_path = result["heatmap_path"]
            if os.path.exists(heatmap_local_path):
                print("Uploading ECG Heatmap to Cloudinary...")
                heatmap_upload = upload_to_cloudinary(heatmap_local_path, folder="healthcare/ecg_heatmaps")
                if heatmap_upload.get("success"):
                    response_data["heatmap_url"] = heatmap_upload["url"]
        
        # Structure match frontend expectations
        # Frontend expects: ecgPrediction.ECG_Prediction_Label, confidence, etc.
        # But we can also update frontend to match our new cleaner structure.
        # For now, let's return our comprehensive structure.
        
        return response_data

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Use PORT from environment variable or default to 8000
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
