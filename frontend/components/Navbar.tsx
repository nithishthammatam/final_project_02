"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [homeLink, setHomeLink] = useState('/');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser: any) => {
            setUser(currentUser);
            if (currentUser) {
                // Fetch Role to determine Dashboard URL
                try {
                    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
                    if (userDoc.exists()) {
                        const role = userDoc.data().role;
                        if (role === 'DOCTOR') setHomeLink('/doctor');
                        else setHomeLink('/patient');
                    } else {
                        // Default fallback if no profile found
                        setHomeLink('/patient');
                    }
                } catch (e) {
                    console.error("Error fetching role:", e);
                    setHomeLink('/patient');
                }
            } else {
                setHomeLink('/');
            }
        });
        return () => unsubscribe();
    }, []);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push('/login');
            setHomeLink('/');
        } catch (error) {
            console.error("Logout Error:", error);
        }
    };

    const navLinks = [
        { name: 'Home', href: homeLink }, // Use dynamic link
        { name: 'About', href: '/about' },
    ];

    return (
        <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-white/5 backdrop-blur-xl supports-[backdrop-filter]:bg-white/5">
            <div className="flex h-20 w-full items-center justify-between px-6 lg:px-8">
                {/* Logo Section - ALWAYS Link to Landing Page */}
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-blue-400 text-white shadow-lg shadow-blue-500/20 transition-transform duration-300 group-hover:scale-105">
                        <Activity className="h-6 w-6" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-white transition-colors">
                        MediXpert
                    </span>
                </Link>

                <div className="flex items-center gap-6">
                    {/* Navigation Links */}
                    <div className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10 backdrop-blur-md shadow-inner">
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    className={`
                                        relative px-6 py-2 rounded-full text-sm font-medium transition-all duration-300
                                        ${isActive
                                            ? 'bg-blue-500/10 text-blue-400 shadow-sm'
                                            : 'text-gray-300 hover:text-white hover:bg-white/5'
                                        }
                                    `}
                                >
                                    {link.name}
                                </Link>
                            );
                        })}
                    </div>

                    {/* Action Button: Logout if user exists, Get Started otherwise */}
                    {user ? (
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleLogout}
                                className="group relative inline-flex h-10 items-center justify-center overflow-hidden rounded-full bg-red-600/80 px-8 font-medium text-white shadow-lg shadow-red-500/30 transition-all duration-300 hover:bg-red-700 hover:scale-105 hover:shadow-red-500/50"
                            >
                                <span className="relative z-10 text-sm">Logout</span>
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4">
                            <Link
                                href="/login"
                                className="group relative inline-flex h-10 items-center justify-center overflow-hidden rounded-full bg-blue-600 px-8 font-medium text-white shadow-lg shadow-blue-500/30 transition-all duration-300 hover:bg-blue-700 hover:scale-105 hover:shadow-blue-500/50"
                            >
                                <span className="relative z-10 text-sm">Get Started</span>
                                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}
