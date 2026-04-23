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
            },
            timeout=110
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

    existing_raw = data.get('existingActivities', [])
    existing_names = [act.get('name', '') for act in existing_raw if act.get('name')]
    day_index = data.get('dayIndex', 0)
    used_cities = data.get('usedCities', [])
    used_cities_str = ', '.join(used_cities) if used_cities else 'None'

    prompt = f"""
    Task: Fill these empty time slots with travel activities for day {day_index + 1}. Make it so that it fills MOST of the day between 7AM and 9PM.
    {location_instruction}
    Empty Slots: {data.get('emptySlots')}
    ALREADY VISITED LOCATIONS: {existing_names}
    Cities visited in previous days, in order: {used_cities_str}

    1. You can only return activities between 7 AM and 9 PM. Fill in the entire day during that period. 6-9 activities each day.
    2. DO NOT suggest any landmarks or points of interest listed in the ALREADY VISITED LOCATIONS above. Pick entirely different areas/attractions
    to ensure variety. You can consider activities in nearby surrounding areas too.
    3. Return EXACTLY VALID JSON. This means no markdown and no conversation.
    4. Be a bit specific on activity locations and names. For example, you can include city name, state/province, or country in location. 
    Location must also include the name of the point of interest.
    5. Create ACCURATE latitute and longitude coordinates for each location, and put it in the 'coords' object.
    6. Make sure the schedule flows perfectly and is feasible. Make sure locations and landmarks are real. All costs are in USD.
    7. Make sure to suggest points of interest in various areas in the location provided and not to focus only on one city/area. For example, if Australia is the location, it should contain activities in Sydney, Darwin, Perth, Melbourne, etc.
       You must pick a different city or region from these cities already used: {used_cities_str}.
    8. Look at the last city and the previous cities visited in the list above. Pick a city that is logical to travel to next. Do not start jumping back and forth. Ensure a smooth trip.
    9. Think like an actual traveler when considering previous cities already visited and their order. Minimize backtracking and unnecessary long-haul travel between days. Make sure not to stay in one area but to go explore other areas in the country/region in question for a well-rounded trip.
    10. Do not reuse cities from previous days unless there is a good reason to.
    Example format:
    {{
        "activities": [
            {{ "name": "Lunch at Disneyland", "start": "11:00", "end": "12:00", "expectedCost": 40, "location": "Disneyland Anaheim", "coords": {{"lat": 43.2943, "lng": -203.4829}}}}
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
            },
            timeout=110
        )

        if response.status_code != 200:
            print(f"OpenRouter error {response.status_code}: {response.text}")
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