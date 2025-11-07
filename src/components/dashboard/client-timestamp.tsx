
'use client';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';

interface ClientTimestampProps {
    timestamp: string | null;
}

export function ClientTimestamp({ timestamp }: ClientTimestampProps) {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!timestamp) {
        return null;
    }

    return (
        <div className="text-xs text-muted-foreground text-right">
            Data as of: <br />
            {isClient ? format(parseISO(timestamp), "MMM d, yyyy 'at' h:mm a") : 'Loading...'}
        </div>
    );
}
