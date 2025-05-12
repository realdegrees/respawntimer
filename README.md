> **⚠️ Warning**
> This project is no longer actively maintained. While you are welcome to use, fork, or build upon it, please be aware that no further updates will be provided. I will still provide basic support for issues that can be solved without updating the project on the support discord.


# Description

Respawn Timer is a discord bot that provides accurate respawn timers for wars in New World.
It is simple to use, highly customizable and can be automated fully.
With the Raidhelper integration you only have to set it up once and the bot will automatically join voice
when a Raidhelper event starts.

# Live Version

**[Public Bot Link](https://discord.com/api/oauth2/authorize?client_id=993116789284286484&scope=bot+applications.commands&permissions=2100224)**

If you don't want to deploy your own instance via docker or node or just want to test the bot you can use the public instance of the bot at the risk of it being down for a few minutes whenever I update it. I try to only update it at times when there are no wars in EU timezones.  
I will maintain this bot as long as I actively play the game.

# Features

## ✒️ Widget
![Widget Showcase GIF](https://i.imgur.com/cpi0L8O.png)
![Widget Showcase GIF](https://i.imgur.com/worHkbh.gif)

Create a text widget with `/create` that allows full control over the bot and provides quick access to the settings as well.  

The widget shows important information about upcoming respawns, amount of remaining respawns and the duration of the current next respawn duration. While the widget is not active it will display information about the next scheduled event *if* the Raidhelper Integration is enabled.

The text widget is just for convenience, if you only want to setup the raidhelper integration for example you can use `/settings` for the setup without ever creating a widget.
## 📌 Raidhelper Integration
![Raidhelper Integration Showcase](https://i.imgur.com/0mO6RTW.png)

You can connect [Raidhelper](https://raid-helper.dev/) by using `/apikey show` to get your API key and then set the key within the Respawn Timer Bot settings. By default the bot will then scan for new Raidhelper events every 5 minutes and schedule them if **Auto-Join** is enabled.

The bot will then automatically join the voice channel that is specified in the Raidhelper Event settings - or the **Default Voice Channel** if the event doesn't have a voice channel option - 5 seconds before the war begins.
## 📝 Customizable Respawn Timestamps
![Custom Timestamp Showcase](https://i.imgur.com/66k3KAc.png)  

*Customized Timestamps are highlighted*   
![Custom Timestamp Highlights Showcase](https://i.imgur.com/0fohut1.png)  

By default the voice announcements use a set of timestamps that have been field tested by multiple companies over hundreds of wars. Over the course of the development of this bot I have reviewed and compared the timestamps with dozens of VoDs and can confirm that the announcements are always correct.



*(New World has always had the issue that your respawn timer runs slower the less FPS you have in the death screen. This was especially apparent in the time period where frames dropped below 5-10 for almost everyone when entering the death screen. This can sometimes lead to the timer being off for someone who has low FPS. The majority of players will spawn at the exact timestamp though)*
dsfdsfdfs

## 🔊 Voice Selection
The bot currently offers several unique voices for audio announcements.  
They can be simply be changed with a drop-down menu in the settings even while the bot is already in your voice channel.
## 🔒 Permissions
![Permission Showcase](https://i.imgur.com/uL5PB5t.png)

You can set **Editor** and **Assistant** roles. **Editor** roles have full access to the bot and can edit the settings while **Assistant** roles can only use the buttons on the widget to toggle the text and voice announcements.

## 🔔 Notifications
Set a dedicated notification channel in the **Notification Settings** to get notfied when the bot encounters problems like missing permissions or when events get de-/scheduled. You will also receive important app updates here.
# 🐋 Deployment - Docker
You can create your own docker image of this app by building the [Dockerfile](Dockerfile), or use an automatically created image from [GitHub packages](https://github.com/realdegrees/angry-generator/pkgs/container/angry-generator).

To start a container run `docker run -d -e DISCORD_CLIENT_TOKEN='<Token>' -e DISCORD_CLIENT_ID='<ID>' ghcr.io/realdegrees/respawntimer`  
A mongo instance is required to run the bot, the corresponding environment variables are listed in the provided [docker-compose.yml](docker-compose.example.yml).


# Deployment - Node
1. Clone the repo
2. Run `pnpm install` in `backend`
3. Create `.env` in `backend` with following content:
```
MONGO_HOST="localhost"
MONGO_PORT="27017"
MONGO_USER=
MONGO_PASS=
DISCORD_CLIENT_TOKEN="<token>"
DISCORD_CLIENT_ID="<id>"
OWNER_ID="<id>"
TZ="Europe/Berlin"
```
4. Run `pnpm run start:build`
