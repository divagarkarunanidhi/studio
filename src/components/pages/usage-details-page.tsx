'use client';

import { useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '../dashboard/stat-card';
import { Activity, MousePointer2, Users, Clock, History } from 'lucide-react';
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

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export function UsageDetailsPage() {
    const firestore = useFirestore();
    
    const usageColRef = useMemoFirebase(
        () => query(collection(firestore, 'usageEvents'), orderBy('timestamp', 'desc'), limit(1000)),
        [firestore]
    );
    
    const { data: events, isLoading } = useCollection<UsageEvent>(usageColRef);

    const stats = useMemo(() => {
        if (!events) return null;

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

        // Calculate hours (pulse = 5 mins)
        const totalMinutes = pulses.length * 5;
        const totalHours = (totalMinutes / 60).toFixed(1);

        // Reconstruct sessions: Group login/logout events and pulses chronologically
        const chronEvents = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        const sessionList: any[] = [];
        const activeSessions: Record<string, any> = {};

        chronEvents.forEach(e => {
            if (e.eventType === 'login') {
                // If there's an existing session that didn't logout, close it first
                if (activeSessions[e.userId]) {
                    sessionList.push({ ...activeSessions[e.userId], logout: 'Incomplete' });
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
                        duration: (activeSessions[e.userId].pulses * 5 / 60).toFixed(1)
                    };
                    sessionList.push(session);
                    delete activeSessions[e.userId];
                }
            }
        });

        // Add any remaining active sessions
        Object.values(activeSessions).forEach(s => {
            sessionList.push({ 
                ...s, 
                logout: 'Active', 
                duration: (s.pulses * 5 / 60).toFixed(1) 
            });
        });

        // Sort sessions by most recent login
        const sortedSessions = sessionList.sort((a, b) => b.login.localeCompare(a.login));

        // Group menu clicks
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
            totalHours,
            sessionHistory: sortedSessions,
            menuData,
            recentEvents: events.slice(0, 10)
        };
    }, [events]);

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

    if (!stats) return null;

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
                                                {session.duration}h
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {stats.sessionHistory.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                                                No session data recorded yet.
                                            </TableCell>
                                        </TableRow>
                                    )}
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
                                            <TableCell className="font-medium text-xs">{event.username}</TableCell>
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
                                    {stats.authEvents.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                                                No access events recorded.
                                            </TableCell>
                                        </TableRow>
                                    )}
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
                                    {stats.activeUsersList.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-center text-muted-foreground py-4">
                                                No active users found in history.
                                            </TableCell>
                                        </TableRow>
                                    )}
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
                                        <TableCell className="font-medium text-xs">{event.username}</TableCell>
                                        <TableCell className="text-xs">
                                            {event.eventType === 'menu_click' ? `Clicked: ${event.menuId}` : event.eventType}
                                        </TableCell>
                                        <TableCell className="text-right text-[10px] text-muted-foreground">
                                            {format(parseISO(event.timestamp), 'MMM d, h:mm a')}
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
