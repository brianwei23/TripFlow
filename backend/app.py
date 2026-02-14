from flask import Flask, jsonify, request
import requests
import os
from dotenv import load_dotenv
from flask_cors import CORS

load_dotenv()

app = Flask(__name__)
# Allow requests from Angular
CORS(app)

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

        Date: {data['date']}

        Time Range: {data['startTime']} - {data['endTime']}

        Activities:
        {data['activities']}

        Metrics: 
        {data['metrics']}

        Please give:
        - Tourist destination feedback and suggestions
        - Time management feedback
        - Budget feedback
        - Cost efficiency feedback
        - Feasibility
        - Overall planning score (1-100)
        - And anything else important
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
    Empty Slots: {data.get('emptySlots')}
    Existing Activities: {data.get('existingActivities')}
    Return EXACTLY VALID JSON. This means no markdown and no conversation.
    Start times must be in the time slot it's in. End times must be after start times but don't have to be in the time slot in question.
    Be a bit specific on activity locations and names. For example, you can include city name, state/province, or country in location. 
    DO NOT make new activities that are already existing in the existing activities list.
    Example format:
    {{
        "activities": [
            {{ "name": "Lunch at Disneyland", "start": "11:00", "end": "12:00", "expectedCost": 40, "location": "Disneyland Anaheim"}}
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

if __name__ == "__main__":
    app.run()