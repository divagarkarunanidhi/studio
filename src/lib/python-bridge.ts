import { spawn } from 'child_process';
import path from 'path';

/**
 * Utility to call native Python scripts from the Next.js server context.
 * Communicates via JSON strings over standard I/O.
 */
export async function runPythonClassifier(scenarios: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
        // Path to your Python script
        const scriptPath = path.join(process.cwd(), 'src/scripts/failure_analysis.py');
        
        // Attempt to spawn the Python process
        // Note: Use 'python3' for Linux/macOS environments common in cloud deployments
        const pythonProcess = spawn('python3', [scriptPath]);
        
        let stdoutData = '';
        let stderrData = '';

        // Write the data to Python's stdin
        pythonProcess.stdin.write(JSON.stringify(scenarios));
        pythonProcess.stdin.end();

        // Capture data from Python's stdout
        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        // Capture errors from Python's stderr
        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                // If Python failed, we reject so the flow can fall back to AI
                reject(new Error(`Python process exited with code ${code}. Error: ${stderrData}`));
                return;
            }
            
            try {
                // Parse the JSON result from Python
                const results = JSON.parse(stdoutData);
                resolve(results);
            } catch (err) {
                reject(new Error(`Failed to parse Python JSON output: ${stdoutData}`));
            }
        });

        // Handle process errors (e.g., Python not installed)
        pythonProcess.on('error', (err) => {
            reject(new Error(`Failed to start Python process: ${err.message}`));
        });
    });
}
