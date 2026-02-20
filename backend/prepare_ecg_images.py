import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import os

# Configuration
CSV_PATH = r"..\chest_xray\mitbih_test.csv"
OUTPUT_DIR = "ecg_image_data"
SAMPLES_PER_CLASS = 100 # Just 100 per class for rapid prototype

CLASS_NAMES = {
    0: "Normal",
    1: "Supraventricular",
    2: "Ventricular",
    3: "Fusion",
    4: "Unknown"
}

def generate_ecg_images():
    print("Loading CSV...")
    try:
        df = pd.read_csv(CSV_PATH, header=None)
    except:
        print("CSV not found.")
        return

    # Group likely indices to speed up
    # We will just iterate and pick.
    
    counts = {k: 0 for k in CLASS_NAMES.keys()}
    
    # Create dirs
    for name in CLASS_NAMES.values():
        os.makedirs(os.path.join(OUTPUT_DIR, "train", name), exist_ok=True)
        os.makedirs(os.path.join(OUTPUT_DIR, "test", name), exist_ok=True)
    
    print("Generating balanced dataset...")
    
    data = df.values
    
    for i in range(len(data)):
        label = int(data[i, -1])
        if counts[label] >= SAMPLES_PER_CLASS:
            continue
            
        signal = data[i, :-1]
        
        plt.figure(figsize=(4, 4))
        plt.plot(signal, color='black', linewidth=2)
        plt.axis('off')
        plt.xlim(0, 187)
        
        split = "train" if counts[label] < SAMPLES_PER_CLASS * 0.8 else "test"
        filename = f"{CLASS_NAMES[label]}_{counts[label]}.png"
        path = os.path.join(OUTPUT_DIR, split, CLASS_NAMES[label], filename)
        
        plt.savefig(path, bbox_inches='tight', pad_inches=0, dpi=50)
        plt.close()
        
        counts[label] += 1
        print(f"Generated {sum(counts.values())} images (Class {label})...", end='\r')
        
        if all(c >= SAMPLES_PER_CLASS for c in counts.values()):
            break
            
    print("\nDone.")
    for k, v in counts.items():
        print(f"{CLASS_NAMES[k]}: {v}")

if __name__ == "__main__":
    generate_ecg_images()
