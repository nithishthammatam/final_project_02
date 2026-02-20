"""
ECG PREDICTION SYSTEM (VISION BASED)
Analyzes ECG images using trained ResNet18 model and provides detailed report
"""

import torch
import torch.nn as nn
from torchvision import transforms, models
from PIL import Image, ImageStat
import numpy as np
import cv2
import os

# ============================================================
# CONFIGURATION
# ============================================================
CLASS_NAMES = ["Normal", "Supraventricular", "Ventricular", "Fusion", "Unknown"]
NUM_CLASSES = 5
device = torch.device("cpu")

# ============================================================
# LOAD MODEL
# ============================================================
model = models.resnet18(pretrained=False)
num_features = model.fc.in_features
model.fc = nn.Sequential(
    nn.Dropout(0.5),
    nn.Linear(num_features, 128),
    nn.ReLU(),
    nn.Linear(128, NUM_CLASSES)
)

MODEL_PATH = "ecg_resnet_model.pth"

def load_model():
    if os.path.exists(MODEL_PATH):
        model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
        model.eval()
        model.to(device)
        return True
    return False

model_loaded = load_model()

# ============================================================
# GRADCAM HOOKS
# ============================================================
gradients = None
activations = None

def backward_hook(module, grad_in, grad_out):
    global gradients
    gradients = grad_out[0]

def forward_hook(module, input, output):
    global activations
    activations = output

# Register hooks on layer4 (last conv layer)
model.layer4[1].conv2.register_forward_hook(forward_hook)
model.layer4[1].conv2.register_full_backward_hook(backward_hook)

# ============================================================
# ANALYSIS LOGIC
# ============================================================

def predict_ecg(image_path):
    if not model_loaded:
        if not load_model():
            return {"error": "ECG Model not trained yet"}

    # Load Image
    image = Image.open(image_path).convert("RGB")
    
    # Transform
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    input_tensor = transform(image).unsqueeze(0).to(device)
    
    # Prediction
    output = model(input_tensor)
    probs = torch.softmax(output, dim=1)[0]
    
    pred_idx = torch.argmax(probs).item()
    confidence = probs[pred_idx].detach().item()
    label = CLASS_NAMES[pred_idx]
    
    # GradCAM
    model.zero_grad()
    output[0][pred_idx].backward()
    
    cam = np.zeros((224, 224), dtype=np.float32)
    if gradients is not None and activations is not None:
        grads = gradients.detach().cpu().numpy()[0]
        acts = activations.detach().cpu().numpy()[0]
        weights = grads.mean(axis=(1,2))
        
        # Initialize cam with size of features (7x7) NOT image size (224x224)
        cam = np.zeros(acts.shape[1:], dtype=np.float32)
        
        for i, w in enumerate(weights):
            cam += w * acts[i]
            
        cam = np.maximum(cam, 0)
        cam = cv2.resize(cam, (224, 224))
        if cam.max() != 0:
            cam = cam / cam.max()
            
    # Heatmap
    heatmap = cv2.applyColorMap(np.uint8(255 * cam), cv2.COLORMAP_JET)
    base_name = os.path.basename(image_path)
    heatmap_path = os.path.join("uploaded_images", f"heatmap_ecg_{base_name}")
    cv2.imwrite(heatmap_path, heatmap)
    
    # Report generation
    report = generate_report(label, confidence)
    
    return {
        "prediction": label,
        "confidence": round(confidence * 100, 2),
        "heatmap_path": heatmap_path,
        "report": report
    }

def generate_report(label, confidence):
    descriptions = {
        "Normal": "Normal Sinus Rhythm. The ECG shows a regular rhythm with normal intervals and wave morphology.",
        "Supraventricular": "Supraventricular Ectopic Beat detected. This impulse originates above the ventricles and may indicate atrial premature beats or paroxysmal tachycardia.",
        "Ventricular": "Ventricular Ectopic Beat detected. This suggests a premature ventricular contraction (PVC). Only significant if frequent.",
        "Fusion": "Fusion Beat detected. A merging of a normal sinus beat and a ventricular beat.",
        "Unknown": "Unclassifiable pattern detected. Requires manual review."
    }
    
    risk = "Low" if label == "Normal" else "Moderate"
    if label == "Ventricular" and confidence > 0.8:
        risk = "High"
        
    return {
        "title": f"{label} Beat Detected",
        "description": descriptions.get(label, "Analysis complete."),
        "risk_level": risk,
        "recommendation": "Consult a cardiologist for further evaluation." if label != "Normal" else "Routine checkup advised."
    }
