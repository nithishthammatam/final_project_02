"use client";
/* eslint-disable react/no-unescaped-entities */
import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import ImageViewer from '@/components/ImageViewer';
import { Upload, FileText, CheckCircle, Clock, Activity, Heart, Thermometer, Clipboard, Bell, Shield, FilePlus, AlertCircle, Home, Trash2, Folder, Download, File, X, Stethoscope, Calendar } from 'lucide-react';
import { db, auth, storage } from '@/lib/firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, getDoc, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import { getApiUrl } from '@/lib/config';

export default function PatientDashboard() {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState("");
    const [records, setRecords] = useState<any[]>([]);
    const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
    const [userProfile, setUserProfile] = useState<any>(null);

    // New Features State
    const [activeTab, setActiveTab] = useState('overview');
    const [medicalRecordsSubTab, setMedicalRecordsSubTab] = useState<'xray' | 'ecg'>('xray');
    const [consent, setConsent] = useState(false);
    const [showConsentDialog, setShowConsentDialog] = useState(false);
    const [symptoms, setSymptoms] = useState("");
    const [vitals, setVitals] = useState({ bp: '', heartRate: '', weight: '', temp: '' });

    // X-ray Upload Result State
    const [xrayPrediction, setXrayPrediction] = useState<any>(null);

    // ECG Upload State
    const [ecgFile, setEcgFile] = useState<File | null>(null);
    const [ecgUploading, setEcgUploading] = useState(false);
    const [ecgUploadProgress, setEcgUploadProgress] = useState("");
    const [ecgPrediction, setEcgPrediction] = useState<any>(null);

    // Symptom Entries State
    const [symptomEntries, setSymptomEntries] = useState<any[]>([]);
    const [latestSymptomResult, setLatestSymptomResult] = useState<any>(null);

    // Appointment State
    const [apptReason, setApptReason] = useState("");
    const [apptDate, setApptDate] = useState("");
    const [appointments, setAppointments] = useState<any[]>([]);

    // File Storage State
    const [storedFiles, setStoredFiles] = useState<any[]>([]);
    const [uploadingFile, setUploadingFile] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [activeMeeting, setActiveMeeting] = useState<string | null>(null);
    const [fileCategory, setFileCategory] = useState("medical");
    const [fileDescription, setFileDescription] = useState("");

    const router = useRouter();

    // Helper Functions for Health Features
    const getHealthSuggestion = () => {
        const latestXray = records.find(r => r.type === "XRAY" || !r.type);
        const xrayResult = xrayPrediction?.prediction || latestXray?.aiPrediction;

        const latestECG = records.find(r => r.type === "ECG");
        const ecgResult = ecgPrediction?.ECG_Prediction_Label || latestECG?.ecgPredictionLabel;

        const symptomRisk = xrayPrediction?.symptom_risk || latestXray?.symptomRisk || "Low";

        if (xrayResult === "NORMAL" && ecgResult === "Normal Beat" && symptomRisk === "Low") {
            return "Maintain healthy routine, drink enough water, and do regular exercise.";
        }
        if (xrayResult === "PNEUMONIA" && symptomRisk === "High") {
            return "Seek immediate medical consultation. Avoid physical strain.";
        }
        if (xrayResult === "PNEUMONIA" && symptomRisk === "Moderate") {
            return "Monitor symptoms closely. Rest adequately and stay hydrated.";
        }
        if (xrayResult === "NORMAL" && ecgResult && ecgResult !== "Normal Beat") {
            return "Cardiac abnormality detected. Please consult with a cardiologist.";
        }
        if (ecgResult && ecgResult !== "Normal Beat") {
            return "Cardiac abnormality detected. Please consult with a cardiologist.";
        }
        if (xrayResult === "PNEUMONIA") {
            return "Respiratory condition detected. Follow doctor's recommendations and avoid smoking.";
        }
        return "Follow doctor's recommendations and maintain regular check-ups.";
    };

    const calculateOverallRisk = () => {
        const latestXray = records.find(r => r.type === "XRAY" || !r.type);
        const latestECG = records.find(r => r.type === "ECG");

        const xrayRisk = xrayPrediction?.risk_level || latestXray?.aiRiskLevel || "Low";
        const ecgClass = ecgPrediction?.ECG_Prediction_Class ?? latestECG?.ecgPrediction;
        const symptomRisk = xrayPrediction?.symptom_risk || latestXray?.symptomRisk || "Low";

        let riskScore = 0;

        if (xrayRisk === "High") riskScore += 3;
        else if (xrayRisk === "Moderate") riskScore += 2;
        else if (xrayRisk === "Low") riskScore += 1;

        if (ecgClass !== undefined && ecgClass !== null && ecgClass !== 0) {
            riskScore += 2;
        }

        if (symptomRisk === "High") riskScore += 2;
        else if (symptomRisk === "Moderate") riskScore += 1;

        if (riskScore >= 5) return { level: "HIGH", color: "text-red-400", bg: "bg-red-500/20", border: "border-red-500/30" };
        if (riskScore >= 3) return { level: "MODERATE", color: "text-yellow-400", bg: "bg-yellow-500/20", border: "border-yellow-500/30" };
        return { level: "LOW", color: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-emerald-500/30" };
    };

    // Handle Medical Records Tab Click
    const handleMedicalRecordsClick = () => {
        if (!consent) {
            setShowConsentDialog(true);
        } else {
            setActiveTab('records');
        }
    };

    const handleConsentAccept = () => {
        setConsent(true);
        setShowConsentDialog(false);
        setActiveTab('records');
    };

    // Protect Route
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async user => {
            if (!user) router.push('/login');
            else {
                const snap = await getDoc(doc(db, "users", user.uid));
                if (snap.exists()) setUserProfile(snap.data());
            }
        });
        return () => unsubscribe();
    }, [router]);

    // Fetch Appointments
    useEffect(() => {
        if (!auth.currentUser) return;
        const q = query(
            collection(db, "appointments"),
            where("patientId", "==", auth.currentUser.uid)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAppointments(docs);
        });
        return () => unsubscribe();
    }, []);

    // Handle Booking
    const handleBookAppointment = async () => {
        if (!auth.currentUser || !apptReason || !apptDate) return;
        try {
            await addDoc(collection(db, "appointments"), {
                patientId: auth.currentUser.uid,
                patientName: userProfile?.fullName || "Unknown Patient",
                patientEmail: auth.currentUser.email,
                patientMobile: userProfile?.mobile || "N/A",
                reason: apptReason,
                date: apptDate,
                status: "PENDING",
                requestedAt: new Date().toISOString()
            });
            setApptReason("");
            setApptDate("");
            alert("Appointment Request Sent!");
        } catch (e: any) {
            console.error(e);
            alert("Failed to book appointment. Please try again.");
        }
    };

    // Fetch Records
    useEffect(() => {
        if (!auth.currentUser) return;

        const q = query(
            collection(db, "medical_records"),
            where("patientId", "==", auth.currentUser.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            docs.sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
            setRecords(docs);
            if (docs.length > 0) {
                setExpandedRecordId(docs[0].id);
            }
        });

        return () => unsubscribe();
    }, []);

    // Fetch Symptom Entries
    useEffect(() => {
        if (!auth.currentUser) return;

        const q = query(
            collection(db, "symptoms"),
            where("patientId", "==", auth.currentUser.uid),
            orderBy("recordedAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSymptomEntries(docs);

            if (latestSymptomResult) {
                const updatedEntry = docs.find(d => d.id === latestSymptomResult.id);
                if (updatedEntry) {
                    setLatestSymptomResult(updatedEntry);
                }
            }
        });

        return () => unsubscribe();
    }, [latestSymptomResult?.id]);

    // Load stored files
    useEffect(() => {
        if (!auth.currentUser) return;

        const q = query(
            collection(db, "stored_files"),
            where("patientId", "==", auth.currentUser.uid),
            orderBy("uploadedAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const files = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setStoredFiles(files);
        });

        return () => unsubscribe();
    }, [auth.currentUser]);

    const handleSaveVitals = async () => {
        if (!auth.currentUser) return;
        await addDoc(collection(db, "vitals"), {
            patientId: auth.currentUser.uid,
            ...vitals,
            recordedAt: new Date().toISOString()
        });
        setVitals({ bp: '', heartRate: '', weight: '', temp: '' });
        alert("Vitals Recorded");
    };

    const handleSaveSymptoms = async () => {
        if (!auth.currentUser || !symptoms.trim()) {
            alert("Please enter your symptoms.");
            return;
        }

        try {
            const formData = new FormData();
            formData.append("symptom_text", symptoms);

            const response = await fetch(getApiUrl('/analyze_symptoms'), {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                throw new Error("Symptom analysis failed");
            }

            const aiResult = await response.json();

            const symptomData = {
                patientId: auth.currentUser.uid,
                patientName: userProfile?.fullName || "Unknown Patient",
                patientEmail: auth.currentUser.email,
                patientMobile: userProfile?.mobile || "",
                symptomText: aiResult.symptomText,
                symptomRisk: aiResult.symptomRisk,
                riskScore: aiResult.riskScore,
                aiSuggestion: aiResult.basicSuggestion,
                status: "PENDING_REVIEW",
                recordedAt: new Date().toISOString(),
                reviewedAt: null,
                doctorNote: null,
                doctorId: null,
                doctorName: null,
                agreeWithAI: null
            };

            const docRef = await addDoc(collection(db, "symptoms"), symptomData);

            setLatestSymptomResult({
                id: docRef.id,
                ...symptomData
            });

            setSymptoms("");
        } catch (error: any) {
            console.error(error);
            alert("Failed to analyze symptoms. Please try again.");
        }
    };

    const handleDelete = async (recordId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this record?")) return;

        try {
            await deleteDoc(doc(db, "medical_records", recordId));
        } catch (error) {
            console.error("Error deleting record:", error);
            alert("Failed to delete record.");
        }
    };

    const handleUpload = async () => {
        if (!file || !auth.currentUser) return;
        if (!consent) {
            alert("Please provide consent for AI analysis.");
            return;
        }
        setUploading(true);
        setUploadProgress("Uploading image...");

        try {
            setUploadProgress("Running AI analysis...");
            const formData = new FormData();
            formData.append("file", file);
            if (symptoms) formData.append("symptoms", symptoms);

            const response = await fetch(getApiUrl('/predict'), {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                let errMsg = "X-ray analysis failed. Please try again.";
                if (errData.detail) {
                    if (errData.detail.includes("Invalid Image")) {
                        errMsg = "Invalid image format. Please upload a valid chest X-ray image.";
                    } else if (errData.detail.includes("connection") || errData.detail.includes("failed")) {
                        errMsg = "Unable to connect to analysis server. Please ensure the backend is running.";
                    } else {
                        errMsg = `Analysis error: ${errData.detail}`;
                    }
                }
                throw new Error(errMsg);
            }

            setUploadProgress("Saving results...");
            const data = await response.json();
            const cloudinaryURL = data.file_url;
            const heatmapURL = data.heatmap_url || "";

            setXrayPrediction({
                ...data,
                fileUrl: cloudinaryURL,
                heatmapUrl: heatmapURL,
                fileName: file.name
            });

            await addDoc(collection(db, "medical_records"), {
                patientId: auth.currentUser.uid,
                patientName: userProfile?.fullName || "Unknown",
                patientEmail: auth.currentUser.email || "N/A",
                patientMobile: userProfile?.mobile || "N/A",
                type: "XRAY",
                fileUrl: cloudinaryURL,
                cloudinaryPublicId: data.cloudinary_public_id || "",
                fileName: file.name,
                status: "PENDING_REVIEW",
                uploadedAt: new Date().toISOString(),
                aiPrediction: data.prediction,
                aiConfidence: data.confidence,
                aiSeverity: data.severity,
                aiUncertainty: data.uncertainty,
                aiRiskLevel: data.risk_level,
                symptomRisk: data.symptom_risk || "None",
                heatmapUrl: heatmapURL
            });

            setFile(null);
            setSymptoms("");
            setUploadProgress("Complete!");
            setTimeout(() => setUploadProgress(""), 1000);
            alert("Upload & AI Analysis Successful!");
        } catch (error: any) {
            console.error(error);
            setUploadProgress("");
            alert(error.message || "X-ray analysis failed. Please check your connection and try again.");
        } finally {
            setUploading(false);
        }
    };

    const handleEcgUpload = async () => {
        if (!ecgFile || !auth.currentUser) return;
        if (!consent) {
            alert("Please provide consent for AI analysis.");
            return;
        }
        setEcgUploading(true);
        setEcgUploadProgress("Uploading ECG...");
        setEcgPrediction(null);

        try {
            let imagePreview: string | null = null;
            if (ecgFile.type.startsWith('image/')) {
                imagePreview = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target?.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(ecgFile);
                });
            }


            const formData = new FormData();
            formData.append("file", ecgFile);

            const response = await fetch(getApiUrl('/predict_ecg'), {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                let errMsg = "ECG analysis failed. Please try again.";
                if (errData.detail) {
                    if (errData.detail.includes("Invalid CSV") || errData.detail.includes("CSV format")) {
                        errMsg = "Invalid CSV file format. Please upload a valid ECG CSV file.";
                    } else if (errData.detail.includes("connection") || errData.detail.includes("failed")) {
                        errMsg = "Unable to connect to analysis server. Please ensure the backend is running.";
                    } else if (errData.detail.includes("encoding")) {
                        errMsg = "File encoding error. Please ensure your CSV file is UTF-8 encoded.";
                    } else {
                        errMsg = `Analysis error: ${errData.detail}`;
                    }
                }
                throw new Error(errMsg);
            }

            const data = await response.json();
            setEcgPrediction(data);

            const ecgClassLabels: { [key: number]: string } = {
                0: "Normal",
                1: "Abnormal",
                2: "Arrhythmia",
                3: "Atrial Fibrillation",
                4: "Other"
            };

            const recordData: any = {
                patientId: auth.currentUser.uid,
                patientName: userProfile?.fullName || "Unknown",
                patientEmail: auth.currentUser.email || "N/A",
                patientMobile: userProfile?.mobile || "N/A",
                type: "ECG",
                fileName: ecgFile.name,
                fileUrl: data.file_url, // Use Cloudinary URL
                status: "PENDING_REVIEW",
                uploadedAt: new Date().toISOString(),
                ecgPrediction: data.prediction,
                ecgPredictionLabel: data.prediction,
                confidence: data.confidence,
                report: data.report,
                heatmapUrl: data.heatmap_url
            };

            if (imagePreview) {
                recordData.imagePreview = imagePreview;
            }

            if (data.confidence !== undefined && data.confidence !== null) {
                recordData.ecgConfidence = data.confidence;
            }

            await addDoc(collection(db, "medical_records"), recordData);

            alert("ECG Analysis Successful!");
        } catch (error: any) {
            console.error(error);
            alert(error.message || "ECG analysis failed. Please check your connection and try again.");
        } finally {
            setEcgUploading(false);
        }
    };

    // File Storage Handlers
    const handleFileUpload = async () => {
        if (!selectedFile || !auth.currentUser) return;

        setUploadingFile(true);
        try {
            const fileRef = ref(storage, `patient_files/${auth.currentUser.uid}/${Date.now()}_${selectedFile.name}`);

            const snapshot = await uploadBytes(fileRef, selectedFile);
            const downloadURL = await getDownloadURL(snapshot.ref);

            await addDoc(collection(db, "stored_files"), {
                patientId: auth.currentUser.uid,
                patientName: userProfile?.fullName || "Unknown",
                fileName: selectedFile.name,
                fileType: selectedFile.type,
                fileSize: selectedFile.size,
                category: fileCategory,
                description: fileDescription || "No description",
                downloadURL: downloadURL,
                storagePath: snapshot.ref.fullPath,
                uploadedAt: new Date().toISOString(),
                uploadedBy: auth.currentUser.email || "N/A"
            });

            alert("File uploaded successfully!");
            setSelectedFile(null);
            setFileDescription("");
            setFileCategory("medical");
        } catch (error: any) {
            console.error("File upload error:", error);
            alert("Failed to upload file: " + error.message);
        } finally {
            setUploadingFile(false);
        }
    };

    const handleFileDelete = async (fileId: string, storagePath: string) => {
        if (!confirm("Are you sure you want to delete this file?")) return;

        try {
            const fileRef = ref(storage, storagePath);
            await deleteObject(fileRef);

            await deleteDoc(doc(db, "stored_files", fileId));

            alert("File deleted successfully!");
        } catch (error: any) {
            console.error("File delete error:", error);
            alert("Failed to delete file: " + error.message);
        }
    };

    const handleFileDownload = async (downloadURL: string, fileName: string) => {
        try {
            const response = await fetch(downloadURL);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error: any) {
            console.error("Download error:", error);
            alert("Failed to download file: " + error.message);
        }
    };

    const xrayRecords = records.filter(r => r.type === "XRAY" || !r.type);
    const ecgRecords = records.filter(r => r.type === "ECG");

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Navbar />

            {/* Consent Dialog */}
            {showConsentDialog && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-white/10 rounded-2xl max-w-md w-full p-8 shadow-2xl">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-blue-500/20 rounded-xl">
                                <Shield className="text-blue-400" size={24} />
                            </div>
                            <h3 className="text-xl font-bold">AI Analysis Consent</h3>
                        </div>

                        <div className="space-y-4 mb-6">
                            <p className="text-gray-300 text-sm leading-relaxed">
                                By proceeding, you consent to AI-powered analysis of your medical data for screening and diagnostic support purposes.
                            </p>

                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                                <h4 className="text-blue-400 font-semibold text-sm mb-2">Your data will be:</h4>
                                <ul className="space-y-2 text-xs text-gray-400">
                                    <li className="flex items-start gap-2">
                                        <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                                        <span>Processed securely using encrypted AI models</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                                        <span>Reviewed by qualified healthcare professionals</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                                        <span>Stored with HIPAA-compliant security measures</span>
                                    </li>
                                </ul>
                            </div>

                            <p className="text-xs text-gray-500 italic">
                                Note: AI analysis is for screening purposes only and does not replace professional medical diagnosis.
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowConsentDialog(false)}
                                className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg font-medium transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConsentAccept}
                                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold transition shadow-lg shadow-blue-500/30"
                            >
                                I Consent
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="w-full flex flex-col md:flex-row">

                {/* Sidebar Navigation */}
                <aside className="w-full md:w-64 shrink-0 flex flex-col gap-2 p-4 md:p-6 bg-black/20 border-r border-white/5">
                    <button onClick={() => setActiveTab('overview')} className={`p-3 rounded-xl flex items-center gap-3 transition ${activeTab === 'overview' ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/20' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                        <Home size={18} /> Overview
                    </button>
                    <button onClick={handleMedicalRecordsClick} className={`p-3 rounded-xl flex items-center gap-3 transition ${activeTab === 'records' ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/20' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                        <FileText size={18} /> Medical Records
                    </button>
                    <button onClick={() => setActiveTab('tracking')} className={`p-3 rounded-xl flex items-center gap-3 transition ${activeTab === 'tracking' ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/20' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                        <Activity size={18} /> Health Tracker
                    </button>
                    <button onClick={() => setActiveTab('consultations')} className={`p-3 rounded-xl flex items-center gap-3 transition ${activeTab === 'consultations' ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/20' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                        <Clock size={18} /> Consultations
                    </button>
                    <button onClick={() => setActiveTab('files')} className={`p-3 rounded-xl flex items-center gap-3 transition ${activeTab === 'files' ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/20' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                        <Folder size={18} /> My Files
                    </button>
                </aside>

                {/* Content Area */}
                <section className="flex-1 p-4 md:p-6 min-h-[80vh]">

                    {/* TAB: OVERVIEW */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6 max-w-6xl">
                            <h2 className="text-2xl font-bold">Welcome, {userProfile?.fullName || "Patient"}</h2>

                            {/* Alerts / Notifications */}
                            <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl flex gap-3 items-start">
                                <Bell className="text-yellow-400 shrink-0" size={20} />
                                <div>
                                    <h3 className="font-bold text-yellow-400 text-sm">Notifications</h3>
                                    <p className="text-xs text-gray-300 mt-1">Dr. Smith reviewed your Chest X-Ray (2 hours ago).</p>
                                    <p className="text-xs text-gray-300 mt-0.5">Appointment confirmed for Jan 24, 10:00 AM.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                    <p className="text-gray-400 text-xs uppercase mb-2">Total Records</p>
                                    <p className="text-3xl font-bold">{records.length}</p>
                                </div>
                                <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                    <p className="text-gray-400 text-xs uppercase mb-2">Upcoming Visits</p>
                                    <p className="text-3xl font-bold">{appointments.filter(a => a.status === 'SCHEDULED').length}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB: MEDICAL RECORDS */}
                    {activeTab === 'records' && (
                        <div className="space-y-6 max-w-7xl">
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-bold flex items-center gap-3">
                                    <Stethoscope className="text-blue-400" size={28} />
                                    Medical Records
                                </h2>
                            </div>

                            {/* Sub-tabs for X-Ray and ECG */}
                            <div className="flex gap-2 bg-white/5 p-1 rounded-xl border border-white/10 w-fit">
                                <button
                                    onClick={() => setMedicalRecordsSubTab('xray')}
                                    className={`px-6 py-2 rounded-lg font-medium transition ${medicalRecordsSubTab === 'xray' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                >
                                    X-Ray Analysis
                                </button>
                                <button
                                    onClick={() => setMedicalRecordsSubTab('ecg')}
                                    className={`px-6 py-2 rounded-lg font-medium transition ${medicalRecordsSubTab === 'ecg' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                >
                                    ECG Analysis
                                </button>
                            </div>

                            {/* X-RAY TAB */}
                            {medicalRecordsSubTab === 'xray' && (
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Upload Section */}
                                    <div className="lg:col-span-1 space-y-4">
                                        <div className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border border-blue-500/20 rounded-2xl p-6">
                                            <h3 className="font-bold mb-4 flex items-center gap-2 text-blue-400">
                                                <Upload size={18} /> Upload X-Ray
                                            </h3>

                                            <label className="block border-2 border-dashed border-blue-500/30 rounded-xl p-8 text-center hover:bg-blue-500/5 transition cursor-pointer">
                                                <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" accept="image/*" />
                                                <div>
                                                    {file ? <p className="text-blue-400 font-bold">{file.name}</p> : <><p className="text-gray-400 mb-2">Click to browse scan</p><p className="text-xs text-gray-600">Supports PNG, JPG, DICOM</p></>}
                                                </div>
                                            </label>

                                            <textarea
                                                placeholder="Optional: Describe symptoms (e.g., chest pain, cough)..."
                                                value={symptoms}
                                                onChange={(e) => setSymptoms(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:border-blue-500 outline-none resize-none mt-4"
                                                rows={2}
                                            />

                                            <button
                                                disabled={!file || uploading}
                                                onClick={handleUpload}
                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-4 disabled:opacity-50 transition"
                                            >
                                                {uploading ? (uploadProgress || 'Analyzing...') : 'Analyze X-Ray'}
                                            </button>

                                            {xrayPrediction && (
                                                <div className="mt-4 space-y-4">
                                                    {/* Header */}
                                                    <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl p-4 shadow-lg">
                                                        <div className="flex items-center gap-3">
                                                            <CheckCircle size={24} className="text-white" />
                                                            <div>
                                                                <h5 className="font-bold text-white text-lg">Analysis Complete</h5>
                                                                <p className="text-blue-100 text-xs">AI-Powered Diagnostic Report</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Primary Finding */}
                                                    <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/30 border-2 border-blue-500/40 rounded-xl p-5">
                                                        <p className="text-xs text-blue-300 uppercase font-bold mb-2 tracking-wide">Primary Finding</p>
                                                        <p className="text-white font-bold text-2xl">
                                                            {xrayPrediction.primary_finding || xrayPrediction.prediction}
                                                        </p>
                                                    </div>

                                                    {/* Confidence Metrics */}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                                                            <p className="text-xs text-blue-300 uppercase font-semibold mb-1">Confidence</p>
                                                            <p className="text-blue-400 font-bold text-3xl">
                                                                {parseFloat(xrayPrediction.confidence || "0").toFixed(1)}%
                                                            </p>
                                                        </div>
                                                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                                                            <p className="text-xs text-yellow-300 uppercase font-semibold mb-1">Uncertainty</p>
                                                            <p className="text-yellow-400 font-bold text-3xl">
                                                                {parseFloat(xrayPrediction.uncertainty || "0").toFixed(1)}%
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Detailed Probabilities */}
                                                    {(xrayPrediction.normal_probability !== undefined || xrayPrediction.pneumonia_probability !== undefined) && (
                                                        <div className="bg-black/30 border border-white/10 rounded-xl p-4">
                                                            <p className="text-xs text-gray-400 uppercase font-semibold mb-3">Detailed Probabilities</p>
                                                            <div className="space-y-3">
                                                                <div>
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <span className="text-sm text-gray-300 font-medium">Normal</span>
                                                                        <span className="text-green-400 font-bold">
                                                                            {parseFloat(xrayPrediction.normal_probability || "0").toFixed(1)}%
                                                                        </span>
                                                                    </div>
                                                                    <div className="w-full bg-gray-700 rounded-full h-2">
                                                                        <div
                                                                            className="bg-gradient-to-r from-green-500 to-green-400 h-2 rounded-full transition-all duration-500"
                                                                            style={{ width: `${xrayPrediction.normal_probability || 0}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <span className="text-sm text-gray-300 font-medium">Pneumonia</span>
                                                                        <span className="text-red-400 font-bold">
                                                                            {parseFloat(xrayPrediction.pneumonia_probability || "0").toFixed(1)}%
                                                                        </span>
                                                                    </div>
                                                                    <div className="w-full bg-gray-700 rounded-full h-2">
                                                                        <div
                                                                            className="bg-gradient-to-r from-red-500 to-red-400 h-2 rounded-full transition-all duration-500"
                                                                            style={{ width: `${xrayPrediction.pneumonia_probability || 0}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Medical Description */}
                                                    {xrayPrediction.description && (
                                                        <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-600/30 rounded-xl p-4">
                                                            <p className="text-xs text-slate-300 uppercase font-semibold mb-2 flex items-center gap-2">
                                                                <FileText size={14} /> Medical Description
                                                            </p>
                                                            <p className="text-sm text-gray-300 leading-relaxed">
                                                                {xrayPrediction.description}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Detailed Findings */}
                                                    {xrayPrediction.detailed_findings && xrayPrediction.detailed_findings.length > 0 && (
                                                        <div className="bg-gradient-to-br from-indigo-900/30 to-indigo-800/20 border border-indigo-500/30 rounded-xl p-4">
                                                            <p className="text-xs text-indigo-300 uppercase font-semibold mb-3 flex items-center gap-2">
                                                                <Activity size={14} /> Detailed Findings
                                                            </p>
                                                            <ul className="space-y-2">
                                                                {xrayPrediction.detailed_findings.map((finding: string, idx: number) => (
                                                                    <li key={idx} className="flex items-start gap-3 text-sm text-gray-300">
                                                                        <span className="text-indigo-400 font-bold mt-0.5">•</span>
                                                                        <span className="flex-1">{finding}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}

                                                    {/* Recommendations */}
                                                    {xrayPrediction.recommendations && xrayPrediction.recommendations.length > 0 && (
                                                        <div className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-2 border-amber-500/40 rounded-xl p-4">
                                                            <p className="text-xs text-amber-300 uppercase font-bold mb-3 flex items-center gap-2">
                                                                <AlertCircle size={14} /> Clinical Recommendations
                                                            </p>
                                                            <ul className="space-y-2">
                                                                {xrayPrediction.recommendations.map((rec: string, idx: number) => (
                                                                    <li key={idx} className="flex items-start gap-3 text-sm text-amber-100">
                                                                        <span className="text-amber-400 font-bold mt-0.5">→</span>
                                                                        <span className="flex-1 font-medium">{rec}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}

                                                    {/* Risk Assessment Grid */}
                                                    <div className="grid grid-cols-3 gap-3">
                                                        <div className={`rounded-lg p-3 border-2 ${xrayPrediction.severity === 'High' || xrayPrediction.severity === 'Moderate-High'
                                                            ? 'bg-red-900/30 border-red-500/50'
                                                            : xrayPrediction.severity === 'Moderate' || xrayPrediction.severity === 'Low-Moderate'
                                                                ? 'bg-yellow-900/30 border-yellow-500/50'
                                                                : 'bg-green-900/30 border-green-500/50'
                                                            }`}>
                                                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Severity</p>
                                                            <p className="text-sm font-bold text-white">{xrayPrediction.severity || "N/A"}</p>
                                                        </div>
                                                        <div className={`rounded-lg p-3 border-2 ${xrayPrediction.risk_level === 'Critical' || xrayPrediction.risk_level === 'High'
                                                            ? 'bg-red-900/30 border-red-500/50'
                                                            : xrayPrediction.risk_level === 'Moderate'
                                                                ? 'bg-yellow-900/30 border-yellow-500/50'
                                                                : 'bg-green-900/30 border-green-500/50'
                                                            }`}>
                                                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Risk Level</p>
                                                            <p className="text-sm font-bold text-white">{xrayPrediction.risk_level || "N/A"}</p>
                                                        </div>
                                                        <div className={`rounded-lg p-3 border-2 ${xrayPrediction.urgency === 'Urgent' || xrayPrediction.urgency === 'Emergency'
                                                            ? 'bg-red-900/30 border-red-500/50'
                                                            : 'bg-blue-900/30 border-blue-500/50'
                                                            }`}>
                                                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Urgency</p>
                                                            <p className="text-sm font-bold text-white">{xrayPrediction.urgency || "Routine"}</p>
                                                        </div>
                                                    </div>

                                                    {/* Disclaimer */}
                                                    <div className="bg-slate-800/50 border border-slate-600/30 rounded-lg p-3">
                                                        <p className="text-xs text-gray-400 leading-relaxed">
                                                            <span className="font-bold text-gray-300">⚠️ Medical Disclaimer:</span> This AI analysis is for screening purposes only and should not replace professional medical diagnosis. Please consult with a qualified healthcare provider for proper evaluation and treatment.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* History Section */}
                                    <div className="lg:col-span-2">
                                        <h3 className="font-bold mb-4 flex items-center gap-2"><FileText size={18} className="text-emerald-400" /> X-Ray History</h3>

                                        {xrayRecords.length === 0 ? (
                                            <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
                                                <FileText size={48} className="mx-auto text-gray-600 mb-4" />
                                                <p className="text-gray-400">No X-ray records yet.</p>
                                                <p className="text-sm text-gray-500 mt-2">Upload an X-ray scan to get started.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {xrayRecords.map(record => (
                                                    <div key={record.id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden transition hover:bg-white/10">
                                                        <div
                                                            className="p-4 flex items-center justify-between cursor-pointer"
                                                            onClick={() => setExpandedRecordId(expandedRecordId === record.id ? null : record.id)}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className="h-12 w-12 bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
                                                                    {(record.fileUrl || record.imagePreview) ? (
                                                                        <ImageViewer
                                                                            imageUrl={record.fileUrl}
                                                                            imagePreview={record.imagePreview}
                                                                            fileName={record.fileName}
                                                                            alt="Scan"
                                                                            className="h-full w-full"
                                                                            showControls={false}
                                                                        />
                                                                    ) : (
                                                                        <FileText size={24} className="text-gray-400" />
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <p className="font-bold text-white">{record.fileName}</p>
                                                                    <p className="text-xs text-gray-400">
                                                                        {new Date(record.uploadedAt).toLocaleDateString()}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${record.status === 'REVIEWED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                                                    {record.status === 'REVIEWED' ? 'Reviewed' : 'Pending'}
                                                                </span>
                                                                <button
                                                                    onClick={(e) => handleDelete(record.id, e)}
                                                                    className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-500 rounded-full transition"
                                                                    title="Delete Record"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {expandedRecordId === record.id && (
                                                            <div className="px-4 pb-4 pt-0 border-t border-white/5 bg-black/20">
                                                                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                    {(record.fileUrl || record.imagePreview) && (
                                                                        <div className="relative aspect-square">
                                                                            <ImageViewer
                                                                                imageUrl={record.fileUrl}
                                                                                imagePreview={record.imagePreview}
                                                                                fileName={record.fileName || 'X-Ray'}
                                                                                alt="X-Ray"
                                                                                className="h-full w-full"
                                                                                showControls={true}
                                                                            />
                                                                            {record.heatmapUrl && (
                                                                                <div className="absolute inset-0 pointer-events-none">
                                                                                    <img src={record.heatmapUrl} className="w-full h-full object-contain mix-blend-screen opacity-60" alt="Heatmap" />
                                                                                </div>
                                                                            )}
                                                                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-center text-white py-1 pointer-events-none">Red areas = ROI</div>
                                                                        </div>
                                                                    )}
                                                                    <div>
                                                                        <p className="text-lg font-bold text-white capitalize">{record.aiPrediction || "Pending"}</p>
                                                                        <div className="flex flex-col gap-2 my-2">
                                                                            <p className="text-sm text-gray-400">Confidence: <span className="text-blue-400">{parseFloat(record.aiConfidence || "0").toFixed(1)}%</span></p>
                                                                            {record.aiSeverity && (
                                                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                                                    <div className="bg-white/10 p-2 rounded">
                                                                                        <span className="text-gray-500 block uppercase text-[8px]">Severity</span>
                                                                                        <span className="text-white font-bold">{record.aiSeverity}</span>
                                                                                    </div>
                                                                                    <div className="bg-white/10 p-2 rounded">
                                                                                        <span className="text-gray-500 block uppercase text-[8px]">Risk Est.</span>
                                                                                        <span className="text-yellow-400 font-bold">{record.aiRiskLevel}</span>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        {record.status === 'REVIEWED' && record.doctorNote && (
                                                                            <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg">
                                                                                <p className="text-xs font-bold text-emerald-400 mb-1">Doctor's Note:</p>
                                                                                <p className="text-sm text-gray-200 italic mb-2">"{record.doctorNote}"</p>

                                                                                <div className="pt-2 border-t border-emerald-500/20 text-[10px] space-y-0.5">
                                                                                    {record.doctorName && <p className="font-bold text-emerald-300 opacity-90">{record.doctorName}</p>}
                                                                                    {record.hospitalName && <p className="text-emerald-400/70">{record.hospitalName}</p>}
                                                                                    {record.doctorAddress && <p className="text-emerald-400/50">{record.doctorAddress}</p>}
                                                                                    <p className="text-[9px] text-right text-emerald-500/40 mt-1 uppercase tracking-wider">
                                                                                        Reviewed: {new Date(record.reviewedAt || new Date()).toLocaleString()}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ECG TAB */}
                            {medicalRecordsSubTab === 'ecg' && (
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Upload Section */}
                                    <div className="lg:col-span-1 space-y-4">
                                        <div className="bg-gradient-to-br from-red-900/20 to-red-800/10 border border-red-500/20 rounded-2xl p-6">
                                            <h3 className="font-bold mb-4 flex items-center gap-2 text-red-400">
                                                <Heart size={18} /> Upload ECG
                                            </h3>

                                            <label className="block border-2 border-dashed border-red-500/30 rounded-xl p-8 text-center hover:bg-red-500/5 transition cursor-pointer">
                                                <input
                                                    type="file"
                                                    onChange={(e) => setEcgFile(e.target.files?.[0] || null)}
                                                    className="hidden"
                                                    accept="image/*,.csv,text/csv"
                                                />
                                                <div>
                                                    {ecgFile ? (
                                                        <p className="text-red-400 font-bold">{ecgFile.name}</p>
                                                    ) : (
                                                        <>
                                                            <p className="text-gray-400 mb-2">Click to browse ECG</p>
                                                            <p className="text-xs text-gray-600">Supports JPG, PNG, CSV</p>
                                                        </>
                                                    )}
                                                </div>
                                            </label>

                                            <button
                                                disabled={!ecgFile || ecgUploading}
                                                onClick={handleEcgUpload}
                                                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg mt-4 disabled:opacity-50 transition"
                                            >
                                                {ecgUploading ? 'Analyzing...' : 'Analyze ECG'}
                                            </button>

                                            {ecgPrediction && (
                                                <div className="mt-4 space-y-4">
                                                    {/* Header */}
                                                    <div className="bg-gradient-to-r from-red-600 to-red-500 rounded-xl p-4 shadow-lg">
                                                        <div className="flex items-center gap-3">
                                                            <Activity size={24} className="text-white" />
                                                            <div>
                                                                <h5 className="font-bold text-white text-lg">ECG Analysis Complete</h5>
                                                                <p className="text-red-100 text-xs">AI-Powered Rhythm Analysis</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Primary Finding */}
                                                    <div className="bg-gradient-to-br from-red-900/40 to-red-800/30 border-2 border-red-500/40 rounded-xl p-5">
                                                        <p className="text-xs text-red-300 uppercase font-bold mb-2 tracking-wide">Detected Rhythm</p>
                                                        <p className="text-white font-bold text-2xl">
                                                            {ecgPrediction.prediction || ecgPrediction.ECG_Prediction_Label}
                                                        </p>
                                                        {ecgPrediction.report?.description && (
                                                            <p className="text-red-200 text-sm mt-2 leading-relaxed">{ecgPrediction.report.description}</p>
                                                        )}
                                                    </div>

                                                    {/* Confidence & Risk */}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                                                            <p className="text-xs text-red-300 uppercase font-semibold mb-1">Confidence</p>
                                                            <p className="text-red-400 font-bold text-2xl">
                                                                {ecgPrediction.confidence ? ecgPrediction.confidence + '%' : 'N/A'}
                                                            </p>
                                                        </div>
                                                        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                                                            <p className="text-xs text-orange-300 uppercase font-semibold mb-1">Risk Level</p>
                                                            <p className="text-orange-400 font-bold text-2xl">
                                                                {ecgPrediction.report?.risk_level || "Unknown"}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Heatmap Visualization */}
                                                    {ecgPrediction.heatmap_url && (
                                                        <div className="bg-black/40 border border-white/10 rounded-xl p-1 overflow-hidden">
                                                            <p className="text-xs text-gray-400 uppercase font-semibold p-3 pl-4">Grad-CAM Activation Map</p>
                                                            <img
                                                                src={ecgPrediction.heatmap_url}
                                                                alt="ECG Heatmap"
                                                                className="w-full rounded-lg"
                                                            />
                                                        </div>
                                                    )}

                                                    {/* Recommendation */}
                                                    {ecgPrediction.report?.recommendation && (
                                                        <div className="bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded-r-lg">
                                                            <h4 className="flex items-center gap-2 text-blue-400 font-bold mb-1">
                                                                <FileText size={16} /> Recommendation
                                                            </h4>
                                                            <p className="text-gray-300 text-sm">{ecgPrediction.report.recommendation}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* History Section */}
                                    <div className="lg:col-span-2">
                                        <h3 className="font-bold mb-4 flex items-center gap-2"><Heart size={18} className="text-red-400" /> ECG History</h3>

                                        {ecgRecords.length === 0 ? (
                                            <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
                                                <Heart size={48} className="mx-auto text-gray-600 mb-4" />
                                                <p className="text-gray-400">No ECG records yet.</p>
                                                <p className="text-sm text-gray-500 mt-2">Upload an ECG report to get started.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {ecgRecords.map(record => (
                                                    <div key={record.id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden transition hover:bg-white/10">
                                                        <div
                                                            className="p-4 flex items-center justify-between cursor-pointer"
                                                            onClick={() => setExpandedRecordId(expandedRecordId === record.id ? null : record.id)}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className="h-12 w-12 bg-black rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
                                                                    <Heart size={24} className="text-red-400" />
                                                                </div>
                                                                <div>
                                                                    <p className="font-bold text-white">{record.fileName}</p>
                                                                    <p className="text-xs text-gray-400">
                                                                        {new Date(record.uploadedAt).toLocaleDateString()}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${record.status === 'REVIEWED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                                                    {record.status === 'REVIEWED' ? 'Reviewed' : 'Pending'}
                                                                </span>
                                                                <button
                                                                    onClick={(e) => handleDelete(record.id, e)}
                                                                    className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-500 rounded-full transition"
                                                                    title="Delete Record"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {expandedRecordId === record.id && (
                                                            <div className="px-4 pb-4 pt-0 border-t border-white/5 bg-black/20">
                                                                <div className="mt-4">
                                                                    <p className="text-lg font-bold text-white mb-2">
                                                                        {record.ecgPredictionLabel || `Class ${record.ecgPrediction}`}
                                                                    </p>
                                                                    <div className="flex flex-col gap-2 my-2">
                                                                        {record.ecgConfidence !== undefined && (
                                                                            <p className="text-sm text-gray-400">
                                                                                Confidence: <span className="text-blue-400">{(parseFloat(record.ecgConfidence) * 100).toFixed(2)}%</span>
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    {record.status === 'REVIEWED' && record.doctorNote && (
                                                                        <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg">
                                                                            <p className="text-xs font-bold text-emerald-400 mb-1">Doctor's Note:</p>
                                                                            <p className="text-sm text-gray-200 italic">"{record.doctorNote}"</p>
                                                                            <p className="text-xs text-gray-500 mt-2">
                                                                                By: {record.doctorName || "Dr. Staff"} • {new Date(record.reviewedAt || new Date()).toLocaleString()}
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB: HEALTH TRACKER */}
                    {activeTab === 'tracking' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl">
                            <div className="bg-black/20 border border-white/10 rounded-2xl p-6">
                                <h3 className="font-bold flex items-center gap-2 mb-4"><Activity className="text-pink-400" /> Vitals Entry</h3>
                                <div className="space-y-4">
                                    <input type="text" placeholder="Blood Pressure (e.g. 120/80)" value={vitals.bp} onChange={(e) => setVitals({ ...vitals, bp: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:border-pink-500 outline-none" />
                                    <input type="text" placeholder="Heart Rate (bpm)" value={vitals.heartRate} onChange={(e) => setVitals({ ...vitals, heartRate: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:border-pink-500 outline-none" />
                                    <div className="flex gap-4">
                                        <input type="text" placeholder="Weight (kg)" value={vitals.weight} onChange={(e) => setVitals({ ...vitals, weight: e.target.value })} className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:border-pink-500 outline-none" />
                                        <input type="text" placeholder="Temp (°F)" value={vitals.temp} onChange={(e) => setVitals({ ...vitals, temp: e.target.value })} className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:border-pink-500 outline-none" />
                                    </div>
                                    <button onClick={handleSaveVitals} className="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 rounded-lg transition">Log Vitals</button>
                                </div>
                            </div>

                            <div className="bg-black/20 border border-white/10 rounded-2xl p-6">
                                <h3 className="font-bold flex items-center gap-2 mb-4"><Clipboard className="text-orange-400" /> Symptom Journal</h3>
                                <textarea
                                    placeholder="Describe your symptoms (e.g. headache, fever since yesterday)..."
                                    value={symptoms}
                                    onChange={(e) => setSymptoms(e.target.value)}
                                    className="w-full h-32 bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:border-orange-500 outline-none resize-none"
                                />
                                <button onClick={handleSaveSymptoms} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg mt-4 transition">Save Entry</button>
                            </div>
                        </div>
                    )}

                    {/* TAB: CONSULTATIONS */}
                    {activeTab === 'consultations' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl">
                            <div className="bg-black/20 border border-white/10 rounded-2xl p-6 h-fit">
                                <h3 className="font-bold mb-4 flex items-center gap-2"><Clock className="text-purple-400" /> Book Appointment</h3>
                                <div className="space-y-4">
                                    <input type="text" value={apptReason} onChange={(e) => setApptReason(e.target.value)} placeholder="Reason for Visit" className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:border-purple-500 outline-none" />
                                    <input
                                        type="date"
                                        value={apptDate}
                                        onChange={(e) => setApptDate(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-purple-500 outline-none [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                                    />
                                    <button onClick={handleBookAppointment} disabled={!apptReason || !apptDate} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg transition disabled:opacity-50">Request</button>
                                </div>
                            </div>

                            <div className="bg-black/20 border border-white/10 rounded-2xl p-6 h-fit col-span-1 md:col-span-2 lg:col-span-1">
                                <div className="flex flex-col gap-6">
                                    {/* Upcoming Section */}
                                    <div>
                                        <h3 className="font-bold mb-3 text-white flex items-center gap-2">
                                            <Calendar size={18} className="text-blue-400" /> Upcoming & Requests
                                        </h3>
                                        <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                                            {/* Pending Requests */}
                                            {appointments.filter(a => a.status === 'PENDING').map(appt => (
                                                <div key={appt.id} className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg transition hover:bg-yellow-500/20">
                                                    <div className="flex justify-between items-start">
                                                        <p className="text-sm font-bold text-white">{appt.date}</p>
                                                        <span className="text-[10px] px-2 py-1 rounded font-bold bg-yellow-500/20 text-yellow-400">PENDING APPROVAL</span>
                                                    </div>
                                                    <p className="text-xs text-gray-300 mt-1 italic">Reason: {appt.reason}</p>
                                                    <p className="text-[10px] text-gray-500 mt-2">Request sent. Waiting for doctor confirmation.</p>
                                                </div>
                                            ))}

                                            {/* Scheduled Appointments */}
                                            {appointments.filter(a => a.status === 'SCHEDULED').map(appt => (
                                                <div key={appt.id} className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-lg transition hover:bg-emerald-500/20">
                                                    <div className="flex justify-between items-start">
                                                        <p className="text-sm font-bold text-white">{appt.date}</p>
                                                        <span className="text-[10px] px-2 py-1 rounded font-bold bg-emerald-500/20 text-emerald-400">CONFIRMED</span>
                                                    </div>
                                                    <p className="text-xs text-gray-300 mt-1">Reason: {appt.reason}</p>
                                                    <div className="mt-3">
                                                        <p className="text-xs text-emerald-400 font-bold flex items-center gap-1 mb-2"><CheckCircle size={10} /> Time: {appt.scheduledTime}</p>

                                                        {/* Doctor & Location Info */}
                                                        {(appt.doctorName || appt.hospitalName) && (
                                                            <div className="mb-3 p-2 bg-black/20 rounded border border-white/5 text-[11px] space-y-0.5">
                                                                {appt.doctorName && <p className="font-bold text-white">{appt.doctorName}</p>}
                                                                {appt.hospitalName && <p className="text-gray-400">{appt.hospitalName}</p>}
                                                                {appt.doctorAddress && <p className="text-gray-500 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-gray-500"></span> {appt.doctorAddress}</p>}
                                                            </div>
                                                        )}

                                                        {(() => {
                                                            const link = appt.meetingLink || `https://meet.jit.si/MediXpert-${appt.id}`;
                                                            return (
                                                                <button
                                                                    onClick={() => setActiveMeeting(appt.meetingLink || `https://meet.jit.si/MediXpert-${appt.id}`)}
                                                                    className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-2 transition shadow-lg shadow-blue-500/20"
                                                                >
                                                                    <Activity size={12} /> Join Video Call
                                                                </button>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            ))}

                                            {appointments.filter(a => ['SCHEDULED', 'PENDING'].includes(a.status)).length === 0 && (
                                                <div className="text-center py-8 text-gray-500">
                                                    <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                                                    <p className="text-sm italic">No upcoming appointments or requests.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* History Section */}
                                    <div>
                                        <h3 className="font-bold mb-3 text-white flex items-center gap-2 pt-4 border-t border-white/10">
                                            <Clock size={18} className="text-gray-400" /> Consultation History
                                        </h3>
                                        <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                                            {appointments.filter(a => ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(a.status)).length === 0 && <p className="text-gray-500 italic text-sm">No past records.</p>}
                                            {appointments.filter(a => ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(a.status)).map(appt => (
                                                <div key={appt.id} className="bg-white/5 p-3 rounded-lg border border-white/5 opacity-75 hover:opacity-100 transition">
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-xs font-bold text-gray-300">{appt.date}</p>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${appt.status === 'COMPLETED' ? 'bg-blue-500/10 text-blue-400' :
                                                            appt.status === 'REJECTED' ? 'bg-red-500/10 text-red-400' : 'bg-gray-500/10 text-gray-400'
                                                            }`}>{appt.status}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-1 truncate">{appt.reason}</p>
                                                    {(appt.doctorName || appt.hospitalName) && (
                                                        <div className="mt-2 text-[10px] text-gray-500 border-t border-white/5 pt-1">
                                                            {appt.doctorName && <span className="block font-medium text-gray-400">{appt.doctorName}</span>}
                                                            {appt.hospitalName && <span>{appt.hospitalName} • </span>}
                                                            {appt.doctorAddress && <span>{appt.doctorAddress}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB: MY FILES */}
                    {activeTab === 'files' && (
                        <div className="space-y-6 max-w-6xl">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <Folder className="text-blue-400" size={28} />
                                Digital Storage
                            </h2>
                            <p className="text-gray-400 text-sm">Securely store and manage your medical reports, prescriptions, and health documents.</p>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Upload Section */}
                                <div className="lg:col-span-1 space-y-4">
                                    <div className="bg-gradient-to-br from-blue-900/10 to-blue-800/5 border border-white/10 rounded-2xl p-6 sticky top-6">
                                        <h3 className="font-bold mb-4 flex items-center gap-2 text-blue-400">
                                            <Upload size={18} /> Upload New File
                                        </h3>

                                        <div className="space-y-4">
                                            <label className="block border-2 border-dashed border-blue-500/30 rounded-xl p-6 text-center hover:bg-blue-500/5 transition cursor-pointer bg-black/20">
                                                <input
                                                    type="file"
                                                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                                    className="hidden"
                                                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                                />
                                                <div>
                                                    {selectedFile ? (
                                                        <div className="flex items-center justify-center gap-2 text-blue-400">
                                                            <FileText size={20} />
                                                            <p className="font-bold text-sm truncate max-w-[200px]">{selectedFile.name}</p>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <Upload size={24} className="mx-auto text-gray-500 mb-2" />
                                                            <p className="text-gray-400 text-sm font-medium">Click to browse</p>
                                                            <p className="text-xs text-gray-600 mt-1">PDF, JPG, PNG (Max 10MB)</p>
                                                        </>
                                                    )}
                                                </div>
                                            </label>

                                            <div>
                                                <label className="text-xs text-gray-400 mb-1 block">Category</label>
                                                <select
                                                    value={fileCategory}
                                                    onChange={(e) => setFileCategory(e.target.value)}
                                                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-blue-500 outline-none"
                                                >
                                                    <option value="medical">Medical Report</option>
                                                    <option value="prescription">Prescription</option>
                                                    <option value="lab_result">Lab Result</option>
                                                    <option value="insurance">Insurance Document</option>
                                                    <option value="other">Other</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="text-xs text-gray-400 mb-1 block">Description (Optional)</label>
                                                <input
                                                    type="text"
                                                    value={fileDescription}
                                                    onChange={(e) => setFileDescription(e.target.value)}
                                                    placeholder="e.g., Blood test from City Hospital"
                                                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-blue-500 outline-none"
                                                />
                                            </div>

                                            <button
                                                onClick={handleFileUpload}
                                                disabled={!selectedFile || uploadingFile}
                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                {uploadingFile ? (
                                                    <>
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        Uploading...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload size={18} /> Upload to Secure Storage
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* File List Section */}
                                <div className="lg:col-span-2">
                                    <div className="bg-black/20 border border-white/10 rounded-2xl overflow-hidden min-h-[400px]">
                                        <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                                            <h3 className="font-bold text-gray-200">Your Files ({storedFiles.length})</h3>

                                        </div>

                                        {storedFiles.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-64 text-gray-500 p-8 text-center">
                                                <Folder size={48} className="mb-4 opacity-30" />
                                                <p className="text-lg font-medium">No files stored yet</p>
                                                <p className="text-sm mt-1">Upload your medical documents to keep them safe and accessible.</p>
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-white/5">
                                                {storedFiles.map((file) => (
                                                    <div key={file.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition group">
                                                        <div className="flex items-center gap-4 min-w-0">
                                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${file.fileType?.includes('pdf') ? 'bg-red-500/20 text-red-400' :
                                                                file.fileType?.includes('image') ? 'bg-purple-500/20 text-purple-400' :
                                                                    'bg-blue-500/20 text-blue-400'
                                                                }`}>
                                                                <FileText size={20} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-bold text-gray-200 truncate pr-4">{file.description || file.fileName}</p>
                                                                <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                                                                    <span className="capitalize bg-white/10 px-1.5 py-0.5 rounded">{file.category.replace('_', ' ')}</span>
                                                                    <span>•</span>
                                                                    <span>{(file.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                                                                    <span>•</span>
                                                                    <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => handleFileDownload(file.downloadURL, file.fileName)}
                                                                className="p-2 bg-blue-500/10 hover:bg-blue-500/30 text-blue-400 rounded-lg transition tooltip"
                                                                title="Download"
                                                            >
                                                                <Download size={18} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleFileDelete(file.id, file.storagePath)}
                                                                className="p-2 bg-red-500/10 hover:bg-red-500/30 text-red-400 rounded-lg transition"
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </main>

            {/* Video Call Overlay */}
            {activeMeeting && (
                <div className="fixed inset-0 z-50 bg-black flex flex-col animate-fade-in">
                    <div className="bg-[#1a1a1a] p-4 flex justify-between items-center border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <Activity className="text-red-500 animate-pulse" />
                            <h2 className="text-white font-bold">Telemedicine Consultation</h2>
                        </div>
                        <button
                            onClick={() => setActiveMeeting(null)}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition"
                        >
                            <X size={18} /> End Call
                        </button>
                    </div>
                    <iframe
                        src={activeMeeting}
                        className="flex-1 w-full border-none"
                        allow="camera; microphone; fullscreen; display-capture; autoplay"
                    ></iframe>
                </div>
            )}
        </div>
    );
}
