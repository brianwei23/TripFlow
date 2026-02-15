# TripFlow
**TripFlow** is a tool developed as a personal project for travelers around the world to plan their trips. It offers a clean and simple UI with helpful AI tools to plan your travels.

## Directions and Video Demo
To use **TripFlow** please enter https://tripflow-app-d3e2c.web.app/login. Then register your account with a valid email. Firebase will then send you a verification email. 

Once you log in, you can create a day and set up a time range. For each hour slot, you can add/edit an activity. Each activity contains a weather button which takes coordinates from the map. This feature only works if you select the location from the map. AI analyis and autofill buttons are at the top of the schedule page.

If the site is not live at the time that you see this or if you have any questions, then please view this video demonstration here: https://www.youtube.com/watch?v=8xslyBeis7I

## Features
* **Add/Edit Travel Activities**: Users can detail an activity's name, location (map selection), time, and expected/actual cost.
* **Trip Summary**: Compares difference between expected and actual costs and provides it in a thought-provoking format.
* **Weather**: Worried about the weather? You do not have to Google it. Users can simply click the "Weather" button for a comprehensive forecast.
* **AI Analysis**: Users can analyze the trip's feasibility, budget, and more!
* **AI Autofill**: If users run out of ideas during planning, they can ask AI to create activities which includes locations, times, and expected costs. Users can edit results to their satisfaction.
* **User Interface**: The site uses a very simple design and allows easy navigation. Users do not have to learn too much to use it. It also uses large font for travelers who have poor vision issues.
* **Cybersecurity**: The registration component uses email validation and strong password rules. Angular is used to prevent XSS (cross site scripting). Passwords are stored securely and never in plaintext.

## Tools Used
* **Angular**: Uses **Typscript** to create a clean frontend experience. Provides anti-XSS capabilities.
* **Flask**: Uses Python and the **REST API** to communicate with external APIs and client.
* **Firebase**: Provides authentication, storage database, and hosting for the frontend.
* **Render**: Hosts the Flask backend with automatic deployment.
* **WeatherAPI.com**: Efficiently provides a comprehensive forecast for any part of the world.
* **OpenRouter**: Provides numerous models to choose from for the site's AI features.
* **OpenStreetMap**: Allows users to view a map.
* **Leaflet**: Displays the map and allows user interaction.
* **Nominatim API**: Reverse geocoding to translate coordinates into a name