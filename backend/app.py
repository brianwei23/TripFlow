from flask import Flask, jsonify, request
import requests
import os
from dotenv import load_dotenv
from flask_cors import CORS

load_dotenv()

app = Flask(__name__)
# Allow requests from Angular
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:4200"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})
WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")

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

if __name__ == "__main__":
    app.run(debug=True, port=5000)