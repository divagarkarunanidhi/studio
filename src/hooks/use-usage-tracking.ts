
'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { collection, doc } from '@/firebase/firestore-shim';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import type { UsageEvent, AppConfiguration } from '@/lib/types';
import { signOut as nextAuthSignOut } from 'next-auth/react';

const IDLE_THRESHOLD = 2 * 60 * 1000; // 2 minutes for session pulses
const PULSE_INTERVAL = 5 * 60 * 1000; // 5 minutes between pulses
const CHECK_INTERVAL = 10 * 1000; // Check idle state every 10 seconds

/**
 * Hook to track user activity and menu usage.
 * Logs events to the 'usageEvents' collection with idle detection.
 * Automatically logs out the user after a configurable duration of inactivity.
 */
export function useUsageTracking(username?: string) {
    const { user } = useUser();
    const firestore = useFirestore();
    const lastActivityRef = useRef<number>(Date.now());
    const hasLoggedLoginRef = useRef<boolean>(false);

    // Fetch Global Config for Auto-Logout settings
    const configRef = useMemoFirebase(() => (firestore ? doc(firestore, 'appConfiguration', 'global') : null), [firestore]);
    const { data: configData } = useDoc<AppConfiguration>(configRef);

    const autoLogoutEnabled = configData?.autoLogoutEnabled ?? true;
    const autoLogoutTime = configData?.autoLogoutTime ?? 5; // minutes
    const autoLogoutThreshold = autoLogoutTime * 60 * 1000;

    const logEvent = useCallback((eventType: UsageEvent['eventType'], menuId?: string) => {
        if (!user || !firestore) return;

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

    // Track Login - Reliable session start logging
    useEffect(() => {
        if (user && firestore && !hasLoggedLoginRef.current) {
            logEvent('login');
            hasLoggedLoginRef.current = true;
        }
    }, [user, firestore, logEvent]);

    // Pulse tracking for session duration
    useEffect(() => {
        if (!user) return;

        const interval = setInterval(() => {
            const now = Date.now();
            // Only send a pulse if the user has been active within the threshold
            if (now - lastActivityRef.current < IDLE_THRESHOLD) {
                logEvent('session_pulse');
            }
        }, PULSE_INTERVAL);

        return () => clearInterval(interval);
    }, [user, logEvent]);

    // Auto-logout timer
    useEffect(() => {
        if (!user || !autoLogoutEnabled) return;

        const logoutInterval = setInterval(() => {
            const now = Date.now();
            if (now - lastActivityRef.current >= autoLogoutThreshold) {
                logEvent('logout');
                nextAuthSignOut({ redirect: false }).catch(err => console.error("Auto-logout error:", err));
            }
        }, CHECK_INTERVAL);

        return () => clearInterval(logoutInterval);
    }, [user, logEvent, autoLogoutEnabled, autoLogoutThreshold]);

    return { logEvent };
}
