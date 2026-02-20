"""
ENHANCED X-RAY PREDICTION SYSTEM
Uses ResNet18 transfer learning model for high accuracy pneumonia detection
"""

import torch
import torch.nn as nn
from torchvision import transforms, models
from PIL import Image, ImageStat
import numpy as np
import cv2
import os

# ============================================================
# LOAD RESNET18 MODEL
# ============================================================

device = torch.device("cpu")

# Load pre-trained ResNet18 and modify for our task
model = models.resnet18(pretrained=False)
num_features = model.fc.in_features
model.fc = nn.Sequential(
    nn.Dropout(0.5),
    nn.Linear(num_features, 256),
    nn.ReLU(),
    nn.Dropout(0.3),
    nn.Linear(256, 2)
)

# Load trained weights
model.load_state_dict(torch.load("xray_pneumonia_model.pth", map_location=device))
model.eval()
model.to(device)

print("✓ ResNet18 model loaded successfully!")

# ============================================================
# GRADCAM FOR VISUALIZATION
# ============================================================

gradients = None
activations = None

def backward_hook(module, grad_in, grad_out):
    global gradients
    gradients = grad_out[0]

def forward_hook(module, input, output):
    global activations
    activations = output

# Register hooks on layer4 (last conv layer in ResNet)
model.layer4[1].conv2.register_forward_hook(forward_hook)
model.layer4[1].conv2.register_full_backward_hook(backward_hook)

# ============================================================
# MEDICAL KNOWLEDGE BASE
# ============================================================

MEDICAL_DESCRIPTIONS = {
    "NORMAL": {
        "primary": "Normal Chest X-Ray",
        "description": "The chest X-ray shows clear lung fields with no signs of pneumonia, consolidation, or other abnormalities. The cardiac silhouette appears normal in size and shape. No pleural effusion or pneumothorax detected.",
        "findings": [
            "Clear bilateral lung fields",
            "Normal cardiac silhouette",
            "No pleural effusion detected",
            "No signs of consolidation or infiltrates",
            "Normal pulmonary vasculature",
            "No evidence of pneumothorax"
        ],
        "recommendations": [
            "No immediate medical intervention required",
            "Continue routine health monitoring",
            "Maintain healthy lifestyle practices",
            "Follow up as per routine schedule"
        ],
        "severity": "None",
        "urgency": "Routine",
        "risk_level": "Low"
    },
    "PNEUMONIA": {
        "primary": "Pneumonia Detected",
        "description": "The chest X-ray shows radiographic evidence consistent with pneumonia. Areas of consolidation or infiltrates are visible in the lung fields, indicating possible bacterial or viral infection. Immediate medical attention is recommended.",
        "findings": [
            "Consolidation in lung fields detected",
            "Infiltrates present in affected areas",
            "Increased opacity indicating infection",
            "Air bronchograms may be visible",
            "Possible pleural involvement",
            "Abnormal lung parenchyma density"
        ],
        "recommendations": [
            "Immediate medical consultation required",
            "Clinical correlation with symptoms essential",
            "Consider antibiotic therapy if bacterial origin",
            "Follow-up chest X-ray recommended in 4-6 weeks",
            "Monitor for complications (pleural effusion, abscess)",
            "Supportive care and rest advised"
        ],
        "severity": "Moderate to High",
        "urgency": "Urgent",
        "risk_level": "High"
    }
}

# ============================================================
# SYMPTOM ANALYSIS
# ============================================================

def analyze_symptoms(symptom_text):
    """Enhanced symptom analysis with risk assessment"""
    if not symptom_text:
        return {
            "risk_category": "Unknown",
            "risk_score": 0.0,
            "matched_symptoms": [],
            "additional_concerns": []
        }
    
    text = symptom_text.lower()
    
    # Symptom keywords with severity weights
    symptom_keywords = {
        "severe": ["severe", "intense", "extreme", "unbearable", "acute"],
        "respiratory": ["cough", "breath", "breathing", "shortness", "wheez", "dyspnea"],
        "fever": ["fever", "temperature", "hot", "chills", "sweating"],
        "pain": ["pain", "chest pain", "ache", "discomfort", "hurt"],
        "fatigue": ["tired", "fatigue", "weak", "exhausted", "lethargy"],
        "mucus": ["mucus", "phlegm", "sputum", "discharge"],
        "emergency": ["blood", "hemoptysis", "confusion", "unconscious", "severe pain"]
    }
    
    matched = []
    risk_score = 0.0
    
    for category, keywords in symptom_keywords.items():
        for keyword in keywords:
            if keyword in text:
                matched.append(category)
                if category == "emergency":
                    risk_score += 0.4
                elif category == "severe":
                    risk_score += 0.3
                elif category in ["respiratory", "fever", "pain"]:
                    risk_score += 0.2
                else:
                    risk_score += 0.1
                break
    
    risk_score = min(risk_score, 1.0)
    
    if risk_score >= 0.7:
        risk_category = "High"
    elif risk_score >= 0.4:
        risk_category = "Moderate"
    elif risk_score >= 0.1:
        risk_category = "Low"
    else:
        risk_category = "Minimal"
    
    return {
        "risk_category": risk_category,
        "risk_score": risk_score,
        "matched_symptoms": list(set(matched)),
        "additional_concerns": ["Seek immediate medical attention" if risk_score >= 0.7 else "Monitor symptoms closely"]
    }

# ============================================================
# PREDICTION FUNCTION
# ============================================================

def predict_image(image_path, symptoms=None):
    """
    High-accuracy prediction using ResNet18 transfer learning
    
    Args:
        image_path: Path to chest X-ray image
        symptoms: Optional symptom description
        
    Returns:
        dict: Comprehensive analysis results
    """
    
    # Load and validate image
    image = Image.open(image_path).convert("RGB")
    
    # Check if image is valid chest X-ray (grayscale check)
    hsv_img = image.convert("HSV")
    stat = ImageStat.Stat(hsv_img)
    avg_saturation = stat.mean[1]
    
    if avg_saturation > 45:
        raise ValueError(f"Invalid Image. High Color Saturation ({avg_saturation:.1f}). Please upload a grayscale Chest X-Ray.")
    
    std_dev_brightness = stat.stddev[2]
    if std_dev_brightness < 10:
        raise ValueError("Invalid Image. Image is too flat or blank. Please upload a valid scan.")
    
    # Transform image (MUST MATCH TRAINING)
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    input_tensor = transform(image).unsqueeze(0).to(device)
    
    # IMPORTANT: We need gradients for GradCAM even in validation mode
    # Remove torch.no_grad() but keep model in eval mode
    
    # Forward pass
    output = model(input_tensor)
    probabilities = torch.softmax(output, dim=1)[0]
    
    # Get predictions (detach to get simple float values)
    normal_confidence = probabilities[0].detach().item()
    pneumonia_confidence = probabilities[1].detach().item()
    
    prediction_idx = torch.argmax(output, dim=1).item()
    primary_confidence = probabilities[prediction_idx].detach().item()
    
    # Determine prediction label
    prediction_label = "PNEUMONIA" if prediction_idx == 1 else "NORMAL"
    
    # Calculate uncertainty
    uncertainty = 1.0 - abs(normal_confidence - pneumonia_confidence)
    
    # Generate GradCAM heatmap
    model.zero_grad()
    output[0][prediction_idx].backward()
    
    # Check if gradients were captured
    if gradients is None or activations is None:
        # Fallback empty heatmap if something failed
        cam = np.zeros((224, 224), dtype=np.float32)
    else:
        grads = gradients.detach().cpu().numpy()[0]
        acts = activations.detach().cpu().numpy()[0]
        
        weights = grads.mean(axis=(1,2))
        cam = np.zeros(acts.shape[1:], dtype=np.float32)
        
        for i, w in enumerate(weights):
            cam += w * acts[i]
        
        cam = np.maximum(cam, 0)
        cam = cv2.resize(cam, (224, 224))
        if cam.max() != 0:
            cam = cam / cam.max()
    
    # Create heatmap overlay
    heatmap = cv2.applyColorMap(np.uint8(255 * cam), cv2.COLORMAP_JET)
    
    # Save heatmap
    base_name = os.path.basename(image_path)
    heatmap_filename = f"heatmap_{base_name}"
    heatmap_path = os.path.join("uploaded_images", heatmap_filename)
    
    os.makedirs("uploaded_images", exist_ok=True)
    cv2.imwrite(heatmap_path, heatmap)
    
    # Get medical information
    medical_info = MEDICAL_DESCRIPTIONS[prediction_label]
    
    # Analyze symptoms
    symptom_analysis = analyze_symptoms(symptoms) if symptoms else None
    
    # Determine overall severity
    if prediction_label == "PNEUMONIA":
        if symptom_analysis and symptom_analysis["risk_score"] >= 0.7:
            overall_severity = "High"
            overall_risk = "Critical"
        elif primary_confidence >= 0.85:
            overall_severity = "Moderate-High"
            overall_risk = "High"
        else:
            overall_severity = "Moderate"
            overall_risk = "Moderate"
    else:
        if symptom_analysis and symptom_analysis["risk_score"] >= 0.5:
            overall_severity = "Low-Moderate"
            overall_risk = "Moderate"
        else:
            overall_severity = "None"
            overall_risk = "Low"
    
    # Compile result
    result = {
        "prediction": prediction_label,
        "confidence": round(primary_confidence * 100, 2),
        "normal_probability": round(normal_confidence * 100, 2),
        "pneumonia_probability": round(pneumonia_confidence * 100, 2),
        "uncertainty": round(uncertainty * 100, 2),
        
        # Medical information
        "primary_finding": medical_info["primary"],
        "description": medical_info["description"],
        "detailed_findings": medical_info["findings"],
        "recommendations": medical_info["recommendations"],
        
        # Risk assessment
        "severity": overall_severity,
        "urgency": medical_info["urgency"],
        "risk_level": overall_risk,
        
        # Technical details
        "heatmap_path": heatmap_path,
        "file_url": image_path,
        "model_version": "ResNet18_TransferLearning_v1.0",
        
        # Symptom analysis
        "symptom_analysis": symptom_analysis,
        "symptom_risk": symptom_analysis["risk_category"] if symptom_analysis else "Not Provided"
    }
    
    return result

# ============================================================
# TEST FUNCTION
# ============================================================

if __name__ == "__main__":
    print("\n" + "="*60)
    print("TESTING RESNET18 MODEL")
    print("="*60)
    
    # Test with pneumonia image
    test_img = os.path.join("..", "chest_xray", "test", "PNEUMONIA", "person100_bacteria_475.jpeg")
    
    if os.path.exists(test_img):
        result = predict_image(test_img, symptoms="severe cough with fever and chest pain")
        
        print("\n" + "="*60)
        print("CHEST X-RAY ANALYSIS REPORT")
        print("="*60)
        print(f"\nPrimary Finding: {result['primary_finding']}")
        print(f"Prediction: {result['prediction']}")
        print(f"Confidence: {result['confidence']}%")
        print(f"\nNormal Probability: {result['normal_probability']}%")
        print(f"Pneumonia Probability: {result['pneumonia_probability']}%")
        print(f"\nSeverity: {result['severity']}")
        print(f"Risk Level: {result['risk_level']}")
        print("="*60)
    else:
        print(f"Test image not found: {test_img}")
