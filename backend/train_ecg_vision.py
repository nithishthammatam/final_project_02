"""
ECG VISION MODEL TRAINING
Trains a ResNet18 model to classify ECG images generated from CSV data.
"""

import os
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import datasets, transforms, models
import time

# Configuration
DATASET_PATH = "ecg_image_data"
BATCH_SIZE = 32
LEARNING_RATE = 0.001
NUM_EPOCHS = 5
IMG_SIZE = 224
NUM_CLASSES = 5

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

def train_ecg_model():
    print("="*60)
    print("TRAINING ECG VISION MODEL (ResNet18)")
    print("="*60)
    
    # Transforms
    train_transforms = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.RandomHorizontalFlip(p=0.2), # Some ECG variations might be valid reversed? Actually no, time flows one way. Flip is bad for ECG usually. Removing flip.
        # Actually horizontal flip is meaningless for time series plot. Let's remove it.
        transforms.Grayscale(num_output_channels=3), # Ensure consistent channels
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    # Re-define without flip for ECG
    train_transforms = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    val_transforms = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    # Load data
    train_dataset = datasets.ImageFolder(os.path.join(DATASET_PATH, "train"), transform=train_transforms)
    test_dataset = datasets.ImageFolder(os.path.join(DATASET_PATH, "test"), transform=val_transforms)
    
    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False)
    
    print(f"Classes: {train_dataset.classes}")
    
    # Load Model
    model = models.resnet18(pretrained=True)
    
    # Modify final layer
    num_features = model.fc.in_features
    model.fc = nn.Sequential(
        nn.Dropout(0.5),
        nn.Linear(num_features, 128),
        nn.ReLU(),
        nn.Linear(128, NUM_CLASSES)
    )
    
    model = model.to(device)
    
    # Training setup
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)
    
    # Loop
    for epoch in range(NUM_EPOCHS):
        print(f"\nEpoch {epoch+1}/{NUM_EPOCHS}")
        
        # Train
        model.train()
        running_loss = 0.0
        correct = 0
        total = 0
        
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            
            running_loss += loss.item()
            _, predicted = torch.max(outputs.data, 1)
            total += labels.size(0)
            correct += (predicted == labels).sum().item()
            
        train_acc = 100 * correct / total
        print(f"Train Loss: {running_loss/len(train_loader):.4f} | Acc: {train_acc:.2f}%")
        
        # Test
        model.eval()
        correct = 0
        total = 0
        with torch.no_grad():
            for images, labels in test_loader:
                images, labels = images.to(device), labels.to(device)
                outputs = model(images)
                _, predicted = torch.max(outputs.data, 1)
                total += labels.size(0)
                correct += (predicted == labels).sum().item()
        
        test_acc = 100 * correct / total
        print(f"Test Acc: {test_acc:.2f}%")
        
    # Save
    torch.save(model.state_dict(), "ecg_resnet_model.pth")
    print("\nModel saved as ecg_resnet_model.pth")

if __name__ == "__main__":
    train_ecg_model()
