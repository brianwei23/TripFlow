from flask import Flask, jsonify, request
import requests
import os
from dotenv import load_dotenv
from flask_cors import CORS

if os.path.exists(".env"):
    load_dotenv()

print("Starting Flask app...")

app = Flask(__name__)
# Allow requests from Angular
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:4200",
            "https://tripflow-app-d3e2c.web.app",
            "https://tripflow-app-d3e2c.firebaseapp.com"
        ],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

@app.route("/api/weather", methods=["GET"])
def get_weather():
    lat = request.args.get("lat")
    lng = request.args.get("lng")
    target_date = request.args.get("date")

    if not lat or not lng:
        return jsonify({"error": "lat and lng are required"}), 400
    
    url = "https://api.weatherapi.com/v1/forecast.json"

    params = {
        "key": WEATHER_API_KEY,
        "q": f"{lat},{lng}",
        "dt": target_date,
        "aqi": "no",
        "alerts": "no"
    }

    try:
        response = requests.get(url, params=params)

        data = response.json()

        if response.status_code != 200:
            error_message = data.get("error", {}).get("message", "Unknown WeatherAPI error. You might have to make the date closer to the current day to view weather.")
            return jsonify({"error": error_message}), response.status_code

        location_data = data["location"]
        location_string = f"{location_data['name']}, {location_data['region']}, {location_data['country']}"

        forecast_day_info = data["forecast"]["forecastday"][0]

        # Return trimmed payload
        return jsonify({
            "location": location_string,
            "forecast": [forecast_day_info]
        })
    except Exception as e:
        return jsonify({"error": f"Weather API error: {str(e)}"}), 500
    
@app.route("/api/analyze-day", methods=["POST", "OPTIONS"])
def analyze_day():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
    
    data = request.json

    if not data:
        return jsonify({"error": "Missing data"}), 400
    
    if not OPENROUTER_API_KEY:
        print("Error: OPENROUTER API key is missing")
        return jsonify({"error": "Server missing API key"}), 500
    
    try:
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }

        prompt = f"""
        Analyze the travel schedule and give good advice:

        Date: {data.get('date', 'Unknown')}

        Activities:
        {data.get('activities', [])}

        Metrics: 
        {data.get('metrics', {})}

        Please give:
        - Tourist destination feedback and suggestions
        - Time management feedback
        - Budget feedback
        - Cost efficiency feedback
        - Feasibility
        - Best ways to navigate to each location/activity. Be specific.
        - Best airline and cheapest flights according to which month/date/time. Best hotels in the area. Make it specific to the situation.
        - Overall planning score (1-100)
        - And anything else important
        - REMEMBER all costs are in USD
        """

        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json={
                "model": "arcee-ai/trinity-mini:free",
                "messages": [
                    {
                        "role": "user", "content": prompt
                    }
                ]
            }
        )
        result = response.json()
        ai_message = result["choices"][0]["message"]["content"]
        return jsonify({"analysis": ai_message})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route("/api/autofill-day", methods=["POST", "OPTIONS"])
def autofill_day():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
    
    data = request.json
    location_context = data.get('locationContext', '')
    location_instruction = f"The trip is in {location_context}." if location_context else "Location is not specified."

    if not data:
        return jsonify({"error": "Missing data"}), 400

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:4200",
        "X-Title": "TripFlow"
    }

    prompt = f"""
    Task: Fill these empty time slots with travel activities.
    {location_instruction}
    Empty Slots: {data.get('emptySlots')}
    Existing Activities: {data.get('existingActivities')}
    Return EXACTLY VALID JSON. This means no markdown and no conversation.
    Start times must be in the time slot it's in. End times must be after start times but don't have to be in the time slot in question.
    Be a bit specific on activity locations and names. For example, you can include city name, state/province, or country in location. 
    Create accurate latitute and longitude coordinates for each location, and put it in the 'coords' object.
    DO NOT make new activities that are already existing in the existing activities list.
    DO NOT MAKE ANY REPEAT ACTIVITIES AT SAME LANDMARK!!! THERE ARE NO EXCEPTIONS TO THIS RULE.
    Make sure the schedule flows perfectly and is feasible. Make sure locations and landmarks are real. All costs are in USD.
    Example format:
    {{
        "activities": [
            {{ "name": "Lunch at Disneyland", "start": "11:00", "end": "12:00", "expectedCost": 40, "location": "Disneyland Anaheim", "coords": {{"lat": 43.2943, -203.4829}}}}
        ]
    }}
    """
    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json={
                "model": "nvidia/nemotron-3-nano-30b-a3b:free",
                "messages": [
                    {"role": "user", "content": prompt}
                ]
            }
        )

        if response.status_code != 200:
            return jsonify({"error": f"AI Provider Error: {response.status_code}"}), 500

        result = response.json()
        if "choices" in result and len(result["choices"]) > 0:
            content = result["choices"][0]["message"]["content"]
            return jsonify({"result": content})

        return jsonify({"error": "No AI response content"}), 500
    
    except Exception as e:
        print(f"Server Error: {e}")
        return jsonify({"error": str(e)}), 500
    
@app.route("/health")
def health():
    return "OK", 200

@app.route("/")
def home():
    return "TripFlow backend is running", 200