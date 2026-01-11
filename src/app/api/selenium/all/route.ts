
import { NextResponse } from "next/server";
import { getMongoDetails } from "@/lib/mongodb";
import { NextRequest } from "next/server";

// Helper function to find a test case by its name from a cached list
const findTestCaseByName = (scenarioName: string, testCases: any[]): any | null => {
    if (!scenarioName || !testCases) return null;
    const cleanedScenarioName = scenarioName.trim().toLowerCase();
    // Assuming 'Summary' is the field in testCases that matches the scenario name
    const matchingTestCase = testCases.find(tc => 
        tc.Summary?.trim().toLowerCase() === cleanedScenarioName
    );
    return matchingTestCase || null;
};

// Helper function to find a defect ID for a given test case ID
const findDefectIdForTestCase = (testCaseId: string | null, testCases: any[]): string | null => {
    if (!testCaseId || !testCases) return null;
    const matchingTC = testCases.find(tc => tc['Issue key'] === testCaseId);
    // This field name seems specific, ensure it's correct
    return matchingTC ? (matchingTC['Outward issue link (Agile Hive Dependency Link)'] || null) : null;
};

// Helper function to process a single report document
const processReport = (report: any, testCaseDetails: any[]) => {
    let totalTests = 0;
    let passed = 0;
    let totalExecutionTime = 0;
    const detailedScenarios: any[] = [];
    let jobName = "N/A";
    let executionTimestamp = report.uploadedAt;

    if (report.test_results && report.test_results.length > 0) {
        jobName = report.test_results[0].name || "N/A";

        if (report.test_results[0].elements && report.test_results[0].elements.length > 0) {
            const firstScenario = report.test_results[0].elements[0];
            if (firstScenario.start_timestamp) {
                executionTimestamp = firstScenario.start_timestamp;
            }
        }

        report.test_results.forEach((feature: any) => {
            if (feature.elements) {
                feature.elements.forEach((scenario: any) => {
                    totalTests++;
                    const status = scenario.steps.some((step: any) => step.result.status === 'failed') ? 'failed' : 'passed';
                    if (status === 'passed') {
                        passed++;
                    }
                    
                    const testCase = findTestCaseByName(scenario.name, testCaseDetails);
                    const testCaseId = testCase ? testCase['Issue key'] : null;
                    const defectId = findDefectIdForTestCase(testCaseId, testCaseDetails);

                    detailedScenarios.push({
                        id: scenario.name,
                        name: scenario.name,
                        status: status,
                        testCaseId: testCaseId,
                        defectId: defectId,
                    });

                    scenario.steps.forEach((step: any) => {
                        const duration = step.result?.duration?.$numberLong;
                        if (duration) {
                            totalExecutionTime += Number(duration);
                        }
                    });
                });
            }
        });
    }

    return {
        id: report._id.toString(),
        solution: report.solution || 'N/A',
        jobName: jobName,
        totalTests,
        passed,
        failed: totalTests - passed,
        scenarios: detailedScenarios,
        totalExecutionTime,
        rawReport: report, // Keep raw report for detailed modal view
        domain: report.solution || "N/A",
        environment: report.environment || "N/A",
        uploadedAt: executionTimestamp,
    };
};

export async function GET(request: NextRequest) {
  try {
    const { clientPromise, dbName } = await getMongoDetails();
    const client = await clientPromise;
    const db = client.db(dbName);
    const reportsCollection = db.collection("seleniumReports");
    const testCasesCollection = db.collection("testCases");

    // Fetch pagination parameters from the request URL
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const skip = (page - 1) * limit;

    // Fetch the latest test case file once
    const latestTestCaseFile = await testCasesCollection.find({}).sort({ _id: -1 }).limit(1).toArray();
    const testCaseDetails = latestTestCaseFile[0]?.testCases || [];

    // Fetch the total count of reports and the paginated reports in parallel
    const [total, reports] = await Promise.all([
        reportsCollection.countDocuments(),
        reportsCollection.find({}).sort({ uploadedAt: -1 }).skip(skip).limit(limit).toArray()
    ]);
    
    // Process each report using the fetched test case details
    const processedReports = reports.map(report => processReport(report, testCaseDetails));

    return NextResponse.json({ reports: processedReports, total });
    
  } catch (e: any) {
    console.error("Failed to fetch selenium reports:", e);
    return NextResponse.json(
      { error: "Failed to fetch reports.", details: e.toString() },
      { status: 500 }
    );
  }
}

    