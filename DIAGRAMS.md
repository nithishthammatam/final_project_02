# System Diagrams

Since direct image generation is currently unavailable, please use the following [Mermaid](https://mermaid.js.org/) diagrams. You can view these directly in VS Code (if you have a Mermaid preview extension) or copy the code to [Mermaid Live Editor](https://mermaid.live/) to download them as PNGs.

## 1. System Architecture

```mermaid
graph TD
    subgraph Client_Side
        FE[Frontend (Next.js)]
        style FE fill:#e1f5fe,stroke:#01579b
    end
     
    subgraph Server_Side
        BE[Backend API (FastAPI)]
        style BE fill:#e8f5e9,stroke:#2e7d32
        AI[AI Model (PyTorch/CNN)]
        style AI fill:#fff3e0,stroke:#ef6c00
    end
    
    subgraph Database
        FS[(Firebase Firestore)]
        style FS fill:#fce4ec,stroke:#c2185b
    end

    Patient((Patient)) -->|Uploads X-Ray| FE
    Doctor((Doctor)) -->|Reviews Cases| FE
    
    FE -->|POST Image| BE
    BE <-->|Inference| AI
    BE -->|Store Results| FS
    FE <-->|Real-time Sync| FS
```

## 2. Use Case Diagram

```mermaid
usecaseDiagram
    actor "Patient" as P
    actor "Doctor" as D
    
    package "Integrated Healthcare System" {
        usecase "Register/Login" as UC1
        usecase "Upload Medical Scan" as UC2
        usecase "View AI Analysis" as UC3
        usecase "Book Appointment" as UC4
        usecase "View Patient Queue" as UC5
        usecase "Review & Validate Scan" as UC6
        usecase "Manage Schedule" as UC7
    }

    P --> UC1
    P --> UC2
    P --> UC3
    P --> UC4
    
    D --> UC1
    D --> UC5
    D --> UC6
    D --> UC7
```

## 3. Sequence Diagram (Scan Upload & Review Flow)

```mermaid
sequenceDiagram
    autonumber
    participant P as Patient
    participant FE as Frontend UI
    participant BE as Backend API
    participant AI as AI Model
    participant DB as Firestore DB
    participant D as Doctor

    box "Upload Phase" #f9f9f9
    P->>FE: Upload Chest X-Ray
    FE->>BE: Send Image (POST /predict)
    BE->>AI: Predict(Image)
    AI-->>BE: Result (Pneumonia: 85%)
    BE->>DB: Create Record (Status: Pending)
    BE-->>FE: Return Prediction
    FE-->>P: Show AI Result & "Pending Review"
    end

    box "Doctor Review Phase" #e0f7fa
    D->>FE: Log in to Dashboard
    FE->>DB: Listen/Get Pending Records
    DB-->>FE: List of Cases
    D->>FE: Select Patient Case
    D->>FE: Input Diagnosis & Notes
    FE->>DB: Update Record (Status: Reviewed)
    end

    box "Feedback Phase" #fff8e1
    P->>FE: Check Notification/Dashboard
    FE->>DB: Get Reviewed Record
    DB-->>FE: Return Doctor Data
    FE-->>P: Display "Reviewed by Dr. X"
    end
```
