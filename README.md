# Prerequisites
- Node (v14+)

# Setup
- Clone the repository
- Open the [backend](backend) folder in terminal
- Run `npm install`

## Environment Variables
Setting up the environment variables is essential for the project to run.
You can create a file named `.env` in the [backend](backend) folder to provide the required environment variables.

In production the environment variables should not be passed with the `.env` file.  
It is preferred to use a secure solution like a docker container.

### Discord bot token
1. Get the client token from your discord bot
2. Copy the client token and save it in an environment variable named `DISCORD_CLIENT_TOKEN`

Example
```env
DISCORD_CLIENT_TOKEN="**************"
```
### Firebase config
1. [Get your firebase config object](https://support.google.com/firebase/answer/7015592)
2. Copy the firebase config object and save it in an environemnt variables named `FIREBASE_CONFIG`
3. Replace all `'` with `"`
4. Add `"` around all property names
5. Join everything into one line (_hint:_ In VSCode highlight the object -> `Ctrl+Shift+P` -> `Join Lines`)

Example (Multiline for readability)
```env
FIREBASE_CONFIG="{
    "apiKey": "***************",
    "authDomain": "***************",
    "databaseURL": "***************",
    "projectId": "***************",
    "storageBucket": "***************",
    "messagingSenderId": "***************",
    "appId": "***************"
}"
```
### Testing server id
`!! Only relevant if you want to run tests !!`

discord.js does not provide mock methods for testing purposes.  
In order to run tests you need to mock the actual Discord API.

1. Create a discord server for testing
2. Copy the guild ID and save it in an environemnt variables named `TEST_GUILD_ID`

# Usage
- Open the [backend](backend) folder in terminal
- Run `npm run build`
- Run `npm start`
- Converse with the bot

# Development  
For rapid development you can use the VSCode debugging tool.
- Run `npm run build:watch` to start `tsc` in watch mode
- Navigate to the debug tab in VSCode
- Select the `Debug Bot (Backend)` task and run it

# Testing  
If you want to run automated tests on a fork
- Add the above environment variables to the repo's secrets
If you want to run manual tests on your machine
- Run `npm test` in [backend](backend)

The Bot now runs in debug mode, any changes to the program will automatically restart the bot.
