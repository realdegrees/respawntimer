#!/bin/bash

# Function to prompt for input if not provided
prompt_for_input() {
    local prompt_message=$2
    local input_value

    read -rp "$prompt_message:"$'\n> ' input_value
    echo "$input_value"
}

API_KEY=$(prompt_for_input "API_KEY" "Please enter your API_KEY")
GUILD_ID=$(prompt_for_input "GUILD_ID" "Please enter your GUILD_ID")

# Make the API request
response=$(curl -s -w "%{http_code}" -o /dev/null -H "Authorization: $API_KEY" -H "IncludeSignUps: false" "https://raid-helper.dev/api/v3/servers/$GUILD_ID/events")

# Check the response code
if [ "$response" -eq 401 ]; then
    echo "Unauthorized: The API key provided is not valid."
elif [ "$response" -eq 404 ]; then
    echo "Not Found: The GUILD_ID was not found or the API is down."
elif [ "$response" -eq 200 ]; then
    echo "The API key is valid."
else
    echo "An unknown error occurred. Response code: $response"
fi