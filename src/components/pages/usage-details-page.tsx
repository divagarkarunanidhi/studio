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
        
        // Count unique users
        const uniqueUsers = new Set(events.map(e => e.userId)).size;

        // Calculate hours (pulse = 5 mins)
        const totalMinutes = pulses.length * 5;
        const totalHours = (totalMinutes / 60).toFixed(1);

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
            loginEvents: logins,
            uniqueUsers,
            totalHours,
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
                <StatCard title="Total Application Hours" value={`${stats.totalHours} hrs`} icon={<Clock />} description="Based on active session pulses" />
                
                <Dialog>
                    <DialogTrigger asChild>
                        <div className="cursor-pointer transition-transform hover:scale-[1.02]">
                            <StatCard 
                                title="User Logins" 
                                value={<span className="text-primary hover:underline">{stats.totalLogins}</span>} 
                                icon={<Users />} 
                                description="Total login events (click to view)" 
                            />
                        </div>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>User Login History</DialogTitle>
                            <DialogDescription>
                                A detailed list of recent user login events tracked by the system.
                            </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="h-[400px] pr-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead className="text-right">Login Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stats.loginEvents.map((login, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="font-medium text-xs">{login.username}</TableCell>
                                            <TableCell className="text-right text-[10px] text-muted-foreground">
                                                {format(parseISO(login.timestamp), 'MMM d, yyyy h:mm a')}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {stats.loginEvents.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-center text-muted-foreground py-4">
                                                No login events recorded.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </DialogContent>
                </Dialog>

                <StatCard title="Feature Interactions" value={stats.totalClicks} icon={<MousePointer2 />} description="Total menu clicks recorded" />
                <StatCard title="Unique Active Users" value={stats.uniqueUsers} icon={<Activity />} description="Across all recorded events" />
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
