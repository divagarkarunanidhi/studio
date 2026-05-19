import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

/**
 * POST /api/mongo/planning-history
 * Queries the "Planning history" collection in the local bugsense MongoDB
 * for RateRecord values matching environment, solution, and scenario names.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { environment, solution, scenarioNames } = body;

        if (!environment || !solution || !scenarioNames || !Array.isArray(scenarioNames) || scenarioNames.length === 0) {
            return NextResponse.json({ error: 'Missing required fields: environment, solution, scenarioNames' }, { status: 400 });
        }

        const client = new MongoClient('mongodb://localhost:27017', {
            connectTimeoutMS: 10000,
            socketTimeoutMS: 10000,
        });

        await client.connect();
        const db = client.db('bugsense');
        const collection = db.collection('PlanningHistory');

        const results: { scenarioName: string; rateRecord: string }[] = [];

        for (const scenarioName of scenarioNames) {
            // Try exact match on all three fields first
            let doc = await collection.findOne({
                'Environment': { $regex: new RegExp(`^${escapeRegex(environment)}$`, 'i') },
                'Solution': { $regex: new RegExp(`^${escapeRegex(solution)}$`, 'i') },
                'Scenario Name': { $regex: new RegExp(escapeRegex(scenarioName), 'i') },
            });

            // Fallback: environment may be embedded in the value (e.g., "FORD_KOC_DEV" contains "dev")
            if (!doc) {
                doc = await collection.findOne({
                    'Environment': { $regex: new RegExp(escapeRegex(environment).split(/[_\\-]/).pop() || environment, 'i') },
                    'Solution': { $regex: new RegExp(escapeRegex(solution), 'i') },
                    'Scenario Name': { $regex: new RegExp(escapeRegex(scenarioName), 'i') },
                });
            }

            // Fallback: match only by scenario name if environment/solution don't match
            if (!doc) {
                doc = await collection.findOne({
                    'Scenario Name': { $regex: new RegExp(escapeRegex(scenarioName), 'i') },
                });
            }

            if (doc && doc.RateRecord) {
                results.push({ scenarioName, rateRecord: doc.RateRecord });
            }
        }

        await client.close();

        console.log(`Planning history query: env="${environment}", solution="${solution}", scenarios=${JSON.stringify(scenarioNames)}, found=${results.length}`);


        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        console.error('Planning history query error:', e);
        return NextResponse.json({ error: e.message || 'Failed to query Planning history' }, { status: 500 });
    }
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
