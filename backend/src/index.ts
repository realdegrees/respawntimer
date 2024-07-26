import Bot from "./bot";
import { config } from "dotenv";
import { install } from "source-map-support";
import logger from "../lib/logger";
import { RespawnInterval } from "./respawnInterval";
import Database from "./db/database";
import { DBGuild } from "./common/types/dbGuild";
import { cleanGuilds } from "./db/clean";
import { INVITE_SETTINGS } from "./commands/invite";
import { Widget } from "./widget";
import { RaidhelperIntegration } from "./raidhelperIntegration";
import { NotificationHandler } from "./handlers/notificationHandler";
import { MAX_INACTIVE_DAYS } from "./common/constant";
import { setTimeout } from "timers/promises";
install();
config();

const logStats = (guildsDb: DBGuild[]): void => {
  logger.info(
    "Total Guilds in Database: " +
      guildsDb.length +
      "\n- " +
      guildsDb.map((guild) => guild.name).join("\n- ") +
      "\n"
  );
  logger.info(
    "Recently Active Guilds (3d): " +
      guildsDb.filter(
        (guild) =>
          guild.lastActivity &&
          Date.now() - guild.lastActivity.getTime() < 1000 * 60 * 60 * 24 * 3
      ).length
  );
  logger.info(
    "Guilds with Notifications enabled: " +
      guildsDb.filter((guild) => guild.notificationChannelId).length
  );
  logger.info(
    "Guilds with active Raidhelper Integration: " +
      guildsDb.filter((guild) => guild.raidHelper.apiKey).length
  );
  logger.info(
    "Guilds with Custom Respawn Timings: " +
      guildsDb.filter((guild) => guild.customTimings).length
  );
};

Promise.resolve()
  .then(() => Database.init())
  .then(() => Bot.init())
  .then(async () => {
    // Log invite link
    logger.info("Invite | " + Bot.client.generateInvite(INVITE_SETTINGS));

    // Remove discord servers from DB taht have been inactive or where bot is not a member anymore
    let dbGuilds = await Database.getAllGuilds();

    //logStats(dbGuilds);

    //TODO check why no workey
    // const guildsCleaned = await cleanGuilds(bot.client, dbGuilds, MAX_INACTIVE_DAYS);
    // guildsCleaned.forEach((clean) => logger.info(`[${clean.name}] ${clean.reason}`))

    // Start polling interval for all guilds
    dbGuilds = await Database.getAllGuilds();
    for (const dbGuild of dbGuilds) {
      if (dbGuild.raidHelper.apiKey) {
        RaidhelperIntegration.start(dbGuild);
        await setTimeout(100);
      }
    }
    RaidhelperIntegration.startRaidhelperMessageCollector();

    // Start respawn interval
    RespawnInterval.startInterval();
    await NotificationHandler.startListening();

    // Load existing widgets
    //await Widget.loadExisting();
  })
  .catch((error) => {
    logger.error("Unable to start!");
    logger.error(error);
    process.exit(0);
  });
