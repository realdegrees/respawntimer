import { setTimeout as promiseTimeout } from "timers/promises";
import {
  RaidhelperAPIEvent,
  ScheduledEvent,
} from "./common/types/raidhelperEvent";
import { Client, Colors, Guild } from "discord.js";
import logger from "../lib/logger";
import { Widget } from "./widget";
import audioManager from "./handlers/audioManager";
import { NotificationHandler } from "./handlers/notificationHandler";
import { DBGuild } from "./common/types/dbGuild";
import Database from "./db/database";
import { formatEvents } from "./util/formatEvents";
import { RAIDHELPER_USER_ID } from "./common/constant";
import { roundUpHalfHourUnix } from "./util/formatTime";

const RETRY_ATTEMPT_DUR_MIN = 1;
const RETRY_INTERVAL_SECONDS = 5;
const GRACE_PERIOD_MINUTES = 20; // Amount of time that events are checked in the past (e.g. if raidhelper is set to pre-war meeting time)
const pollingRetries: {
  [guildId: string]: number;
} = {};
export class RaidhelperIntegration {
  public static startRaidhelperMessageCollector(guild: Guild): void {
    const messageCreateEvent = guild.client.on(
      "messageCreate",
      async (message) => {
        if (message.author.id !== RAIDHELPER_USER_ID || message.type !== 20) {
          return;
        }
        try {
          const dbGuild = await Database.getGuild(guild);
          if (!dbGuild.raidHelper.apiKey) {
            await messageCreateEvent.destroy();
            return;
          }
          await promiseTimeout(1000);
          await this.poll(guild, dbGuild, false);
        } catch (err) {
          logger.error(`[${guild.name}] Autopoll on messageCreate failed`);
        }
      }
    );
    const messageDeleteEvent = guild.client.on(
      "messageDelete",
      async (message) => {
        if (message.author?.id !== RAIDHELPER_USER_ID || message.type !== 0) {
          return;
        }
        try {
          const dbGuild = await Database.getGuild(guild);
          if (!dbGuild.raidHelper.apiKey) {
            await messageDeleteEvent.destroy();
            return;
          }
          await promiseTimeout(10000);
          await this.poll(guild, dbGuild, false);
        } catch (err) {
          logger.error(`[${guild.name}] Autopoll on messageDelete failed`);
        }
      }
    );
  }
  public static start(guild: Guild, dbGuild: DBGuild): void {
    this.poll(guild, dbGuild);
    this.startRaidhelperMessageCollector(guild);
  }
  public static async poll(
    guild: Guild,
    dbGuild: DBGuild,
    interval = true
  ): Promise<void> {
    if (!dbGuild.raidHelper.apiKey) {
      logger.info(`[${guild.name}] No API Key! Polling stopped.`);
      return;
    }

    let retryAfterAwaited = false;
    try {
      // poll
      const events = await this.getEvents(dbGuild);
      await this.onFetchEventSuccess(guild, dbGuild, events);
      logger.debug("Event Poll Success");
    } catch (response) {
      dbGuild.raidHelper.apiKeyValid = false;

      if (guild) {
        await RaidhelperIntegration.onFetchEventError(guild, dbGuild);
      }

      if (response instanceof Response) {
        switch (response.status) {
          case 429:
            const retryAfter = response.headers.get("retry-after");

            if (retryAfter) {
              const retryDate = new Date(retryAfter);
              const diff = retryDate.getTime() - Date.now();
              logger.error(
                `[${guild.name}] Too many requests! Retrying in ${Math.round(
                  diff / 1000
                )}s (${retryDate})`
              );
              await promiseTimeout(diff);
              retryAfterAwaited = true;
            } else {
              logger.error(
                `[${guild.name}] Too many requests! \nHeaders: ${[
                  ...response.headers.entries(),
                ].toString()}`
              );
            }

            break;

          case 401:
            pollingRetries[dbGuild.id] = (pollingRetries[dbGuild.id] ?? 0) + 1;
            if (pollingRetries[dbGuild.id] > 10) {
              dbGuild.raidHelper.apiKey = undefined;
              dbGuild.raidHelper.apiKeyValid = false;
              pollingRetries[dbGuild.id] = 0;
              logger.error(
                `[${guild.name}] Unsetting API Key. Too many unauthorized requests!`
              );
            }
            break;

          default:
            logger.error(
              `[${guild.name}] ${response.status}: ${
                response.statusText
              }\nHeaders: ${[...response.headers.entries()].toString()}`
            );
        }
      }
    } finally {
      await dbGuild.save();
      if (!retryAfterAwaited) {
        const timeout = 1000 * 60 * 45;
        await promiseTimeout(timeout);
      }
      if (guild && (interval || retryAfterAwaited)) {
        // Refresh dbGuild data and start next poll
        Database.getGuild(guild)
          .then((dbGuild) => this.poll(guild, dbGuild, interval))
          .catch(logger.error);
      }
    }
  }

  public static async onFetchEventSuccess(
    guild: Guild | undefined,
    dbGuild: DBGuild,
    events: ScheduledEvent[]
  ): Promise<void> {
    // Reset retries
    pollingRetries[dbGuild.id] = 0;
    const oldEvents = [...dbGuild.raidHelper.events];
    dbGuild.raidHelper.apiKeyValid = true;
    dbGuild.raidHelper.events = events;
    await dbGuild.save();

    try {
      // Send notification if apiKey vas previously not valid
      if (
        guild &&
        dbGuild.raidHelper.apiKey &&
        !dbGuild.raidHelper.apiKeyValid
      ) {
        await NotificationHandler.sendNotification(
          guild,
          dbGuild,
          "Raidhelper Integration",
          "Raidhelper API key validated ✅\nThis channel will now receive updates about scheduled events!",
          { color: Colors.Green, byPassDuplicateCheck: true }
        );
      }

      if (guild) {
        await RaidhelperIntegration.sendEventNotifications(
          guild,
          dbGuild,
          events,
          oldEvents
        ).catch(logger.error);

        const widget = await Widget.find(
          guild,
          dbGuild.widget.messageId,
          dbGuild.widget.channelId
        );
        if (!widget?.getTextState()) {
          const currentlyScheduledEvent =
            dbGuild.raidHelper.events.length > 0
              ? dbGuild.raidHelper.events.reduce((lowest, current) =>
                  Math.abs(current.startTimeUnix * 1000 - Date.now()) <
                  Math.abs(lowest.startTimeUnix * 1000 - Date.now())
                    ? current
                    : lowest
                )
              : undefined;
          const previouslyScheduledEvent =
            oldEvents.length > 0
              ? oldEvents.reduce((lowest, current) =>
                  Math.abs(current.startTimeUnix * 1000 - Date.now()) <
                  Math.abs(lowest.startTimeUnix * 1000 - Date.now())
                    ? current
                    : lowest
                )
              : undefined;
          const isNewEvent =
            currentlyScheduledEvent && !previouslyScheduledEvent;
          const isNoEvent = events.length === 0;
          const isSameEvent =
            currentlyScheduledEvent &&
            previouslyScheduledEvent &&
            currentlyScheduledEvent.id === previouslyScheduledEvent.id;
          const hasChangedProperties =
            isSameEvent &&
            currentlyScheduledEvent.lastUpdatedUnix !==
              previouslyScheduledEvent.lastUpdatedUnix;

          if (
            isNewEvent ||
            isNoEvent ||
            (isSameEvent && hasChangedProperties)
          ) {
            await widget?.update({ force: true });
          }
        }
      }
    } catch (e) {
      logger.error(
        `[${dbGuild.name}] Failed to send onFetchEventSucess notifications!`
      );
    }
  }
  private static async onFetchEventError(
    guild: Guild | null,
    dbGuild: DBGuild
  ): Promise<void> {
    try {
      if (guild) {
        const message =
          "Failed to fetch new Raidhelper events!\n" +
          "Check your Raidhelper Integration settings in `/settings`\n" +
          "If this issue persists set a new API key in `Raidhelper Integration Settings`";

        // Send notification
        await NotificationHandler.sendNotification(
          guild,
          dbGuild,
          "Raidhelper Integration Error",
          message,
          { color: Colors.Red }
        );

        // Update widget to reflect that API key is not valid
        const widget = await Widget.find(
          guild,
          dbGuild.widget.messageId,
          dbGuild.widget.channelId
        );
        if (!widget?.getTextState()) {
          await widget?.update({ force: true });
        }
      }
    } catch (e) {
      logger.error(
        "Error while handling updateEventStatus error: " +
          (e instanceof Error ? e.message : e?.toString?.()) || "Unknown"
      );
    }
  }
  /**
   * @param guild
   * @param dbGuild
   * @param events event list returned from the raidhelper api
   * @returns
   */
  public static async sendEventNotifications(
    guild: Guild,
    dbGuild: DBGuild,
    events: ScheduledEvent[],
    oldEvents: ScheduledEvent[]
  ): Promise<void> {
    // request events
    if (!dbGuild) return Promise.reject();

    // return if there is no change in events
    if (
      oldEvents.every((oldEvent) =>
        events.find((event) => event.id === oldEvent.id)
      ) &&
      events.every((event) =>
        oldEvents.find((oldEvent) => event.id === oldEvent.id)
      )
    )
      return;

    // Check for old events that have been descheduled and notify
    const descheduledEvents = oldEvents.filter(
      (event) => !events.find((newEvent) => newEvent.id === event.id)
    );
    if (descheduledEvents.length !== 0 && guild) {
      await this.notifyDescheduledEvents(descheduledEvents, dbGuild, guild);
      logger.info(`[${dbGuild.name}] Sent descheduled events notification`);
    }

    // Check for new events and notify
    const newEvents = events.filter(
      (event) => !oldEvents.find((oldEvent) => oldEvent.id === event.id)
    );
    if (newEvents.length !== 0) {
      await this.notifyScheduledEvents(newEvents, dbGuild, guild);
      logger.info(`[${dbGuild.name}] Sent scheduled events notification`);
    }
  }
  /**
   * Notify guild in notification channel about newly scheduled events
   * @param events
   * @param dbGuild
   * @param guild
   */
  private static async notifyScheduledEvents(
    events: ScheduledEvent[],
    dbGuild: DBGuild,
    guild: Guild
  ): Promise<void> {
    const scheduledEvents = await formatEvents(guild, ...events);
    const info = `${
      scheduledEvents.some((ev) => ev.includes("⚠️"))
        ? " ≫ *Missing Some Permissions*"
        : ""
    }`;
    await NotificationHandler.sendNotification(
      guild,
      dbGuild,
      `**New Event${scheduledEvents.length > 1 ? "s" : ""} Scheduled**`,
      `${info}\n${scheduledEvents.map((e) => `- ${e}`).join("\n")}`,
      { color: Colors.Green, byPassDuplicateCheck: true }
    ).catch(logger.error);
  }
  /**
   * Notify guild in notification channel about descheduled events
   * @param events
   * @param dbGuild
   * @param guild
   */
  private static async notifyDescheduledEvents(
    events: ScheduledEvent[],
    dbGuild: DBGuild,
    guild: Guild
  ): Promise<void> {
    const scheduledEvents = await formatEvents(guild, ...events);
    await NotificationHandler.sendNotification(
      guild,
      dbGuild,
      `**Event${scheduledEvents.length > 1 ? "s" : ""} Descheduled**`,
      `${scheduledEvents.map((e) => `- ${e}`).join("\n")}`,
      { color: Colors.DarkOrange, byPassDuplicateCheck: true }
    ).catch(logger.error);
  }
  public static async interval(client: Client): Promise<void> {
    const date = new Date();
    const seconds = date.getSeconds();

    // Only run interval every few seconds
    if (seconds % RETRY_INTERVAL_SECONDS !== 0) return;

    try {
      const dbGuilds = await Database.getAllGuilds();
      // Get guilds with an API Key from DB and filter out those with events starting soon
      let guilds = dbGuilds.map((dbGuild) => ({
        db: dbGuild,
        client: client.guilds.cache.find(
          (clientGuild) => clientGuild.id === dbGuild.id
        ),
      }));

      // Get guilds with an API Key from DB and filter out those with events starting soon
      guilds = guilds.filter((guild) =>
        guild.db.raidHelper.events.find((event) => {
          const warStartTime = roundUpHalfHourUnix(event.startTimeUnix);
          // Past events = negative diff, Future events = positive diff
          const diff = warStartTime * 1000 - Date.now();
          const diffSeconds = diff / 1000;
          const diffMinutes = diffSeconds / 60;

          const isWithinFutureThreshold = diffSeconds >= 0 && diffSeconds <= 30;
          const isWithinPastThreshold =
            diffMinutes <= 0 && diffMinutes >= RETRY_ATTEMPT_DUR_MIN * -1;

          return isWithinFutureThreshold || isWithinPastThreshold;
        })
      );

      // for each guild find the closest event and attempt to start the widget and voice
      for (const guild of guilds) {
        if (!guild.client) return;
        if (!guild.db.raidHelper.enabled && !guild.db.raidHelper.widget) return;
        const event = guild.db.raidHelper.events.reduce((lowest, current) =>
          Math.abs(current.startTimeUnix * 1000 - Date.now()) <
          Math.abs(lowest.startTimeUnix * 1000 - Date.now())
            ? current
            : lowest
        );

        // Try to find a widget
        const widget = await Widget.find(
          guild.client,
          guild.db.widget.messageId,
          guild.db.widget.channelId
        );

        // Voice Start
        try {
          // Connect to voice if not connected and auto-join is enabled
          if (
            guild.db.raidHelper.enabled &&
            !audioManager.isConnected(guild.client, guild.db)
          ) {
            let channel;
            if (event.voiceChannelId) {
              channel = await guild.client.channels.fetch(event.voiceChannelId);
            } else if (guild.db.raidHelper.defaultVoiceChannelId) {
              channel = await guild.client.channels.fetch(
                guild.db.raidHelper.defaultVoiceChannelId
              );
            }

            if (!channel)
              throw new Error(
                "No voice channel specified in event and no default voice channel set"
              );
            if (!channel.isVoiceBased())
              throw new Error(`${channel} is not a voice channel.`);

            await (widget
              ? widget.toggleVoice({
                  dbGuild: guild.db,
                  channel,
                })
              : audioManager.connect(channel, guild.db));
            logger.info(
              `[${guild.db.name}] Joined voice via raidhelper integration`
            );
          }
        } catch (e) {
          await NotificationHandler.sendNotification(
            guild.client,
            guild.db,
            `Voice Error`,
            `Error while attempting to join channel\nfor scheduled event **${
              event.title
            }**\n\n${
              (e instanceof Error ? e.message : e?.toString?.()) ||
              "Unknown Error"
            }`
          ).catch(logger.error);
        }

        // Widget Start
        try {
          // Attempt to start widget if auto-widget is enabled
          if (guild.db.raidHelper.widget) {
            if (widget) {
              if (widget.getTextState() || widget.getResettingState()) return; // It's already on or currently resetting
              await widget.toggleText(true);
              logger.info(
                `[${guild.db.name}] Started widget via raidhelper integration`
              );
            } else {
              await NotificationHandler.sendNotification(
                guild.client,
                guild.db,
                `Raidhelper Integration`,
                `Tried to enable text-widget for scheduled event\n**${event.title}**\n\n**Auto-Widget is enabled but I can't find a widget to enable.**`,
                { color: Colors.DarkOrange }
              ).catch(logger.error);
            }
          }
        } catch (e) {
          await NotificationHandler.sendNotification(
            guild.client,
            guild.db,
            `Widget Error`,
            `Error while attempting to enable text-widget\nfor scheduled event **${
              event.title
            }**\n\n${
              (e instanceof Error ? e.message : e?.toString?.()) ||
              "Unknown Error"
            }`
          ).catch(logger.error);
        }
      }
    } catch (e) {
      logger.error(
        "Error in raidhelper integration interval. " +
          (e instanceof Error ? e.message : e?.toString?.()) || "Unknown Error"
      );
    }
  }

  /**
   * Retrieves new events and returns them
   * @param guild
   * @returns
   * @throws {Response}
   */
  public static async getEvents(dbGuild: DBGuild): Promise<ScheduledEvent[]> {
    if (!dbGuild.raidHelper.apiKey) {
      return Promise.reject("Raidhelper API Key not set.");
    }
    const serversEventsUrl = `https://raid-helper.dev/api/v3/servers/${dbGuild.id}/events`;
    const startTimeFilter: number = Math.round(
      Date.now() / 1000 - 60 * GRACE_PERIOD_MINUTES
    );

    const header = new Headers();
    header.set("Authorization", dbGuild.raidHelper.apiKey);
    header.set("IncludeSignups", "false");
    header.set("StartTimeFilter", startTimeFilter.toString());
    if (dbGuild.raidHelper.eventChannelId) {
      header.set("ChannelFilter", dbGuild.raidHelper.eventChannelId);
    }

    return fetch(serversEventsUrl, {
      headers: header,
    })
      .then((res) => (res.ok ? res : Promise.reject(res)))
      .then((res) => res.json())
      .then(
        async (data: {
          postedEvents?: Omit<RaidhelperAPIEvent, "advancedSettings">[];
        }) => {
          if (!data.postedEvents) {
            return [];
          }
          const newEvents: ScheduledEvent[] = [];
          for (const postedEvent of data.postedEvents) {
            const scheduledEvent = dbGuild.raidHelper.events.find(
              (scheduledEvent) => scheduledEvent.id === postedEvent.id
            );
            if (
              scheduledEvent &&
              scheduledEvent.lastUpdatedUnix === postedEvent.lastUpdated
            ) {
              // use the scheduled event
              newEvents.push(scheduledEvent);
            } else {
              while (true) {
                try {
                  // If there was already a saved event reuse that instead of fetching it again (This doesn't update the voicechannel but that's the cost for not hitting the rate-limit)
                  const event = await fetch(
                    `https://raid-helper.dev/api/v2/events/${postedEvent.id}`,
                    { headers: header }
                  )
                    .then((res) => (res.ok ? res : Promise.reject(res)))
                    .then((res) => res.json())
                    .then(
                      (event: RaidhelperAPIEvent) =>
                        ({
                          // Need to map to new object so the entire event object doesn't get saved to databse
                          id: event.id,
                          startTimeUnix: event.startTime,
                          title: event.title,
                          voiceChannelId:
                            event.advancedSettings.voice_channel.match(
                              /^[0-9]+$/
                            )
                              ? event.advancedSettings.voice_channel
                              : undefined,
                          lastUpdatedUnix: event.lastUpdated,
                        } as ScheduledEvent)
                    );

                  if (event) {
                    newEvents.push(event);
                    break;
                  }
                } catch (response) {
                  if (response instanceof Response && response.status === 429) {
                    const retry = Number.parseInt(
                      response.headers.get("retry-after") || "0"
                    );
                    await promiseTimeout(retry);
                  } else {
                    //! If there is an unkown error print it and skip event
                    logger.error(
                      `[${dbGuild.name}] ` + response?.toString?.() || "Unknown"
                    );
                    break;
                  }
                }
              }
            }
          }
          return newEvents;
        }
      );
  }
}
export default new RaidhelperIntegration();
