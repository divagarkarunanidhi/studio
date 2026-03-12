
'use client';

import { useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, limit, query } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '../dashboard/stat-card';
import { Activity, MousePointer2, Users, Clock, History, AlertCircle } from 'lucide-react';
import type { UsageEvent } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell, Tooltip } from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export function UsageDetailsPage() {
    const firestore = useFirestore();
    
    // Fetch raw collection to avoid complex indexing requirements for 'orderBy' in MVP
    const usageColRef = useMemoFirebase(
        () => query(collection(firestore, 'usageEvents'), limit(1000)),
        [firestore]
    );
    
    const { data: rawEvents, isLoading } = useCollection<UsageEvent>(usageColRef);

    const stats = useMemo(() => {
        if (!rawEvents || rawEvents.length === 0) return null;

        // Sort events by timestamp descending client-side
        const events = [...rawEvents].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        const menuClicks = events.filter(e => e.eventType === 'menu_click');
        const logins = events.filter(e => e.eventType === 'login');
        const pulses = events.filter(e => e.eventType === 'session_pulse');
        const authEvents = events.filter(e => e.eventType === 'login' || e.eventType === 'logout');
        
        // Group unique users with their details
        const userMap = new Map<string, { username: string, lastSeen: string }>();
        events.forEach(e => {
            const existing = userMap.get(e.userId);
            if (!existing || e.timestamp > existing.lastSeen) {
                userMap.set(e.userId, { 
                    username: e.username || 'Anonymous', 
                    lastSeen: e.timestamp 
                });
            }
        });
        const activeUsersList = Array.from(userMap.values()).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
        const uniqueUsers = activeUsersList.length;

        // Calculate total hours for the stat card (pulse = 5 mins)
        const totalMinutes = pulses.length * 5;
        const totalHoursFormatted = (totalMinutes / 60).toFixed(1);

        // Reconstruct sessions: Group login/logout events and pulses chronologically
        const chronEvents = [...rawEvents].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        const sessionList: any[] = [];
        const activeSessions: Record<string, any> = {};

        chronEvents.forEach(e => {
            if (e.eventType === 'login') {
                // If there's an existing session that wasn't closed, mark it as Incomplete
                if (activeSessions[e.userId]) {
                    sessionList.push({ 
                        ...activeSessions[e.userId], 
                        logout: 'Incomplete',
                        duration: activeSessions[e.userId].pulses * 5
                    });
                }
                activeSessions[e.userId] = {
                    userId: e.userId,
                    username: e.username || 'Anonymous',
                    login: e.timestamp,
                    pulses: 0,
                    lastActivity: e.timestamp
                };
            } else if (e.eventType === 'session_pulse') {
                if (activeSessions[e.userId]) {
                    activeSessions[e.userId].pulses++;
                    activeSessions[e.userId].lastActivity = e.timestamp;
                }
            } else if (e.eventType === 'logout') {
                if (activeSessions[e.userId]) {
                    const session = { 
                        ...activeSessions[e.userId], 
                        logout: e.timestamp,
                        duration: activeSessions[e.userId].pulses * 5
                    };
                    sessionList.push(session);
                    delete activeSessions[e.userId];
                }
            }
        });

        // Any sessions still active
        Object.values(activeSessions).forEach(s => {
            sessionList.push({ 
                ...s, 
                logout: 'Active', 
                duration: s.pulses * 5 
            });
        });

        const sortedSessions = sessionList.sort((a, b) => b.login.localeCompare(a.login));

        const menuUsage = menuClicks.reduce((acc, e) => {
            const id = e.menuId || 'Unknown';
            acc[id] = (acc[id] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const menuData = Object.entries(menuUsage)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        return {
            totalClicks: menuClicks.length,
            totalLogins: logins.length,
            authEvents,
            uniqueUsers,
            activeUsersList,
            totalHours: totalHoursFormatted,
            sessionHistory: sortedSessions,
            menuData,
            recentEvents: events.slice(0, 10)
        };
    }, [rawEvents]);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
                <Skeleton className="h-[400px] w-full" />
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                <Alert className="max-w-md">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>No Usage Data Recorded</AlertTitle>
                    <AlertDescription>
                        Usage metrics are collected as you and other users interact with the application. 
                        Please interact with some menu options or wait a few minutes for the first session pulse to be recorded.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Dialog>
                    <DialogTrigger asChild>
                        <div className="cursor-pointer transition-transform hover:scale-[1.02]">
                            <StatCard 
                                title="Total Application Hours" 
                                value={<span className="text-primary hover:underline">{stats.totalHours} hrs</span>} 
                                icon={<Clock />} 
                                description="Based on active session pulses (click for breakdown)" 
                            />
                        </div>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl">
                        <DialogHeader>
                            <DialogTitle>Session History Breakdown</DialogTitle>
                            <DialogDescription>
                                Individual user sessions reconstructed from login, logout, and activity pulses.
                            </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="h-[500px] pr-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Login Time</TableHead>
                                        <TableHead>Logout / Last Pulse</TableHead>
                                        <TableHead className="text-right">Active Duration</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stats.sessionHistory.map((session, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="font-medium text-xs">
                                                {session.username}
                                            </TableCell>
                                            <TableCell className="text-[10px] text-muted-foreground">
                                                {format(parseISO(session.login), 'MMM d, h:mm a')}
                                            </TableCell>
                                            <TableCell className="text-[10px]">
                                                {session.logout === 'Active' ? (
                                                    <Badge variant="outline" className="text-[8px] text-green-600 bg-green-50">Active</Badge>
                                                ) : session.logout === 'Incomplete' ? (
                                                    <span className="text-muted-foreground italic">Timed out</span>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        {format(parseISO(session.logout), 'MMM d, h:mm a')}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-xs font-bold text-primary">
                                                {session.duration} mins
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </DialogContent>
                </Dialog>
                
                <Dialog>
                    <DialogTrigger asChild>
                        <div className="cursor-pointer transition-transform hover:scale-[1.02]">
                            <StatCard 
                                title="User Logins" 
                                value={<span className="text-primary hover:underline">{stats.totalLogins}</span>} 
                                icon={<Users />} 
                                description="Total login events (click to view details)" 
                            />
                        </div>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>User Access History</DialogTitle>
                            <DialogDescription>
                                A chronological list of recent login and logout events.
                            </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="h-[400px] pr-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead className="text-right">Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stats.authEvents.map((event, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="font-medium text-xs">{event.username || 'Anonymous'}</TableCell>
                                            <TableCell className="text-xs">
                                                <Badge 
                                                    variant={event.eventType === 'login' ? 'default' : 'secondary'} 
                                                    className="text-[8px] uppercase px-1 py-0 h-4"
                                                >
                                                    {event.eventType}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right text-[10px] text-muted-foreground">
                                                {format(parseISO(event.timestamp), 'MMM d, yyyy h:mm a')}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </DialogContent>
                </Dialog>

                <StatCard title="Feature Interactions" value={stats.totalClicks} icon={<MousePointer2 />} description="Total menu clicks recorded" />
                
                <Dialog>
                    <DialogTrigger asChild>
                        <div className="cursor-pointer transition-transform hover:scale-[1.02]">
                            <StatCard 
                                title="Unique Active Users" 
                                value={<span className="text-primary hover:underline">{stats.uniqueUsers}</span>} 
                                icon={<Activity />} 
                                description="Across all recorded events (click for details)" 
                            />
                        </div>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Active Users List</DialogTitle>
                            <DialogDescription>
                                A list of unique users who have interacted with the application.
                            </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="h-[300px] pr-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead className="text-right">Last Activity</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stats.activeUsersList.map((u, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-medium text-xs">{u.username}</TableCell>
                                            <TableCell className="text-right text-[10px] text-muted-foreground">
                                                {format(parseISO(u.lastSeen), 'MMM d, h:mm a')}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Popular Menu Options</CardTitle>
                        <CardDescription>Frequency of access for different application views.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ChartContainer config={{}}>
                                <BarChart data={stats.menuData} layout="vertical" margin={{ left: 20 }}>
                                    <CartesianGrid horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis 
                                        dataKey="name" 
                                        type="category" 
                                        tickLine={false} 
                                        axisLine={false}
                                        width={120}
                                        fontSize={12}
                                    />
                                    <Tooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="count" radius={4}>
                                        {stats.menuData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ChartContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Recent Activity</CardTitle>
                        <CardDescription>The last 10 actions performed in the app.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>User</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead className="text-right">Time</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.recentEvents.map((event, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="font-medium text-xs">{event.username || 'Anonymous'}</TableCell>
                                        <TableCell className="text-xs">
                                            {event.eventType === 'menu_click' ? `Clicked: ${event.menuId}` : event.eventType}
                                        </TableCell>
                                        <TableCell className="text-right text-[10px] text-muted-foreground">
                                            {format(parseISO(event.timestamp), 'MMM d, yyyy h:mm a')}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
