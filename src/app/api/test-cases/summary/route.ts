import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";
import { Collection, ObjectId } from "mongodb";

// Helper to get unique labels from the collection for a specific file, filtering for Issue Type = Test
const getUniqueLabels = async (collection: Collection, fileId: ObjectId, labelColumns: string[]): Promise<string[]> => {
    if (labelColumns.length === 0) return [];
    
    const pipeline: any[] = [
        { $match: { _id: fileId } },
        { $unwind: "$testCases" },
        { $match: { "testCases.Issue Type": "Test" } },
        {
            $project: {
                _id: 0,
                allLabelsString: {
                    $concat: labelColumns.map(col => ({ $concat: [{ $ifNull: [`$testCases.${col}`, ""] }, ","] }))
                }
            }
        },
        {
            $project: {
                labels: { $split: ["$allLabelsString", ","] }
            }
        },
        { $unwind: "$labels" },
        {
            $project: {
                trimmedLabel: { $trim: { input: "$labels" } }
            }
        },
        { $group: { _id: "$trimmedLabel" } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { _id: 1 } },
        { $project: { name: "$_id", _id: 0 } }
    ];
    
    const result = await collection.aggregate(pipeline).toArray();
    return result.map(item => item.name);
};


// Helper for distribution calculation, filtering for Issue Type = Test
const getDistribution = async (collection: Collection, fileId: ObjectId, labels: string[], labelColumns: string[]) => {
    if (!labels || labels.length === 0) return [];

    const pipeline: any[] = [
        { $match: { _id: fileId } },
        { $unwind: "$testCases" },
        { $match: { "testCases.Issue Type": "Test" } },
        {
            $addFields: {
                "searchableLabels": {
                    $concat: labelColumns.map(col => ({ $ifNull: [{ $concat: [" ,", `$testCases.${col}`] }, ""] }))
                }
            }
        }
    ];

    const matchQueries = labels.map(label => {
        const escapedLabel = label.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return {
            "searchableLabels": { $regex: `\\b${escapedLabel}\\b`, $options: "i" }
        };
    });

    pipeline.push({ $match: { $and: matchQueries } });
    
    const result = await collection.aggregate(pipeline).toArray();
    return result.map(doc => doc.testCases);
};


// Helper for reusability calculation, filtering for Issue Type = Test
const getReusability = async (collection: Collection, fileId: ObjectId, reusedInLabels: string[], reusedFromLabels: string[], labelColumns: string[]) => {
    if (!reusedInLabels || reusedInLabels.length === 0 || !reusedFromLabels || reusedFromLabels.length === 0) {
        return { count: 0, testCases: [] };
    }

    const pipeline: any[] = [
        { $match: { _id: fileId } },
        { $unwind: "$testCases" },
        { $match: { "testCases.Issue Type": "Test" } },
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
            { 
                $or: reusedInLabels.map(inLabel => {
                    const escapedIn = inLabel.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    return { "searchableLabels": { $regex: `\\b${escapedIn}\\b`, $options: "i" } };
                })
            },
            { 
                $or: reusedFromLabels.map(fromLabel => {
                    const escapedFrom = fromLabel.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    return { "searchableLabels": { $regex: `\\b${escapedFrom}\\b`, $options: "i" } };
                })
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
        const { selectedFilterLabels, reusedFromLabels, reusedInLabels } = body;

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
        
        const fileId = latestFile[0]._id;
        const allTestCases = latestFile[0].testCases;
        
        // Filter test cases to only include those with Issue Type = "Test" for counts and headers
        const testCases = allTestCases.filter((tc: any) => tc['Issue Type'] === 'Test');
        
        const allHeaders = Object.keys(allTestCases[0] || {});
        const labelColumns = allHeaders.filter(h => h.toLowerCase().startsWith('label')).sort();

        // Perform primary calculations in parallel, passing the fileId and Issue Type filter
        const [
            uniqueLabels,
            intersectionTestCases,
            reusabilityData
        ] = await Promise.all([
            getUniqueLabels(collection, fileId, labelColumns),
            selectedFilterLabels && selectedFilterLabels.length > 0 ? getDistribution(collection, fileId, selectedFilterLabels, labelColumns) : Promise.resolve([]),
            getReusability(collection, fileId, reusedInLabels, reusedFromLabels, labelColumns)
        ]);

        const distributionMap: { name: string; count: number, testCases: any[] }[] = [];
        
        if (selectedFilterLabels && selectedFilterLabels.length > 0) {
            if (intersectionTestCases.length > 0) {
                distributionMap.push({ 
                    name: `Matching all (${selectedFilterLabels.join(' & ')})`, 
                    count: intersectionTestCases.length, 
                    testCases: intersectionTestCases 
                });
            }

            const individualSlices = await Promise.all(selectedFilterLabels.map(async (label) => {
                const results = await getDistribution(collection, fileId, [label], labelColumns);
                return {
                    name: `Total for '${label}'`,
                    count: results.length,
                    testCases: results
                };
            }));
            
            distributionMap.push(...individualSlices);
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
