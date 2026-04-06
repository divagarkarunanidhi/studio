import sys
import json
import re
import os

def analyze_failure(logs):
    """
    Optimized Python Analysis Logic using feature-weighted scoring.
    This mimics a data science classification model by weighting 
    specific error signatures typical of complex QA environments.
    """
    if not logs:
        return "Automation script issue", "No logs provided for analysis."

    logs_lower = logs.lower()
    
    # Feature weights for each category
    scores = {
        "Functional Issue": 0,
        "Data Issue": 0,
        "Environment Issue": 0,
        "Automation script issue": 0
    }
    
    # --- Feature Extraction Patterns ---
    
    # 1. Functional: Business logic failures and assertions
    functional_keywords = [
        "assertionerror", "expected", "but found", "should be", 
        "mismatch", "logic", "failed to plan", "validation failed",
        "java.lang.assertionerror"
    ]
    for kw in functional_keywords:
        if kw in logs_lower: scores["Functional Issue"] += 2
    if "assertionerror" in logs_lower: scores["Functional Issue"] += 3
    
    # 2. Data: Missing records, invalid parameters, UI sync issues caused by missing data
    data_keywords = [
        "element not found", "no such element", "stale element", 
        "nullpointerexception", "invalid data", "record not found",
        "data integrity", "search results empty"
    ]
    for kw in data_keywords:
        if kw in logs_lower: scores["Data Issue"] += 2
    if "element not found" in logs_lower: scores["Data Issue"] += 2
    if "nullpointer" in logs_lower: scores["Data Issue"] += 3
    
    # 3. Environment: Network, Database down, service timeouts
    env_keywords = [
        "timeout", "timed out", "503", "504", "connection reset", 
        "refused", "unreachable", "service unavailable", "gateway",
        "socket exception", "read timed out"
    ]
    for kw in env_keywords:
        if kw in logs_lower: scores["Environment Issue"] += 2
    if re.search(r"http\s(502|503|504)", logs_lower): scores["Environment Issue"] += 5
    if "timed out" in logs_lower and "wait" not in logs_lower: scores["Environment Issue"] += 3
    
    # 4. Automation: Brittle selectors, driver errors, script framework issues
    auto_keywords = [
        "xpath", "css selector", "not interactable", "driver", 
        "session deleted", "window closed", "javascript error",
        "unexpected alert", "chrome not reachable"
    ]
    for kw in auto_keywords:
        if kw in logs_lower: scores["Automation script issue"] += 2
    if "driver" in logs_lower or "webdriver" in logs_lower: scores["Automation script issue"] += 3

    # --- Classification Decision ---
    
    # Identify the highest scoring category
    best_category = max(scores, key=scores.get)
    
    # If no features were matched, default to Automation for investigation
    if scores[best_category] == 0:
        return "Automation script issue", "Unknown error signature. Defaulting to script issue for manual triage."
        
    reasoning = {
        "Functional Issue": "Pattern suggests a functional regression or business rule assertion failure.",
        "Data Issue": "Error signature indicates a missing data record or UI state dependency issue.",
        "Environment Issue": "Infrastructure instability or network timeout detected.",
        "Automation script issue": "Likely a brittle selector or browser driver synchronization issue."
    }
    
    return best_category, reasoning[best_category]

def main():
    try:
        # Read JSON input from stdin (passed from the Node.js bridge)
        raw_input = sys.stdin.read()
        if not raw_input:
            return
            
        scenarios = json.loads(raw_input)
        classifications = []
        
        for s in scenarios:
            name = s.get('name', 'Unknown Scenario')
            logs = s.get('logs', '')
            
            # Apply optimized Python analytics
            category, reason = analyze_failure(logs)
            
            classifications.append({
                "scenarioName": name,
                "classification": category,
                "reasoning": f"Python Engine: {reason}"
            })
            
        # Output the structured JSON results to stdout
        print(json.dumps(classifications))
        
    except Exception as e:
        # Critical errors sent to stderr to avoid corrupting output
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
