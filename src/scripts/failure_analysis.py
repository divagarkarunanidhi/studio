import sys
import json
import os

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.naive_bayes import MultinomialNB
    from sklearn.pipeline import Pipeline
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

# Baseline training data for the Scikit-Learn classifier
# These examples provide the 'knowledge base' for the model to learn error signatures
TRAINING_DATA = [
    # Functional Issues: Business logic failures and assertions
    ("AssertionError: Expected 'Success' but found 'Error'", "Functional Issue"),
    ("java.lang.AssertionError: validation failed for shipment cost", "Functional Issue"),
    ("Logic mismatch: total count does not match sub-items", "Functional Issue"),
    ("Expected 5 orders to plan but found 3", "Functional Issue"),
    ("mismatch in invoice amount: expected 100.00 but got 120.50", "Functional Issue"),
    
    # Data Issues: Missing records, invalid parameters, or UI element absence
    ("Element 'login_button' not found in 30s", "Data Issue"),
    ("NoSuchElementException: Unable to locate element: //input[@id='id']", "Data Issue"),
    ("StaleElementReferenceException: element is not attached to the page document", "Data Issue"),
    ("NullPointerException at data.provider.fetch(DataProvider.java:42)", "Data Issue"),
    ("Record with ID '778' not found in search results", "Data Issue"),
    ("Invalid input data: 'ShipmentDate' cannot be in the past", "Data Issue"),
    
    # Environment Issues: Network, Database down, service timeouts
    ("HTTP 503 Service Unavailable: Database cluster unreachable", "Environment Issue"),
    ("ConnectionTimeout: Max retries exceeded with url", "Environment Issue"),
    ("SocketTimeoutException: Read timed out", "Environment Issue"),
    ("504 Gateway Timeout", "Environment Issue"),
    ("ECONNREFUSED: connection refused by remote host", "Environment Issue"),
    ("Service response took longer than 60000ms", "Environment Issue"),
    
    # Automation Issues: Brittle selectors, driver errors, script framework issues
    ("WebDriverException: chrome not reachable", "Automation script issue"),
    ("InvalidSelectorException: The given selector is invalid", "Automation script issue"),
    ("JavascriptError: Cannot read property 'click' of undefined", "Automation script issue"),
    ("SessionNotCreatedException: session not created: This version of ChromeDriver only supports Chrome version 114", "Automation script issue"),
    ("element click intercepted: Element is not clickable at point", "Automation script issue"),
    ("stale element reference: element is not attached to the page document", "Automation script issue"),
]

def train_model():
    """
    Initializes and trains a Multinomial Naive Bayes model using TF-IDF vectorization.
    """
    if not SKLEARN_AVAILABLE:
        return None
    
    texts, labels = zip(*TRAINING_DATA)
    
    # Create a pipeline that combines feature extraction with the classifier
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(
            stop_words='english', 
            ngram_range=(1, 2), # Look at single words and pairs
            min_df=1
        )),
        ('clf', MultinomialNB()),
    ])
    
    pipeline.fit(texts, labels)
    return pipeline

def analyze_failures_with_sklearn(scenarios, model):
    """
    Uses the trained Scikit-Learn model to predict failure categories.
    """
    results = []
    
    # Extract logs from scenarios, handling potential nulls
    logs = [s.get('logs', '') or 'No logs captured' for s in scenarios]
    
    # Perform predictions and get confidence scores
    predictions = model.predict(logs)
    probabilities = model.predict_proba(logs)
    classes = model.classes_.tolist()

    for i, s in enumerate(scenarios):
        name = s.get('name', 'Unknown Scenario')
        classification = predictions[i]
        
        # Identify the probability score for the chosen class
        class_idx = classes.index(classification)
        confidence = probabilities[i][class_idx]
        
        results.append({
            "scenarioName": name,
            "classification": classification,
            "reasoning": f"Scikit-Learn Engine: Categorized as '{classification}' with {confidence:.2%} confidence using TF-IDF NLP model."
        })
    
    return results

def analyze_failures_fallback(scenarios):
    """
    Simple heuristic fallback if scikit-learn is not installed in the environment.
    """
    results = []
    for s in scenarios:
        name = s.get('name', 'Unknown Scenario')
        logs = (s.get('logs', '') or '').lower()
        
        if any(kw in logs for kw in ["assertion", "expected", "found", "mismatch"]):
            cat, reason = "Functional Issue", "Heuristic: Detected assertion failure pattern."
        elif any(kw in logs for kw in ["element", "locate", "nullpointer", "stale"]):
            cat, reason = "Data Issue", "Heuristic: Detected UI locator or data reference issue."
        elif any(kw in logs for kw in ["503", "504", "timeout", "refused", "unreachable"]):
            cat, reason = "Environment Issue", "Heuristic: Detected network or service timeout."
        else:
            cat, reason = "Automation script issue", "Heuristic: General script triage required."
            
        results.append({
            "scenarioName": name,
            "classification": cat,
            "reasoning": f"Python Fallback: {reason} (Scikit-Learn package missing from runtime)"
        })
    return results

def main():
    try:
        # Read input scenarios from the Node.js bridge
        raw_input = sys.stdin.read()
        if not raw_input:
            return
            
        scenarios = json.loads(raw_input)
        
        if SKLEARN_AVAILABLE:
            # High-accuracy ML path
            model = train_model()
            results = analyze_failures_with_sklearn(scenarios, model)
        else:
            # Deterministic fallback path
            results = analyze_failures_fallback(scenarios)
            
        # Return structured results to Node.js
        print(json.dumps(results))
        
    except Exception as e:
        # Pass technical errors to stderr
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
