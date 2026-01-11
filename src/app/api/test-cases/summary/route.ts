
import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";

// Helper function to get all labels from a test case
const getTCLabelsAsSet = (tc: any, labelColumns: string[]): Set<string> => {
    const labels = new Set<string>();
    labelColumns.forEach(col => {
        if (tc[col]) {
            tc[col].split(',').forEach((l: string) => labels.add(l.trim()));
        }
    });
    return labels;
};


export async function POST(request: Request) {
    try {
        const { clientPromise, dbName } = await getMongoDetails();
        const client = await clientPromise;
        const db = client.db(dbName);
        const collection = db.collection("testCases");

        const body = await request.json();
        const { selectedFilterLabels, reusedFromLabels, reusedInLabel } = body;

        // Fetch the latest test case document
        const latestFile = await collection.find({}).sort({ _id: -1 }).limit(1).toArray();

        if (latestFile.length === 0 || !latestFile[0].testCases) {
            return NextResponse.json({
                distribution: [],
                reusability: { count: 0, testCases: [] },
                totalTestCases: 0,
                uniqueLabels: [],
                headers: [],
            });
        }
        
        const testCases = latestFile[0].testCases;
        const allHeaders = Object.keys(testCases[0] || {});
        const labelColumns = allHeaders.filter(h => h.toLowerCase().startsWith('label')).sort();

        // Calculate unique labels
        const uniqueLabels = new Set<string>();
        for (const testCase of testCases) {
            for (const col of labelColumns) {
                const value = testCase[col];
                if (value && value.trim() !== '') {
                    const labels = value.split(',').map((l: string) => l.trim());
                    for (const label of labels) {
                        if (label) uniqueLabels.add(label);
                    }
                }
            }
        }
        const sortedUniqueLabels = Array.from(uniqueLabels).sort();

        // Server-side Distribution Calculation
        const distributionMap: { name: string; count: number, testCases: any[] }[] = [];
        if (selectedFilterLabels && selectedFilterLabels.length > 0) {
            const allMatchingTcs = testCases.filter((tc: any) => {
                const tcLabels = getTCLabelsAsSet(tc, labelColumns);
                return selectedFilterLabels.every((l: string) => tcLabels.has(l));
            });
            if (allMatchingTcs.length > 0) {
                distributionMap.push({ name: `Matching all (${selectedFilterLabels.join(' & ')})`, count: allMatchingTcs.length, testCases: allMatchingTcs });
            }
            selectedFilterLabels.forEach((label: string) => {
                const tcsWithLabel = testCases.filter((tc: any) => getTCLabelsAsSet(tc, labelColumns).has(label));
                if (tcsWithLabel.length > 0) {
                    distributionMap.push({ name: `Total for '${label}'`, count: tcsWithLabel.length, testCases: tcsWithLabel });
                }
            });
        }

        // Server-side Reusability Calculation
        let reusabilityData = { count: 0, testCases: [] };
        if (reusedInLabel && reusedFromLabels && reusedFromLabels.length > 0) {
            const matchingTestCases = testCases.filter((tc: any) => {
                const tcLabels = getTCLabelsAsSet(tc, labelColumns);
                const hasReusedInLabel = tcLabels.has(reusedInLabel);
                const hasReusedFromLabel = reusedFromLabels.some((fromLabel: string) => tcLabels.has(fromLabel));
                return hasReusedInLabel && hasReusedFromLabel;
            });
            reusabilityData = { count: matchingTestCases.length, testCases: matchingTestCases };
        }

        return NextResponse.json({
            distribution: distributionMap,
            reusability: reusabilityData,
            totalTestCases: testCases.length,
            uniqueLabels: sortedUniqueLabels,
            headers: allHeaders,
        });

    } catch (e: any) {
        console.error("Failed to fetch test case summary:", e);
        return NextResponse.json(
            { error: "Failed to fetch test case summary.", details: e.toString() },
            { status: 500 }
        );
    }
}

    