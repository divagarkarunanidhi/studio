
import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";
import { Collection } from "mongodb";

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

// Helper to get unique labels from the collection using an aggregation pipeline
const getUniqueLabels = async (collection: Collection, labelColumns: string[]): Promise<string[]> => {
    if (labelColumns.length === 0) return [];
    
    // Unwind the testCases array
    const pipeline: any[] = [{ $unwind: "$testCases" }];

    // Project the label fields and combine them
    const projectStage: any = { _id: 0 };
    const labelArrays: any[] = [];
    labelColumns.forEach(col => {
        const arrayField = `labelArray_${col}`;
        projectStage[arrayField] = { $split: [`$testCases.${col}`, ","] };
        labelArrays.push(`$${arrayField}`);
    });
    projectStage.allLabels = { $concatArrays: labelArrays };
    pipeline.push({ $project: projectStage });
    
    // Unwind the combined labels array
    pipeline.push({ $unwind: "$allLabels" });
    
    // Trim whitespace from labels
    pipeline.push({ $project: { label: { $trim: { input: "$allLabels" } } } });

    // Group to get unique labels
    pipeline.push({ $group: { _id: "$label" } });
    
    // Filter out null or empty string labels
    pipeline.push({ $match: { _id: { $ne: null, $ne: "" } } });

    // Sort the labels
    pipeline.push({ $sort: { _id: 1 } });
    
    const result = await collection.aggregate(pipeline).toArray();

    return result.map(item => item._id);
};

// Helper for distribution calculation using aggregation
const getDistribution = async (collection: Collection, labels: string[], labelColumns: string[]) => {
    if (!labels || labels.length === 0) return [];

    const pipeline: any[] = [
        { $unwind: "$testCases" },
        // Add a field that is a concatenated string of all label values for easy searching
        {
            $addFields: {
                "searchableLabels": {
                    $concat: labelColumns.map(col => ({ $ifNull: [{ $concat: [" ,", `$testCases.${col}`] }, ""] }))
                }
            }
        }
    ];

    const matchQueries = labels.map(label => ({
        "searchableLabels": { $regex: `\\b${label}\\b`, $options: "i" }
    }));

    pipeline.push({ $match: { $and: matchQueries } });

    const result = await collection.aggregate(pipeline).toArray();
    
    return result.map(doc => doc.testCases);
};


// Helper for reusability calculation using aggregation
const getReusability = async (collection: Collection, reusedInLabel: string, reusedFromLabels: string[], labelColumns: string[]) => {
    if (!reusedInLabel || !reusedFromLabels || reusedFromLabels.length === 0) {
        return { count: 0, testCases: [] };
    }

    const pipeline: any[] = [
        { $unwind: "$testCases" },
         // Add a field that is a concatenated string of all label values for easy searching
        {
            $addFields: {
                "searchableLabels": {
                    $concat: labelColumns.map(col => ({ $ifNull: [{ $concat: [" ,", `$testCases.${col}`] }, ""] }))
                }
            }
        }
    ];

    const matchConditions = {
        $and: [
            { "searchableLabels": { $regex: `\\b${reusedInLabel}\\b`, $options: "i" } },
            { 
                $or: reusedFromLabels.map(fromLabel => ({
                    "searchableLabels": { $regex: `\\b${fromLabel}\\b`, $options: "i" }
                }))
            }
        ]
    };

    pipeline.push({ $match: matchConditions });
    
    const result = await collection.aggregate(pipeline).toArray();
    const testCases = result.map(doc => doc.testCases);

    return { count: testCases.length, testCases };
};


export async function POST(request: Request) {
    try {
        const { clientPromise, dbName } = await getMongoDetails();
        const client = await clientPromise;
        const db = client.db(dbName);
        const collection = db.collection("testCases");

        const body = await request.json();
        const { selectedFilterLabels, reusedFromLabels, reusedInLabel } = body;

        // Fetch the latest test case document to get headers and total count
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

        // Perform calculations using aggregation pipelines in parallel
        const [
            uniqueLabels,
            distributionTestCases,
            reusabilityData
        ] = await Promise.all([
            getUniqueLabels(collection, labelColumns),
            selectedFilterLabels && selectedFilterLabels.length > 0 ? getDistribution(collection, selectedFilterLabels, labelColumns) : Promise.resolve([]),
            getReusability(collection, reusedInLabel, reusedFromLabels, labelColumns)
        ]);

        // Server-side Distribution Calculation from aggregated results
        const distributionMap: { name: string; count: number, testCases: any[] }[] = [];
        if (selectedFilterLabels && selectedFilterLabels.length > 0) {
            if (distributionTestCases.length > 0) {
                distributionMap.push({ name: `Matching all (${selectedFilterLabels.join(' & ')})`, count: distributionTestCases.length, testCases: distributionTestCases });
            }
        }
        
        return NextResponse.json({
            distribution: distributionMap,
            reusability: reusabilityData,
            totalTestCases: testCases.length,
            uniqueLabels: uniqueLabels,
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
    
