
'use client';

import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, doc, updateDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Skeleton } from "../ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Users } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';
import { useToast } from "@/hooks/use-toast";
import type { WithId } from "@/firebase/firestore/use-collection";

interface UserProfile {
    id: string;
    username: string;
    email: string;
    role: 'admin' | 'taas' | 'view' | 'newuser';
}

const ROLES: UserProfile['role'][] = ['admin', 'taas', 'view', 'newuser'];

function RoleSelector({ user }: { user: WithId<UserProfile> }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const handleRoleChange = async (newRole: UserProfile['role']) => {
        const userRef = doc(firestore, 'users', user.id);
        try {
            await updateDoc(userRef, { role: newRole });
            toast({
                title: 'Role Updated',
                description: `${user.username}'s role has been changed to ${newRole}.`,
            });
        } catch (error) {
            console.error("Failed to update role:", error);
            toast({
                variant: 'destructive',
                title: 'Update Failed',
                description: `Could not update role for ${user.username}.`,
            });
        }
    };

    return (
        <Select value={user.role} onValueChange={handleRoleChange}>
            <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
                {ROLES.map(role => (
                    <SelectItem key={role} value={role}>
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                    </SelectItem>
                ))}
            </SelectContent>
      </Select>
    )
}

export function UserManagementPage() {
    const firestore = useFirestore();
    const usersColRef = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
    const { data: users, isLoading, error } = useCollection<UserProfile>(usersColRef);

    return (
        <Card>
            <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>A list of all users registered in the application.</CardDescription>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive">
                        <Users className="h-4 w-4" />
                        <AlertTitle>Failed to load users</AlertTitle>
                        <AlertDescription>
                            Could not retrieve the user list. Please check your connection and permissions.
                        </AlertDescription>
                    </Alert>
                )}
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Username</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                        <TableCell><Skeleton className="h-9 w-28" /></TableCell>
                                    </TableRow>
                                ))
                            ) : users && users.length > 0 ? (
                                users.map(user => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">{user.username}</TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            <RoleSelector user={user} />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center">
                                        No users found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}
