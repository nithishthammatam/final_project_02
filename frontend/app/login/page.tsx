"use client";
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Activity } from 'lucide-react';
import React, { useEffect } from 'react';
import { getApiUrl } from '@/lib/config';

function LoginForm() {
    const searchParams = useSearchParams();
    const [isLogin, setIsLogin] = useState(true);
    const [role, setRole] = useState<'PATIENT' | 'DOCTOR'>((searchParams.get('role') as 'DOCTOR') || 'PATIENT');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [mobile, setMobile] = useState('');
    const [age, setAge] = useState('');
    const [gender, setGender] = useState('');
    const [hospitalName, setHospitalName] = useState('');
    const [address, setAddress] = useState('');
    const [licenseId, setLicenseId] = useState('');
    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    // Auto-redirect if already logged in
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists() && userDoc.data().role === 'DOCTOR') {
                    router.push('/doctor');
                } else {
                    router.push('/patient');
                }
            }
        });
        return () => unsubscribe();
    }, [router]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (isLogin) {
                // LOGIN FLOW
                const userCred = await signInWithEmailAndPassword(auth, email, password);

                // Fetch role from DB
                const userRef = doc(db, "users", userCred.user.uid);
                const userDoc = await getDoc(userRef);
                let dbRole = userDoc.exists() ? userDoc.data().role : null;

                // FIX: If user explicit selects DOCTOR in UI but DB says PATIENT/Null, update DB
                if (role === 'DOCTOR' && dbRole !== 'DOCTOR') {
                    await setDoc(userRef, {
                        uid: userCred.user.uid,
                        email,
                        role: 'DOCTOR',
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                    dbRole = 'DOCTOR';
                }

                if (dbRole === 'DOCTOR') router.push('/doctor');
                else router.push('/patient');

            } else {
                if (password !== confirmPassword) {
                    setError("Passwords do not match.");
                    setLoading(false);
                    return;
                }

                // Allow flexibility: if Doctor, age/gender might be optional, but Hospital/Address required
                if (role === 'DOCTOR') {
                    if (!fullName || !mobile || !hospitalName || !address) {
                        setError("Please fill in all doctor details (Name, Mobile, Hospital, Address).");
                        setLoading(false);
                        return;
                    }
                } else {
                    if (!fullName || !mobile || !age) {
                        setError("Please fill in all patient details.");
                        setLoading(false);
                        return;
                    }
                }

                // Validation: Gmail Only
                if (!email.endsWith('@gmail.com')) {
                    setError("Only @gmail.com addresses are allowed.");
                    setLoading(false);
                    return;
                }
                // Validation: Mobile 10 Digits
                if (!/^\d{10}$/.test(mobile)) {
                    setError("Mobile number must be exactly 10 digits.");
                    setLoading(false);
                    return;
                }

                // SIGNUP FLOW
                const userCred = await createUserWithEmailAndPassword(auth, email, password);

                try {
                    // Upload Photo if exists
                    let photoURL = "";
                    if (profilePhoto) {
                        try {
                            const formData = new FormData();
                            formData.append("file", profilePhoto);
                            const res = await fetch(getApiUrl("/upload"), {
                                method: "POST",
                                body: formData
                            });
                            if (res.ok) {
                                const data = await res.json();
                                photoURL = data.url;
                            }
                        } catch (err) {
                            console.error("Photo upload failed", err);
                            // Continue signup even if photo fails
                        }
                    }

                    // Create user profile in Firestore
                    const userData: any = {
                        uid: userCred.user.uid,
                        email,
                        role,
                        fullName,
                        mobile,
                        photoURL,
                        createdAt: new Date().toISOString()
                    };

                    if (role === 'PATIENT') {
                        userData.age = age;
                        userData.gender = gender;
                    } else {
                        userData.hospitalName = hospitalName;
                        userData.address = address;
                        if (licenseId) userData.licenseId = licenseId;
                    }

                    await setDoc(doc(db, "users", userCred.user.uid), userData);
                } catch (firestoreError) {
                    console.error("Firestore Profile Creation Error:", firestoreError);
                }

                // Direct Login: Redirect to respective dashboard
                alert("Account created successfully! Redirecting...");
                if (role === 'DOCTOR') {
                    router.push('/doctor');
                } else {
                    router.push('/patient');
                }
            }

        } catch (err: any) {
            console.error("Authentication Error Details:", err);
            let msg = err.message;
            if (err.code === 'auth/invalid-credential') msg = "Invalid email or password. Please check your credentials.";
            else if (err.code === 'auth/email-already-in-use') msg = "This email is already registered. Please login.";
            else if (err.code === 'auth/weak-password') msg = "Password should be at least 6 characters.";

            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center p-4 transition-all duration-1000 bg-cover bg-center bg-no-repeat"
            style={{
                backgroundImage: role === 'DOCTOR'
                    ? "linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.8)), url('https://img.freepik.com/premium-photo/health-care-banner-medical-images-medical-background-images_593195-4.jpg')"
                    : "linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.85)), url('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRSLMQRWe1pVJ89Hmlu1aK8hRZpyViICA1-3g&s')"
            }}
        >
            <div className="mb-8 flex items-center gap-2 text-2xl font-bold">
                <Activity className="text-blue-500" size={32} />
                <span>MediXpert Access</span>
            </div>

            <div className="w-full max-w-md bg-white/5 border border-white/10 p-8 rounded-2xl backdrop-blur-sm">
                <h2 className="text-2xl font-bold mb-6 text-center">
                    {isLogin ? 'Welcome Back' : 'Create Account'}
                </h2>

                {/* Role Toggle */}
                {/* Role Toggle - Always Visible */}
                <div className="flex bg-white/5 rounded-lg p-1 mb-6">
                    <button
                        type="button"
                        onClick={() => setRole('PATIENT')}
                        className={`flex-1 py-2 rounded-md transition ${role === 'PATIENT' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Patient
                    </button>
                    <button
                        type="button"
                        onClick={() => setRole('DOCTOR')}
                        className={`flex-1 py-2 rounded-md transition ${role === 'DOCTOR' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Doctor
                    </button>
                </div>

                <form onSubmit={handleAuth} className="flex flex-col gap-4">
                    {!isLogin && (
                        <>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Full Name</label>
                                <input
                                    type="text"
                                    required
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-gray-400 focus:border-blue-500 outline-none transition"
                                    placeholder="Enter full name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Mobile Number</label>
                                <input
                                    type="text"
                                    required
                                    value={mobile}
                                    onChange={(e) => {
                                        // Only allow typing numbers
                                        const val = e.target.value.replace(/\D/g, '');
                                        if (val.length <= 10) setMobile(val);
                                    }}
                                    className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-gray-400 focus:border-blue-500 outline-none transition"
                                    placeholder="Enter mobile number"
                                />
                            </div>
                            <div className="flex gap-4">
                                {role === 'PATIENT' ? (
                                    <>
                                        <div className="flex-1">
                                            <label className="block text-sm text-gray-400 mb-1">Age</label>
                                            <input
                                                type="number"
                                                required
                                                value={age}
                                                onChange={(e) => setAge(e.target.value)}
                                                className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-gray-400 focus:border-blue-500 outline-none transition"
                                                placeholder="Enter age"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-sm text-gray-400 mb-1">Gender</label>
                                            <select
                                                value={gender}
                                                onChange={(e) => setGender(e.target.value)}
                                                className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white focus:border-blue-500 outline-none transition"
                                            >
                                                <option value="" disabled>Select Gender</option>
                                                <option value="Male" className="text-black">Male</option>
                                                <option value="Female" className="text-black">Female</option>
                                                <option value="Other" className="text-black">Other</option>
                                            </select>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex-1">
                                            <label className="block text-sm text-gray-400 mb-1">Clinic Name</label>
                                            <input
                                                type="text"
                                                required
                                                value={hospitalName}
                                                onChange={(e) => setHospitalName(e.target.value)}
                                                className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-gray-400 focus:border-blue-500 outline-none transition"
                                                placeholder="Hospital Name"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-sm text-gray-400 mb-1">City/Location</label>
                                            <input
                                                type="text"
                                                required
                                                value={address}
                                                onChange={(e) => setAddress(e.target.value)}
                                                className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-gray-400 focus:border-blue-500 outline-none transition"
                                                placeholder="City"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>

                            {role === 'DOCTOR' && (
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Medical License ID <span className="text-gray-500 text-xs">(Optional for testing)</span></label>
                                    <input
                                        type="text"
                                        value={licenseId}
                                        onChange={(e) => setLicenseId(e.target.value)}
                                        className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-gray-400 focus:border-blue-500 outline-none transition"
                                        placeholder="Enter License / Registration Number"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Profile Photo (Optional)</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setProfilePhoto(e.target.files?.[0] || null)}
                                    className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                                />
                            </div>
                        </>
                    )}
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Email</label>
                        <input
                            type="email"
                            name="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-gray-400 focus:border-blue-500 outline-none transition"
                            placeholder="Please enter email"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Password</label>
                        <input
                            type="password"
                            name="password"
                            autoComplete={isLogin ? "current-password" : "new-password"}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-gray-400 focus:border-blue-500 outline-none transition"
                            placeholder="Enter password"
                        />
                    </div>

                    {!isLogin && (
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Confirm Password</label>
                            <input
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-gray-400 focus:border-blue-500 outline-none transition"
                                placeholder="Please confirm password"
                            />
                        </div>
                    )}

                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-3 rounded-lg font-bold mt-2 transition ${role === 'DOCTOR' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50`}
                    >
                        {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-sm text-gray-400 hover:text-white underline"
                    >
                        {isLogin ? "Don't have an account? Sign up" : "Already have an account? Login"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-white">Loading...</div></div>}>
            <LoginForm />
        </Suspense>
    );
}
