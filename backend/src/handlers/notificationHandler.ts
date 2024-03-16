import {
  Client,
  ColorResolvable,
  Colors,
  EmbedBuilder,
  Guild,
} from "discord.js";
import { setTimeout } from "timers/promises";
import logger from "../../lib/logger";
import { WARTIMER_ICON_LINK } from "../common/constant";
import Database from "../db/database";
import { DBGuild } from "../common/types/dbGuild";
import Bot from "../bot";

type NotificationResponse = {
  type: "sent" | "nochannel" | "error" | "duplicate";
  info?: string;
};

const DUPLICATE_PROTECTION_STRENGTH = 3; // How many previous notifications should be checked for duplicates
const notificationMap: {
  guildId: string;
  notifications: string[];
  logs: string[];
}[] = [];
export const UPDATE_SOURCE_SERVER_ID = "979269592360837120"; // Wartimer Development Server
export const UPDATE_SOURCE_CHANNEL_ID = "1151202146268741682"; // Wartimer Development Server Update Channel

export class NotificationHandler {
  public static async startListening(): Promise<void> {
    //! Disabled until the message content privilige is granted by discord or a web-based solution is implemented
    // const sourceChannel = await client.guilds.fetch(UPDATE_SOURCE_SERVER_ID)
    //     .then((guild) => guild.channels.fetch(UPDATE_SOURCE_CHANNEL_ID))
    //     .catch(() => undefined);
    // if(!sourceChannel) return Promise.reject('Unable to find update source channel at ' + `Server ID: ${UPDATE_SOURCE_SERVER_ID} Channel ID: ${UPDATE_SOURCE_CHANNEL_ID}`);
    // if(!sourceChannel.isTextBased()) return Promise.reject('Update source channel is not a text channel!');
    // sourceChannel.createMessageCollector().on('collect', (message) => {
    //     message.fetch().then(async (message) => {
    //         if(message.embeds.length === 0){
    //             logger.info('Collected message from update channel with no embeds!');
    //             return;
    //         }
    //         const dbGuilds = await Database.queryGuilds({
    //             'notificationChannelId': { $regex: /\d+/ }
    //         });
    //         for (const dbGuild of dbGuilds) {
    //             await client.guilds.fetch(dbGuild.id)
    //                 .then((guild) => dbGuild.notificationChannelId ? guild.channels.fetch(dbGuild.notificationChannelId) : undefined)
    //                 .catch(() => undefined)
    //                 .then(async (channel) => {
    //                     if (!channel || !channel.isTextBased()) {
    //                         dbGuild.notificationChannelId = undefined;
    //                         return dbGuild.save();
    //                     } else {
    //                         return channel.send({
    //                             embeds: message.embeds.map((embed) => EmbedBuilder.from(embed).setTimestamp())
    //                         });
    //                     }
    //                 })
    //                 .then(() => {
    //                     logger.info(`[${dbGuild.name}] Received Update`)
    //                 })
    //                 .then(() => setTimeout(2000))
    //                 .catch(logger.error);
    //         }
    //     }).catch(() => logger.error('Unable to fetch dev update message!'));
    // })
  }
  public static async sendNotification(
    dbGuild: DBGuild,
    title: string,
    text: string,
    options?: {
      color?: ColorResolvable;
      byPassDuplicateCheck?: boolean;
    }
  ): Promise<NotificationResponse> {
    const previousGuildNotificationMap = notificationMap.find(
      (prev) => prev.guildId === dbGuild.id
    );
    if (
      !options?.byPassDuplicateCheck &&
      previousGuildNotificationMap?.notifications.includes([title, text].join())
    ) {
      return Promise.resolve({
        type: "duplicate",
      });
    }

    if (dbGuild.notificationChannelId) {
      const guild = await Bot.client.guilds.fetch(dbGuild.id);
      const channel = await guild.channels.fetch(dbGuild.notificationChannelId);
      if(!channel?.isTextBased() || !channel.permissionsFor(Bot.user)){}
    }
    return dbGuild.notificationChannelId
      ? Bot.client.channels
          .fetch(dbGuild.notificationChannelId)
          .then(async (channel) => {
            if (!channel || !channel.isTextBased()) {
              dbGuild.notificationChannelId = undefined;
              return dbGuild.save().then(() => Promise.reject(text));
            } else {
              return channel
                .send({
                  embeds: [
                    new EmbedBuilder()
                      .setAuthor({
                        iconURL: WARTIMER_ICON_LINK,
                        name: "Respawn Timer Notification",
                      })
                      .setTitle(title)
                      .setDescription(text)
                      .setColor(options?.color ?? Colors.Red)
                      .setTimestamp(),
                  ],
                })
                .then(() => {
                  logger.debug("[" + dbGuild.name + "][Notification] " + title);
                  if (!previousGuildNotificationMap) {
                    notificationMap.push({
                      guildId: dbGuild.id,
                      notifications: [[title, text].join()],
                      logs: [],
                    });
                  } else {
                    if (
                      previousGuildNotificationMap.notifications.length >=
                      DUPLICATE_PROTECTION_STRENGTH
                    ) {
                      previousGuildNotificationMap.notifications.pop();
                    }
                    previousGuildNotificationMap.notifications.push(
                      [title, text].join()
                    );
                  }
                });
            }
          })
          .then(
            () =>
              ({
                type: "sent",
              } as NotificationResponse)
          )
          .catch(
            (e) =>
              ({
                type: "error",
                info: e.toString(),
              } as NotificationResponse)
          )
      : new Promise((res) => {
          if (
            !previousGuildNotificationMap?.logs.includes([title, text].join())
          ) {
            logger.debug("[" + dbGuild.name + "] Notification (log): " + title);

            if (!previousGuildNotificationMap) {
              notificationMap.push({
                guildId: dbGuild.id,
                notifications: [],
                logs: [[title, text].join()],
              });
            } else {
              if (
                previousGuildNotificationMap.logs.length >=
                DUPLICATE_PROTECTION_STRENGTH
              ) {
                previousGuildNotificationMap.logs.pop();
              }
              previousGuildNotificationMap.logs.push([title, text].join());
            }
          }
          res({ type: "nochannel" });
        });
  }
}
