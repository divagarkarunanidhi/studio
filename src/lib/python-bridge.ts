import { spawn } from 'child_process';
import path from 'path';

/**
 * Utility to call native Python scripts from the Next.js server context.
 * Communicates via JSON strings over standard I/O.
 * 
 * Optimized to attempt execution using 'python3' first, then falling back to 'python'
 * to accommodate different OS and container environments.
 */
export async function runPythonClassifier(scenarios: any[]): Promise<any[]> {
    const scriptPath = path.join(process.cwd(), 'src/scripts/failure_analysis.py');
    const input = JSON.stringify(scenarios);

    const spawnAndRun = (cmd: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn(cmd, [scriptPath]);
            
            let stdoutData = '';
            let stderrData = '';

            // Write the data to Python's stdin
            pythonProcess.stdin.write(input);
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
                    reject(new Error(`Python process exited with code ${code}. Error: ${stderrData}`));
                    return;
                }
                resolve(stdoutData);
            });

            // Handle process errors (e.g., Python not installed)
            pythonProcess.on('error', (err) => {
                reject(err);
            });
        });
    };

    try {
        // Attempt execution with python3 (Linux/macOS/Cloud default)
        const result = await spawnAndRun('python3');
        return JSON.parse(result);
    } catch (e: any) {
        // If python3 is missing, try python (Windows/Fallback)
        if (e.code === 'ENOENT') {
            try {
                const result = await spawnAndRun('python');
                return JSON.parse(result);
            } catch (e2: any) {
                // If both fail, throw descriptive error for the flow to handle
                throw new Error(`Failed to start Python process: spawn python3/python ENOENT.`);
            }
        }
        throw e;
    }
}
