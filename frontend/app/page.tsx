"use client";
import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { FileUp, Stethoscope, HeartHandshake, ArrowRight, ShieldCheck, Sun } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [dashboardLink, setDashboardLink] = useState('/patient');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser: any) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists() && userDoc.data().role === 'DOCTOR') {
            setDashboardLink('/doctor');
          } else {
            setDashboardLink('/patient');
          }
        } catch (e) {
          console.error("Error fetching role", e);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <main
      className="min-h-screen flex flex-col items-center bg-fixed bg-cover bg-center relative"
      style={{
        backgroundImage: "url('https://media.istockphoto.com/id/2196602780/photo/physician-and-patient-analyze-a-holographic-body-model-technology-discussions-on-optimizied.jpg?s=612x612&w=0&k=20&c=oTGBZO75hGo8TBQYI4Kc26jguCSvAlg4sZMT90Izvso=')"
      }}
    >
      {/* Global Dark Overlay */}
      <div className="absolute inset-0 bg-black/70 z-0"></div>

      {/* Content Wrapper */}
      <div className="relative z-10 w-full flex flex-col items-center">
        <Navbar />

        {/* Hero Section */}
        <section className="w-full relative flex flex-col items-center justify-center text-center gap-6 py-32 px-4">
          <h1 className="text-5xl md:text-7xl font-bold text-white pb-2 leading-tight">
            AI-Powered Healthcare <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">for Everyone</span>
          </h1>
          <p className="text-xl text-gray-200 max-w-2xl font-medium">
            Upload medical scans, check symptoms, and get instant AI-assisted analysis verified by top doctors.
          </p>

          <div className="flex gap-4 mt-8 min-h-[60px]">
            {loading ? (
              <div className="text-white opacity-50">Loading...</div>
            ) : user ? (
              <Link href={dashboardLink} className="px-8 py-3 bg-blue-600 rounded-full font-bold text-lg hover:bg-blue-700 hover:scale-105 transition flex items-center gap-2 shadow-lg shadow-blue-500/20">
                Go to Dashboard <ArrowRight size={20} />
              </Link>
            ) : (
              <>
                <Link href="/login" className="px-8 py-3 bg-blue-600 rounded-full font-bold text-lg hover:bg-blue-700 hover:scale-105 transition flex items-center gap-2 shadow-lg shadow-blue-500/20">
                  Patient Portal <ArrowRight size={20} />
                </Link>
                <Link href="/login?role=DOCTOR" className="px-8 py-3 bg-white/10 border border-white/20 backdrop-blur-md rounded-full font-bold text-lg hover:bg-white/20 transition shadow-lg">
                  Doctor Login
                </Link>
              </>
            )}
          </div>
        </section>

        {/* Features / Informational Cards */}
        <section className="w-full py-24">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400 mb-4 drop-shadow-sm">How It Works</h2>
              <p className="text-white font-medium drop-shadow-md">Seamless integration of AI technology and medical expertise.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Card 1 */}
              <FeatureCard
                icon={<FileUp className="text-blue-400" size={40} />}
                title="Upload Medical Reports"
                desc="Submit X-rays or medical reports for AI-based preliminary analysis."
              />
              {/* Card 2 */}
              <FeatureCard
                icon={<Stethoscope className="text-teal-400" size={40} />}
                title="Doctor Reviews AI Results"
                desc="Qualified doctors verify AI findings before final diagnosis."
              />
              {/* Card 3 */}
              <FeatureCard
                icon={<HeartHandshake className="text-emerald-400" size={40} />}
                title="Get Treatment Guidance"
                desc="Receive doctor-approved treatment suggestions and care advice."
              />
            </div>
          </div>
        </section>

        {/* Health Tips Section */}
        <section className="w-full pb-24 px-4">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Respiratory Health Precautions */}
            <div className="bg-gradient-to-br from-blue-900/40 to-black/40 border border-blue-500/20 rounded-3xl p-8 backdrop-blur-md">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-500/20 rounded-full text-blue-400">
                  <ShieldCheck size={32} />
                </div>
                <h3 className="text-xl font-bold text-white">Respiratory Health Precautions</h3>
              </div>
              <ul className="space-y-3 text-gray-300">
                <li className="flex gap-2"><span className="text-blue-400">•</span> Stay hydrated to loosen lung mucus.</li>
                <li className="flex gap-2"><span className="text-blue-400">•</span> Avoid polluted environments.</li>
                <li className="flex gap-2"><span className="text-blue-400">•</span> Wear a mask in crowded areas.</li>
                <li className="flex gap-2"><span className="text-blue-400">•</span> Seek medical help if symptoms worsen.</li>
              </ul>
            </div>

            {/* Daily Health Tips */}
            <div className="bg-gradient-to-br from-emerald-900/40 to-black/40 border border-emerald-500/20 rounded-3xl p-8 backdrop-blur-md">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-emerald-500/20 rounded-full text-emerald-400">
                  <Sun size={32} />
                </div>
                <h3 className="text-xl font-bold text-white">Daily Health Tips</h3>
              </div>
              <ul className="space-y-3 text-gray-300">
                <li className="flex gap-2"><span className="text-emerald-400">•</span> Drink sufficient water.</li>
                <li className="flex gap-2"><span className="text-emerald-400">•</span> Practice yoga or stretching.</li>
                <li className="flex gap-2"><span className="text-emerald-400">•</span> Walk 20–30 minutes daily.</li>
                <li className="flex gap-2"><span className="text-emerald-400">•</span> Meditate to reduce stress.</li>
                <li className="flex gap-2"><span className="text-emerald-400">•</span> Maintain a healthy sleep routine.</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="p-6 rounded-2xl bg-black/40 border border-white/10 hover:border-blue-500/50 transition backdrop-blur-md">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-bold mb-2 text-white">{title}</h3>
      <p className="text-gray-200">{desc}</p>
    </div>
  );
}
