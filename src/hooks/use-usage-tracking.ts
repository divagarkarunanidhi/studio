
'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useUser, useFirestore, useAuth } from '@/firebase';
import { collection } from 'firebase/firestore';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import type { UsageEvent } from '@/lib/types';
import { signOut } from 'firebase/auth';

const IDLE_THRESHOLD = 2 * 60 * 1000; // 2 minutes for session pulses
const PULSE_INTERVAL = 5 * 60 * 1000; // 5 minutes between pulses
const AUTO_LOGOUT_THRESHOLD = 5 * 60 * 1000; // 5 minutes for auto-logout
const CHECK_INTERVAL = 10 * 1000; // Check idle state every 10 seconds

/**
 * Hook to track user activity and menu usage.
 * Logs events to the 'usageEvents' collection with idle detection.
 * Automatically logs out the user after 5 minutes of total inactivity.
 */
export function useUsageTracking(username?: string) {
    const { user } = useUser();
    const firestore = useFirestore();
    const auth = useAuth();
    const lastActivityRef = useRef<number>(Date.now());

    const logEvent = useCallback((eventType: UsageEvent['eventType'], menuId?: string) => {
        if (!user || !firestore) return;

        // Explicitly set undefined fields to null, as Firestore does not support 'undefined'.
        const event = {
            userId: user.uid,
            username: username || user.email || 'Anonymous',
            eventType,
            menuId: menuId || null,
            timestamp: new Date().toISOString(),
        };

        const colRef = collection(firestore, 'usageEvents');
        addDocumentNonBlocking(colRef, event);
    }, [user, firestore, username]);

    // Monitor user activity to detect idle state
    useEffect(() => {
        const handleActivity = () => {
            lastActivityRef.current = Date.now();
        };

        window.addEventListener('mousemove', handleActivity);
        window.addEventListener('keydown', handleActivity);
        window.addEventListener('click', handleActivity);
        window.addEventListener('scroll', handleActivity);

        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('click', handleActivity);
            window.removeEventListener('scroll', handleActivity);
        };
    }, []);

    // Track Login
    useEffect(() => {
        if (user) {
            // Check if we already logged a login for this specific component mount
            const sessionKey = `logged_login_${user.uid}`;
            if (!sessionStorage.getItem(sessionKey)) {
                logEvent('login');
                sessionStorage.setItem(sessionKey, 'true');
            }
        }
    }, [user, logEvent]);

    // Pulse tracking for session duration
    useEffect(() => {
        if (!user) return;

        const interval = setInterval(() => {
            const now = Date.now();
            if (now - lastActivityRef.current < IDLE_THRESHOLD) {
                logEvent('session_pulse');
            }
        }, PULSE_INTERVAL);

        return () => clearInterval(interval);
    }, [user, logEvent]);

    // Auto-logout timer
    useEffect(() => {
        if (!user || !auth) return;

        const logoutInterval = setInterval(() => {
            const now = Date.now();
            if (now - lastActivityRef.current >= AUTO_LOGOUT_THRESHOLD) {
                logEvent('logout');
                signOut(auth).catch(err => console.error("Auto-logout error:", err));
            }
        }, CHECK_INTERVAL);

        return () => clearInterval(logoutInterval);
    }, [user, auth, logEvent]);

    return { logEvent };
}
