
'use client';

import { useEffect, useCallback } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection } from 'firebase/firestore';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import type { UsageEvent } from '@/lib/types';

/**
 * Hook to track user activity and menu usage.
 * Logs events to the 'usageEvents' collection.
 */
export function useUsageTracking(username?: string) {
    const { user } = useUser();
    const firestore = useFirestore();

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

    // Pulse tracking for session duration (every 5 minutes)
    useEffect(() => {
        if (!user) return;

        const interval = setInterval(() => {
            logEvent('session_pulse');
        }, 5 * 60 * 1000); // 5 minutes

        return () => clearInterval(interval);
    }, [user, logEvent]);

    return { logEvent };
}
