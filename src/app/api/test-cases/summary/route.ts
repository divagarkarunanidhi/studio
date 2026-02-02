import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";
import { Collection } from "mongodb";

// Helper to get unique labels from the collection using an aggregation pipeline
const getUniqueLabels = async (collection: Collection, labelColumns: string[]): Promise<string[]> => {
    if (labelColumns.length === 0) return [];
    
    // This pipeline correctly unnests all labels from all label columns,
    // trims them, and returns a unique, sorted list.
    const pipeline: any[] = [
        // Deconstruct the testCases array field from the input documents to output a document for each element.
        { $unwind: "$testCases" },
        // Project a new field that concatenates all label columns into a single string
        {
            $project: {
                _id: 0,
                allLabelsString: {
                    $concat: labelColumns.map(col => ({ $concat: [{ $ifNull: [`$testCases.${col}`, ""] }, ","] }))
                }
            }
        },
        // Split the concatenated string into an array of labels
        {
            $project: {
                labels: { $split: ["$allLabelsString", ","] }
            }
        },
        // Unwind the new labels array
        { $unwind: "$labels" },
        // Trim whitespace from each label
        {
            $project: {
                trimmedLabel: { $trim: { input: "$labels" } }
            }
        },
        // Group by the trimmed label to get unique values
        { $group: { _id: "$trimmedLabel" } },
        // Filter out any null or empty string results
        { $match: { _id: { $ne: null, $ne: "" } } },
        // Sort the unique labels alphabetically
        { $sort: { _id: 1 } },
        // Final projection to get just the name
        { $project: { name: "$_id", _id: 0 } }
    ];
    
    const result = await collection.aggregate(pipeline).toArray();

    return result.map(item => item.name);
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

    const matchQueries = labels.map(label => {
        // Escape special characters for regex and trim input
        const escapedLabel = label.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return {
            "searchableLabels": { $regex: `\\b${escapedLabel}\\b`, $options: "i" }
        };
    });

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

    const escapedInLabel = reusedInLabel.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchConditions = {
        $and: [
            { "searchableLabels": { $regex: `\\b${escapedInLabel}\\b`, $options: "i" } },
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

        // Perform primary calculations in parallel
        const [
            uniqueLabels,
            intersectionTestCases, // Intersection: test cases matching ALL selected labels
            reusabilityData
        ] = await Promise.all([
            getUniqueLabels(collection, labelColumns),
            selectedFilterLabels && selectedFilterLabels.length > 0 ? getDistribution(collection, selectedFilterLabels, labelColumns) : Promise.resolve([]),
            getReusability(collection, reusedInLabel, reusedFromLabels, labelColumns)
        ]);

        const distributionMap: { name: string; count: number, testCases: any[] }[] = [];
        
        if (selectedFilterLabels && selectedFilterLabels.length > 0) {
            // 1. Add the intersection slice ("Matching all")
            if (intersectionTestCases.length > 0) {
                distributionMap.push({ 
                    name: `Matching all (${selectedFilterLabels.join(' & ')})`, 
                    count: intersectionTestCases.length, 
                    testCases: intersectionTestCases 
                });
            }

            // 2. Add individual slices for each selected label to show their total counts
            const individualSlices = await Promise.all(selectedFilterLabels.map(async (label) => {
                const results = await getDistribution(collection, [label], labelColumns);
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
