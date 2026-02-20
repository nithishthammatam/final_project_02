"use client";
import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import ImageViewer from '@/components/ImageViewer';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, limit, orderBy, getDoc } from 'firebase/firestore';
import { Activity, Brain, CheckCircle, FileText, User, Calendar, Clock, Search, X as XIcon } from 'lucide-react';
import { getApiUrl } from '@/lib/config';

export default function DoctorDashboard() {
  const [records, setRecords] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [userMap, setUserMap] = useState<Record<string, any>>({}); // Map: uid -> userData
  const [viewMode, setViewMode] = useState<'queue' | 'appointments'>('queue');
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [error, setError] = useState<string>("");

  const [prediction, setPrediction] = useState<string>("");
  const [confidence, setConfidence] = useState<string>("");
  const [heatmap, setHeatmap] = useState<string>("");

  const [doctorNote, setDoctorNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiMetrics, setAiMetrics] = useState<any>({});

  // Schedule & Booking State
  const [schedule, setSchedule] = useState({ start: '09:00', startPeriod: 'AM', end: '05:00', endPeriod: 'PM' });
  const [bookingTimes, setBookingTimes] = useState<Record<string, { time: string, period: string }>>({});

  // Context State
  const [patientVitals, setPatientVitals] = useState<any>(null);
  const [patientSymptoms, setPatientSymptoms] = useState<any>(null);
  const [patientProfile, setPatientProfile] = useState<any>(null);
  const [patientHistory, setPatientHistory] = useState<any[]>([]);
  const [agreeWithAI, setAgreeWithAI] = useState<boolean | null>(null);
  const [searchDocId, setSearchDocId] = useState("");
  const [searchError, setSearchError] = useState("");
  const [doctorProfile, setDoctorProfile] = useState<any>(null);
  const [activeMeeting, setActiveMeeting] = useState<string | null>(null);

  // Fetch Doctor Profile
  useEffect(() => {
    const fetchDoctorProfile = async () => {
      if (auth.currentUser) {
        const docRef = doc(db, "users", auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setDoctorProfile(docSnap.data());
        }
      }
    };
    fetchDoctorProfile();
  }, []);
  useEffect(() => {
    if (!selectedRecord) {
      setPatientVitals(null);
      setPatientSymptoms(null);
      setPatientProfile(null);
      setPatientHistory([]);
      setAgreeWithAI(null);
      setPrediction("");
      setConfidence("");
      setHeatmap("");
      setAiMetrics({});
      return;
    }

    // Auto-display ECG analysis results if available
    if (selectedRecord.type === 'ECG' && selectedRecord.ecgPredictionLabel) {
      setPrediction(selectedRecord.ecgPredictionLabel);
      setConfidence(selectedRecord.ecgConfidence ? String(selectedRecord.ecgConfidence) : "0");
      setAiMetrics({
        severity: selectedRecord.ecgPredictionLabel === "Normal" ? "Normal" : "Requires Review",
        uncertainty: selectedRecord.ecgConfidence ? (100 - parseFloat(String(selectedRecord.ecgConfidence))).toFixed(1) : "N/A",
        riskLevel: selectedRecord.ecgPredictionLabel === "Normal" ? "Low" : "Moderate",
        symptomRisk: "Cardiac"
      });
    } else if (selectedRecord.type !== 'ECG') {
      // Clear ECG results when switching to X-ray
      setPrediction("");
      setConfidence("");
      setHeatmap("");
      setAiMetrics({});
    }

    const fetchPatientContext = async () => {
      try {
        const pid = selectedRecord.patientId;
        if (!pid) return;

        // Vitals
        const vQ = query(collection(db, "vitals"), where("patientId", "==", pid), orderBy("recordedAt", "desc"), limit(1));
        const vSnap = await getDocs(vQ);
        if (!vSnap.empty) setPatientVitals(vSnap.docs[0].data());

        // Symptoms
        const sQ = query(collection(db, "symptoms"), where("patientId", "==", pid), orderBy("recordedAt", "desc"), limit(1));
        const sSnap = await getDocs(sQ);
        if (!sSnap.empty) setPatientSymptoms(sSnap.docs[0].data());

        // Profile (Name/Mobile)
        const uDoc = await getDocs(query(collection(db, "users"), where("uid", "==", pid)));
        if (!uDoc.empty) setPatientProfile(uDoc.docs[0].data());

        // History
        const hQ = query(collection(db, "medical_records"), where("patientId", "==", pid), orderBy("uploadedAt", "desc"), limit(5));
        const hSnap = await getDocs(hQ);
        setPatientHistory(hSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      } catch (e) {
        console.error("Error fetching patient context:", e);
      }
    };
    fetchPatientContext();
  }, [selectedRecord]);

  // 1. Fetch Patient Records (Real-time)
  useEffect(() => {
    const q = query(
      collection(db, "medical_records"),
      // You could filter by status: where("status", "==", "PROCESSING")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log("Doctor Dashboard Fetched Records:", docs); // DEBUG LOG

      // Safe Sort
      try {
        docs.sort((a: any, b: any) => {
          const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
          const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
          return dateB - dateA;
        });
      } catch (err) {
        console.error("Sorting error:", err);
      }


      // VISIBILITY RULE:
      // - Unassigned (Pending Review) -> Visible to ALL
      // - Assigned (Reviewed) -> Visible ONLY to assigned doctor
      const uid = auth.currentUser?.uid;
      let filteredDocs = docs;
      if (uid) {
        filteredDocs = docs.filter((doc: any) => !doc.doctorId || doc.doctorId === uid);
      }

      setRecords(filteredDocs);
      setError(""); // Clear error on success
    }, (error) => {
      console.error("Firestore Listener Error:", error);
      setError(error.message);
    });

    return () => unsubscribe();
    return () => unsubscribe();
  }, []);

  // 1.5 Fetch User Profiles for Name Lookup (Fix for "Not showing names")
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const map: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        map[doc.id] = doc.data();
      });
      setUserMap(map);
    });
    return () => unsubscribe();
  }, []);

  // 2. Run AI Analysis on SELECTED Record
  async function runAIAnalysis() {
    if (!selectedRecord) return;

    // ECG records are already analyzed at upload time, so we just display existing results
    if (selectedRecord.type === 'ECG') {
      if (selectedRecord.ecgPredictionLabel) {
        setPrediction(selectedRecord.ecgPredictionLabel);
        setConfidence(selectedRecord.ecgConfidence ? String(selectedRecord.ecgConfidence) : "N/A");
        setAiMetrics({
          severity: "Requires Review",
          uncertainty: selectedRecord.ecgConfidence ? (100 - parseFloat(String(selectedRecord.ecgConfidence))).toFixed(1) : "N/A",
          riskLevel: selectedRecord.ecgPredictionLabel === "Normal" ? "Low" : "Moderate",
          symptomRisk: "Cardiac"
        });
      }
      return;
    }

    setLoading(true);

    try {
      let file: File;

      console.log("Selected Record:", selectedRecord); // Debug log

      // Handle both imagePreview (base64) and fileUrl
      if (selectedRecord.imagePreview) {
        // Convert base64 string to blob
        try {
          const base64Data = selectedRecord.imagePreview.split(',')[1] || selectedRecord.imagePreview;
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'image/jpeg' });
          file = new File([blob], selectedRecord.fileName || 'xray.jpg', { type: 'image/jpeg' });
        } catch (e) {
          console.error("Error processing base64 image:", e);
          throw new Error("Invalid image preview data");
        }
      } else if (selectedRecord.fileUrl) {
        // Try to fetch from URL
        let imageUrl = selectedRecord.fileUrl;

        // If fileUrl is relative, construct full URL
        if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:')) {
          const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
          imageUrl = imageUrl.startsWith('/') ? `${baseUrl}${imageUrl}` : `${baseUrl}/${imageUrl}`;
        }

        try {
          const response = await fetch(imageUrl, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache'
          });

          if (!response.ok) {
            console.error(`Failed to fetch image from ${imageUrl}: ${response.status} ${response.statusText}`);
            // Try alternative: check if it's a Firebase Storage URL or construct from fileName
            if (selectedRecord.fileName) {
              throw new Error(`Image not accessible. Please ensure the file exists at: ${imageUrl}`);
            } else {
              throw new Error(`Image not accessible (Status: ${response.status})`);
            }
          }

          const blob = await response.blob();
          if (!blob || blob.size === 0) {
            throw new Error("Received empty image file");
          }
          file = new File([blob], selectedRecord.fileName || 'xray.jpg', { type: blob.type || 'image/jpeg' });
        } catch (fetchError: any) {
          console.error("Error fetching image:", fetchError);
          throw new Error(`Cannot load image: ${fetchError.message || 'Network error'}`);
        }
      } else {
        // No image data at all
        console.error("Record has no image data:", {
          hasImagePreview: !!selectedRecord.imagePreview,
          hasFileUrl: !!selectedRecord.fileUrl,
          fileName: selectedRecord.fileName,
          recordId: selectedRecord.id
        });
        throw new Error("No image data available in this record. The image may have been deleted or the record is incomplete.");
      }

      const formData = new FormData();
      formData.append("file", file);
      if (patientSymptoms?.details) formData.append("symptoms", patientSymptoms.details);

      // Call Backend
      const aiResponse = await fetch(getApiUrl('/predict'), {
        method: "POST",
        body: formData,
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || `Backend error: ${aiResponse.status} ${aiResponse.statusText}`);
      }

      const result = await aiResponse.json();

      setPrediction(result.prediction);
      setConfidence(String(result.confidence));
      setAiMetrics({
        severity: result.severity,
        uncertainty: result.uncertainty,
        riskLevel: result.risk_level,
        symptomRisk: result.symptom_risk
      });
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      setHeatmap(baseUrl + "/" + result.heatmap_path);

    } catch (error: any) {
      console.error("AI Analysis Error:", error);
      const errorMessage = error.message || "Unknown error occurred";
      alert(`AI Analysis Failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }

  // 3. Submit Final Doctor Review
  async function submitReview() {
    if (!selectedRecord) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "medical_records", selectedRecord.id), {
        status: "REVIEWED",
        doctorNote: doctorNote,
        aiPrediction: prediction,
        aiConfidence: confidence,
        aiSeverity: aiMetrics.severity || null,
        aiUncertainty: aiMetrics.uncertainty || null,
        aiRiskLevel: aiMetrics.riskLevel || null,
        symptomRisk: aiMetrics.symptomRisk || null,
        reviewedAt: new Date().toISOString(),
        agreeWithAI: agreeWithAI,
        doctorId: auth.currentUser?.uid,
        doctorName: doctorProfile?.fullName || userMap[auth.currentUser?.uid || '']?.fullName || "Doctor",
        hospitalName: doctorProfile?.hospitalName || "MediXpert Clinic",
        doctorAddress: doctorProfile?.address || "Online"
      });
      alert("Report Sent to Patient!");
      setSelectedRecord(null); // Clear selection
      setPrediction("");
      setDoctorNote("");
      setAgreeWithAI(null);
    } catch (e) {
      console.error(e);
      alert("Failed to save review");
    } finally {
      setSaving(false);
    }
  }

  // 4. Appointment Logic
  useEffect(() => {
    const q = query(collection(db, "appointments"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // VISIBILITY RULE: 
      // - Pending appointments are visible to EVERYONE (Pool).
      // - Scheduled appointments are visible ONLY to the Assigned Doctor.
      const currentUid = auth.currentUser?.uid;
      if (currentUid) {
        docs = docs.filter((d: any) =>
          d.status === 'PENDING' || (d.status === 'SCHEDULED' && d.doctorId === currentUid)
        );
      }

      // Sort: Pending first
      docs.sort((a: any, b: any) => (a.status === 'PENDING' ? -1 : 1));
      setAppointments(docs);
    });
    return () => unsubscribe();
  }, []);

  const confirmAppointment = async (apptId: string, customTime?: string) => {
    let time = customTime;
    if (!time) {
      time = prompt("Enter Scheduled Time (e.g. 10:00 AM):") || "";
    }
    if (!time) return;

    try {
      await updateDoc(doc(db, "appointments", apptId), {
        status: "SCHEDULED",
        scheduledTime: time,
        doctorId: auth.currentUser?.uid || "DR_DEFAULT"
      });
      alert("Appointment Scheduled!");
    } catch (e) {
      console.error(e);
      alert("Error scheduling");
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Navbar />

      <main className="w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left: Dashboard Sidebar (Queue & Appointments) */}
        <section className="lg:col-span-1 bg-white/5 border border-white/10 rounded-2xl p-6 h-[85vh] overflow-y-auto">

          {/* Header & Tabs */}
          <div className="mb-4 sticky top-0 bg-[#050505]/80 backdrop-blur-md py-2 z-10 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">
                {viewMode === 'queue' ? <User className="text-blue-400" /> : <Clock className="text-purple-400" />}
                {viewMode === 'queue' ? 'Patient Queue' : 'Appointments'}
              </h2>
              <button
                onClick={() => window.location.reload()}
                className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded text-gray-300 transition"
              >
                Refresh
              </button>
            </div>

            {error && (
              <div className="bg-red-500/20 text-red-500 p-4 mb-4 rounded-lg">
                <p className="font-bold">Error Loading Records</p>
                <p className="text-xs">{error}</p>
                <p className="text-xs mt-2">Please check your Firestore Security Rules if this persists.</p>
              </div>
            )}

            {/* Toggle Switch */}
            <div className="flex bg-black/40 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('queue')}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition ${viewMode === 'queue' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Records ({records.length})
              </button>
              <button
                onClick={() => setViewMode('appointments')}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition ${viewMode === 'appointments' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Bookings ({appointments.filter(a => a.status === 'PENDING').length})
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">

            {/* View: Patient Queue */}
            {viewMode === 'queue' && (
              <>
                {/* Search by Document ID */}
                <div className="mb-4 p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Search size={16} className="text-blue-400" />
                    <h4 className="font-bold text-sm text-gray-300">Access Image by Document ID</h4>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchDocId}
                      onChange={(e) => {
                        setSearchDocId(e.target.value);
                        setSearchError("");
                      }}
                      placeholder="Enter Firestore Document ID (e.g., 3sp1PTTSrN90LMKUuhkz)"
                      className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={async () => {
                        if (!searchDocId.trim()) {
                          setSearchError("Please enter a document ID");
                          return;
                        }
                        try {
                          const docRef = doc(db, "medical_records", searchDocId.trim());
                          const docSnap = await getDoc(docRef);

                          if (docSnap.exists()) {
                            const recordData: any = { id: docSnap.id, ...docSnap.data() };
                            setSelectedRecord(recordData);
                            setPrediction(recordData.aiPrediction || "");
                            setConfidence(recordData.aiConfidence ? String(recordData.aiConfidence) : "");
                            setAiMetrics({
                              severity: recordData.aiSeverity,
                              uncertainty: recordData.aiUncertainty,
                              riskLevel: recordData.aiRiskLevel,
                              symptomRisk: recordData.symptomRisk
                            });
                            setHeatmap(recordData.heatmapUrl || "");
                            setDoctorNote(recordData.doctorNote || "");
                            setSearchError("");
                            setSearchDocId("");
                          } else {
                            setSearchError("Document not found. Please check the document ID.");
                          }
                        } catch (error: any) {
                          console.error("Search error:", error);
                          setSearchError("Error loading document: " + error.message);
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium transition"
                    >
                      Load
                    </button>
                    {searchDocId && (
                      <button
                        onClick={() => {
                          setSearchDocId("");
                          setSearchError("");
                        }}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition"
                      >
                        <XIcon size={16} className="text-white" />
                      </button>
                    )}
                  </div>
                  {searchError && (
                    <p className="text-red-400 text-xs mt-2">{searchError}</p>
                  )}
                  {searchDocId && !searchError && (
                    <p className="text-gray-400 text-xs mt-2">Click "Load" to view the image and record details</p>
                  )}
                </div>

                {records.length === 0 && (
                  <div className="text-center py-10 text-gray-500 border border-dashed border-white/10 rounded-xl">
                    <p>No records found.</p>
                    <p className="text-xs mt-2 text-gray-600">Check Console (F12) for errors.</p>
                  </div>
                )}

                {records.map(record => (
                  <div
                    key={record.id}
                    onClick={() => {
                      setSelectedRecord(record);
                      // Auto-load existing AI results if available
                      setPrediction(record.aiPrediction || "");
                      setConfidence(record.aiConfidence ? String(record.aiConfidence) : "");
                      setAiMetrics({
                        severity: record.aiSeverity,
                        uncertainty: record.aiUncertainty,
                        riskLevel: record.aiRiskLevel,
                        symptomRisk: record.symptomRisk
                      });
                      setHeatmap(record.heatmapUrl || "");

                      setDoctorNote(record.doctorNote || "");
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition ${selectedRecord?.id === record.id
                      ? 'bg-blue-600/20 border-blue-500'
                      : 'bg-black/20 border-white/5 hover:border-white/20'
                      }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold truncate">{record.fileName}</h3>
                        {/* Use Map or Record Data */}
                        <p className="text-[11px] text-blue-300 font-bold">
                          {userMap[record.patientId]?.fullName || record.patientName || "Unknown Patient"}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${record.status === 'REVIEWED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'
                        }`}>{record.status}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(record.uploadedAt).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> {new Date(record.uploadedAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* View: Appointments */}
            {viewMode === 'appointments' && (
              <>
                {appointments.length === 0 && <p className="text-center text-gray-500 py-10">No appointments found.</p>}
                {appointments.map(appt => (
                  <div key={appt.id} className="bg-black/20 p-4 rounded-xl border border-white/5 mb-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-sm font-bold text-white">{appt.patientName || appt.patientEmail}</p>
                        <p className="text-xs text-purple-400">{appt.date}</p>
                        <p className="text-xs text-gray-400 italic mt-1">&quot;{appt.reason}&quot;</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${appt.status === 'SCHEDULED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'
                        }`}>{appt.status}</span>
                    </div>

                    {appt.status === 'PENDING' ? (
                      <button
                        onClick={async () => {
                          const meetingId = Math.random().toString(36).substring(7);
                          const meetingLink = `https://meet.jit.si/MediXpert-${meetingId}`;
                          try {
                            await updateDoc(doc(db, "appointments", appt.id), {
                              status: 'SCHEDULED',
                              scheduledTime: new Date().toLocaleTimeString(),
                              meetingLink: meetingLink,
                              doctorName: doctorProfile?.fullName || "Doctor",
                              hospitalName: doctorProfile?.hospitalName || "MediXpert Clinic",
                              doctorAddress: doctorProfile?.address || "Online"
                            });
                          } catch (e) {
                            console.error(e);
                            alert("Failed to schedule");
                          }
                        }}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-2 rounded transition"
                      >
                        Accept & Schedule
                      </button>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-emerald-400 font-bold text-center border-t border-white/10 pt-2">
                          Scheduled: {appt.scheduledTime}
                        </p>
                        <button
                          onClick={() => setActiveMeeting(appt.meetingLink || `https://meet.jit.si/MediXpert-${appt.id}`)}
                          className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded transition flex items-center justify-center gap-2"
                        >
                          <Activity size={14} /> Join Video Call
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </section>

        {/* Right: Diagnosis Panel */}
        <section className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col h-[85vh] overflow-y-auto">
          {!selectedRecord ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <Activity size={64} className="mb-4 opacity-50" />
              <p className="text-xl">Select a patient record to begin review (Queue Mode)</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-white/10 pb-4">
                <div className="flex items-start gap-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">{selectedRecord.fileName}</h2>
                    <p className="text-gray-400 text-sm">Patient ID: {selectedRecord.patientId}</p>

                    {/* Robust Patient Details Display using Map */}
                    {(userMap[selectedRecord.patientId] || selectedRecord.patientName) && (
                      <div className="text-sm text-gray-400 mt-1">
                        <p><span className="text-gray-500">Name:</span> <span className="text-white font-bold">{userMap[selectedRecord.patientId]?.fullName || selectedRecord.patientName}</span></p>
                        <p><span className="text-gray-500">Mobile:</span> <span className="text-blue-400">{userMap[selectedRecord.patientId]?.mobile || selectedRecord.patientMobile}</span></p>
                        <p><span className="text-gray-500">Info:</span> <span className="text-white">{userMap[selectedRecord.patientId]?.age || "?"} yrs • {userMap[selectedRecord.patientId]?.gender || "?"}</span></p>
                      </div>
                    )}
                  </div>
                  {/* Patient Photo */}
                  {userMap[selectedRecord.patientId]?.photoURL && (
                    <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-white/10 shrink-0">
                      <img src={userMap[selectedRecord.patientId].photoURL} alt="Patient" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                {selectedRecord.status === 'REVIEWED' && (
                  <div className="bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-lg flex items-center gap-2">
                    <CheckCircle size={20} /> Verified
                  </div>
                )}
              </div>

              {/* Patient Context Bar */}
              {(patientVitals || patientSymptoms) && (
                <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-xl flex flex-wrap gap-6 text-sm items-center">
                  <span className="text-blue-400 font-bold text-xs uppercase tracking-wider">Patient Vitals:</span>
                  {patientVitals && (
                    <div className="flex gap-4 items-center">
                      <span title="Blood Pressure" className="flex items-center gap-1"><Activity size={14} className="text-pink-400" /> <b className="text-white">{patientVitals.bp}</b></span>
                      <span title="Heart Rate" className="flex items-center gap-1"><User size={14} className="text-pink-400" /> <b className="text-white">{patientVitals.heartRate} bpm</b></span>
                      <span title="Temperature" className="flex items-center gap-1"><Activity size={14} className="text-pink-400" /> <b className="text-white">{patientVitals.temp}°F</b></span>
                    </div>
                  )}
                  {patientSymptoms && (
                    <div className="flex gap-2 items-center pl-6 border-l border-white/10">
                      <FileText size={14} className="text-orange-400" />
                      <span className="text-gray-300 italic">&quot;{patientSymptoms.details}&quot;</span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* 1. X-Ray/ECG & History */}
                <div className="flex flex-col gap-6">
                  <div>
                    <h3 className="font-bold mb-3 text-gray-300 transform uppercase text-xs tracking-wider">
                      {selectedRecord.type === 'ECG' ? 'ECG Report' : 'Original Scan'}
                    </h3>
                    <div className="h-64">
                      <ImageViewer
                        imageUrl={selectedRecord.fileUrl}
                        imagePreview={selectedRecord.imagePreview}
                        fileName={selectedRecord.fileName || `${selectedRecord.type || 'XRAY'}_image`}
                        alt={selectedRecord.type === 'ECG' ? 'ECG Report' : 'X-Ray'}
                        className="h-full w-full"
                        showControls={true}
                      />
                    </div>
                  </div>

                  {/* History Tiny List */}
                  {patientHistory.length > 0 && (
                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                      <h3 className="font-bold text-gray-500 text-[10px] uppercase mb-3">Previous Scans</h3>
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10">
                        {patientHistory.map(h => (
                          <div
                            key={h.id}
                            className="min-w-[100px] p-2 bg-white/5 rounded border border-white/5 text-xs opacity-70 hover:opacity-100 transition cursor-pointer"
                            onClick={() => setSelectedRecord(h)}
                          >
                            <div className="h-16 mb-2 rounded overflow-hidden bg-black/40">
                              <ImageViewer
                                imageUrl={h.fileUrl}
                                imagePreview={h.imagePreview}
                                fileName={h.fileName}
                                alt={h.fileName}
                                className="h-full w-full"
                                showControls={false}
                              />
                            </div>
                            <p className="font-bold truncate text-white">{h.fileName}</p>
                            <p className="text-[10px] text-gray-500">{new Date(h.uploadedAt).toLocaleDateString()}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. AI Analysis & Diagnosis */}
                <div className="flex flex-col gap-6">
                  {/* AI Card */}
                  <div className="bg-black/40 rounded-xl border border-white/10 p-4 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-3 relative z-10">
                      <h3 className="font-bold text-gray-300 flex items-center gap-2"><Brain size={16} className="text-purple-400" /> AI Analysis</h3>
                      {(selectedRecord.type === 'XRAY' || !selectedRecord.type) && (
                        <button
                          onClick={runAIAnalysis}
                          disabled={loading || (!selectedRecord.fileUrl && !selectedRecord.imagePreview)}
                          className="text-[10px] uppercase font-bold bg-purple-600/80 hover:bg-purple-600 px-3 py-1 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title={(!selectedRecord.fileUrl && !selectedRecord.imagePreview) ? "No image available for analysis" : "Run AI Analysis"}
                        >
                          {loading ? 'Processing...' : 'Run Diagnostics'}
                        </button>
                      )}
                      {selectedRecord.type === 'ECG' && selectedRecord.ecgPredictionLabel && (
                        <span className="text-[10px] uppercase font-bold text-green-400 px-3 py-1 rounded bg-green-500/10 border border-green-500/30">
                          Analyzed
                        </span>
                      )}
                    </div>

                    {(prediction || (selectedRecord.type === 'ECG' && selectedRecord.ecgPredictionLabel)) ? (
                      <div className="flex flex-col gap-4 relative z-10">
                        <div className="flex gap-4">
                          {selectedRecord.type !== 'ECG' && heatmap && (
                            <div className="h-32 w-32 bg-black rounded-lg overflow-hidden border border-white/10 relative group">
                              <img src={heatmap} alt="Heatmap" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center pointer-events-none">
                                <p className="text-[10px] text-white font-bold">Grad-CAM</p>
                              </div>
                            </div>
                          )}
                          {selectedRecord.type === 'ECG' && (
                            <div className="h-32 w-32 bg-black rounded-lg overflow-hidden border border-white/10 relative group flex items-center justify-center">
                              <Activity size={48} className="text-blue-400 opacity-50" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center pointer-events-none">
                                <p className="text-[10px] text-white font-bold">ECG Signal</p>
                              </div>
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-xs text-gray-500 uppercase">Detection</p>
                                <p className="text-xl font-bold text-white capitalize mb-1">
                                  {selectedRecord.type === 'ECG' ? selectedRecord.ecgPredictionLabel : prediction}
                                </p>
                              </div>
                              {aiMetrics.uncertainty && (
                                <span className={`text-[10px] px-2 py-1 rounded border ${Number(aiMetrics.uncertainty) > 40 ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
                                  +/- {aiMetrics.uncertainty}% Unc.
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-gray-500 uppercase mt-2">Confidence</p>
                            <div className="h-2 w-full bg-gray-700 rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${selectedRecord.type === 'ECG' ? (selectedRecord.ecgConfidence || 0) : parseFloat(confidence || "0")}%` }}></div>
                            </div>
                            <p className="text-right text-xs font-bold text-pink-400 mt-1">
                              {selectedRecord.type === 'ECG'
                                ? (selectedRecord.ecgConfidence ? parseFloat(selectedRecord.ecgConfidence).toFixed(1) : "N/A")
                                : parseFloat(confidence || "0").toFixed(1)}%
                            </p>

                            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/5 text-center">
                              <div className="bg-white/5 rounded p-1">
                                <p className="text-[8px] text-gray-500 uppercase">Severity</p>
                                <p className="text-xs font-bold text-white">
                                  {selectedRecord.type === 'ECG'
                                    ? (selectedRecord.ecgPredictionLabel === "Normal" ? "Normal" : "Requires Review")
                                    : (aiMetrics.severity || "N/A")}
                                </p>
                              </div>
                              <div className="bg-white/5 rounded p-1">
                                <p className="text-[8px] text-gray-500 uppercase">Risk</p>
                                <p className={`text-xs font-bold ${selectedRecord.type === 'ECG'
                                  ? (selectedRecord.ecgPredictionLabel === "Normal" ? 'text-green-400' : 'text-yellow-400')
                                  : (aiMetrics.riskLevel === 'High' ? 'text-red-400' : 'text-yellow-400')}`}>
                                  {selectedRecord.type === 'ECG'
                                    ? (selectedRecord.ecgPredictionLabel === "Normal" ? "Low" : "Moderate")
                                    : (aiMetrics.riskLevel || "N/A")}
                                </p>
                              </div>
                              <div className="bg-white/5 rounded p-1">
                                <p className="text-[8px] text-gray-500 uppercase">{selectedRecord.type === 'ECG' ? 'Type' : 'Symptoms'}</p>
                                <p className="text-xs font-bold text-blue-300">
                                  {selectedRecord.type === 'ECG'
                                    ? (selectedRecord.ecgPredictionLabel || "N/A")
                                    : (aiMetrics.symptomRisk || "None")}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-32 flex items-center justify-center text-gray-600 text-xs italic border border-dashed border-white/10 rounded-lg">
                        {selectedRecord.type === 'ECG' ? 'ECG analysis completed. Results will appear here.' : 'AI Analysis not yet run.'}
                      </div>
                    )}
                  </div>

                  {/* Doctor Diagnosis */}
                  <div className="bg-white/5 p-5 rounded-xl border border-white/5 flex-1 flex flex-col">
                    <h3 className="font-bold mb-4 flex items-center gap-2 text-sm text-blue-300">
                      <FileText size={16} /> Clinical Diagnosis
                    </h3>

                    {/* Feedback Toggle */}
                    {prediction && (
                      <div className="flex gap-2 mb-4">
                        <button onClick={() => setAgreeWithAI(true)} className={`flex-1 py-2 text-xs font-bold rounded border transition ${agreeWithAI === true ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-black/20 border-white/10 text-gray-500'}`}>
                          Confirm AI
                        </button>
                        <button onClick={() => setAgreeWithAI(false)} className={`flex-1 py-2 text-xs font-bold rounded border transition ${agreeWithAI === false ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-black/20 border-white/10 text-gray-500'}`}>
                          Override
                        </button>
                      </div>
                    )}

                    <textarea
                      value={doctorNote}
                      onChange={(e) => setDoctorNote(e.target.value)}
                      placeholder="Enter final diagnosis notes..."
                      className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-sm focus:border-blue-500 outline-none transition flex-1 resize-none mb-4"
                    />
                    <button
                      onClick={submitReview}
                      disabled={saving}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-bold text-sm transition disabled:opacity-50"
                    >
                      {saving ? 'Finalizing...' : 'Submit Final Report'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* View: Appointments Management */}
          {viewMode === 'appointments' && (
            <div className="flex flex-col gap-6 animate-fade-in text-white">
              {/* 1. Schedule Settings */}
              <div className="bg-black/40 border border-white/10 rounded-xl p-6">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-purple-300">
                  <Clock size={24} /> Clinic Schedule & Flexibility
                </h3>
                <div className="flex flex-wrap gap-8 items-end">
                  {/* Start Time */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">Start Time</label>
                    <div className="flex bg-white/5 rounded-lg border border-white/10 p-1">
                      <input
                        type="text"
                        value={schedule.start}
                        onChange={(e) => setSchedule({ ...schedule, start: e.target.value })}
                        className="bg-transparent text-white font-bold w-16 text-center outline-none" placeholder="09:00"
                      />
                      <select
                        value={schedule.startPeriod}
                        onChange={(e) => setSchedule({ ...schedule, startPeriod: e.target.value })}
                        className="bg-white/10 text-xs font-bold rounded px-2 outline-none text-white"
                      >
                        <option className="text-black">AM</option><option className="text-black">PM</option>
                      </select>
                    </div>
                  </div>

                  <div className="text-gray-500 font-bold self-center pb-2">-</div>

                  {/* End Time */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-400 uppercase tracking-widest font-bold">End Time</label>
                    <div className="flex bg-white/5 rounded-lg border border-white/10 p-1">
                      <input
                        type="text"
                        value={schedule.end}
                        onChange={(e) => setSchedule({ ...schedule, end: e.target.value })}
                        className="bg-transparent text-white font-bold w-16 text-center outline-none" placeholder="05:00"
                      />
                      <select
                        value={schedule.endPeriod}
                        onChange={(e) => setSchedule({ ...schedule, endPeriod: e.target.value })}
                        className="bg-white/10 text-xs font-bold rounded px-2 outline-none text-white"
                      >
                        <option className="text-black">PM</option><option className="text-black">AM</option>
                      </select>
                    </div>
                  </div>

                  <button className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-bold text-sm transition h-full shadow-lg shadow-purple-900/20">
                    Update Availability
                  </button>
                </div>
              </div>

              {/* 2. Appointments List */}
              <div>
                <h3 className="font-bold text-gray-400 uppercase text-xs tracking-widest mb-4">Pending Requests</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {appointments.length === 0 && <p className="text-gray-500 italic">No appointments found.</p>}
                  {appointments.map(appt => {
                    const bookingState = bookingTimes[appt.id] || { time: '10:00', period: 'AM' };
                    return (
                      <div key={appt.id} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-purple-500/50 transition duration-300">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-bold text-lg text-white">{appt.patientName || "Patient Request"}</h4>
                            <p className="text-xs text-gray-400">ID: {appt.id.slice(0, 6)}</p>
                          </div>
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${appt.status === 'SCHEDULED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}`}>{appt.status}</span>
                        </div>

                        <div className="bg-black/20 p-3 rounded-lg border border-white/5 mb-4">
                          <p className="text-gray-300 text-sm">&quot;{appt.reason || 'General Consultation'}&quot;</p>
                        </div>

                        {appt.status === 'PENDING' ? (
                          <div className="mt-4 pt-4 border-t border-white/5">
                            <label className="text-[10px] text-gray-500 uppercase mb-2 block font-bold">Propose Time</label>
                            <div className="flex gap-2 mb-3">
                              <input
                                type="text"
                                value={bookingState.time}
                                onChange={(e) => setBookingTimes({ ...bookingTimes, [appt.id]: { ...bookingState, time: e.target.value } })}
                                className="w-20 bg-black/40 border border-white/20 rounded p-2 text-center text-sm font-bold text-white outline-none focus:border-purple-500"
                              />
                              <select
                                value={bookingState.period}
                                onChange={(e) => setBookingTimes({ ...bookingTimes, [appt.id]: { ...bookingState, period: e.target.value } })}
                                className="bg-black/40 border border-white/20 rounded px-2 text-sm font-bold outline-none text-white"
                              >
                                <option className="text-black">AM</option><option className="text-black">PM</option>
                              </select>
                              <button
                                onClick={() => confirmAppointment(appt.id, `${bookingState.time} ${bookingState.period}`)}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-xs font-bold transition shadow-lg shadow-emerald-900/20">
                                Confirm
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 flex items-center justify-between text-sm">
                            <p className="text-gray-400">Scheduled: <span className="text-white font-bold">{appt.scheduledTime}</span></p>
                            <button onClick={() => confirmAppointment(appt.id)} className="text-xs text-blue-400 hover:text-white underline">Reschedule</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
              <XIcon size={18} /> End Call
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
