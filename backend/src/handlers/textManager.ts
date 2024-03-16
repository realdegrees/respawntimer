import logger from "../../lib/logger";
import { TimingsSettings } from "../common/settings/timings.settings";
import { WarInfo } from "../common/types";
import { DBGuild } from "../common/types/dbGuild";
import Database from "../db/database";
import { clamp } from "../util/util.generic";
import { Widget } from "../widget";

const settings = {
  barWidth: 25,
  barIconFull: "●",
  barIconEmpty: "○",
};

type SubscribeTimestamp = number;
type GuildID = string;
type PopulatedSubscriber = {
  dbGuild: DBGuild;
  subscribedTimestamp: number;
  widget: Widget;
};
class TextManager {
  private subscribers: Record<GuildID, SubscribeTimestamp> = {};
  public async interval(): Promise<void> {
    if (this.subscribers.length === 0) return;

    const subscribers = (
      await Promise.allSettled<PopulatedSubscriber>(
        Object.entries(this.subscribers).map(
          ([guildId, subscribedTimestamp]) =>
            new Promise<PopulatedSubscriber>(async (res, rej) => {
              const dbGuild = await Database.getGuild(guildId);
              const widget = await Widget.find(dbGuild);

              // Unsubscribe the subscriber if the widget is not reachable
              if (!widget) {
                delete this.subscribers[dbGuild.id];
                return rej();
              } else {
                return res({
                  dbGuild,
                  subscribedTimestamp,
                  widget,
                });
              }
            })
        )
      )
    )
      .filter(
        // Filters out the rejected promises (subscribers that were unsubscibred due to missing widget)
        (res): res is PromiseFulfilledResult<PopulatedSubscriber> =>
          res.status === "fulfilled"
      )
      .map((res) => res.value);

    for (const {
      subscribedTimestamp,
      widget,
      dbGuild: { name },
    } of subscribers) {
      const date = new Date();
      const [minutes, seconds] = [date.getMinutes(), date.getSeconds()];
      const minutesSubscribed = subscribedTimestamp
        ? (date.getTime() - subscribedTimestamp) / 1000 / 60
        : 0;

      // Toggle widget off at war end if it's been on for more than 15 minutes
      // Toggle widget off if it's been subscribed for over 45 minutes

      const widgetHasTextEnabled = widget.getTextState();
      const isEndOfwar =
        (minutes === 59 || minutes === 29) &&
        seconds === 30 &&
        (minutesSubscribed >= 15 || minutesSubscribed >= 45);
      if (widgetHasTextEnabled && isEndOfwar) {
        logger.info(`[${name}] auto-stop widget`);
        widget.toggleText().catch(logger.error);
      }
    }

    const defaultRespawnData = TimingsSettings.convertToRespawnData(
      TimingsSettings.convertToSeconds(TimingsSettings.DEFAULT)!
    );

    for (const {
      dbGuild: { customTimings },
      widget,
    } of subscribers) {
      const respawnData = customTimings
        ? TimingsSettings.convertToRespawnData(
            TimingsSettings.convertToSeconds(customTimings)!
          )
        : defaultRespawnData;
      const description = this.getDescription(respawnData);
      widget.update({ description });
    }
  }
  private getDescription(info: WarInfo): string {
    const timeLeftMinutes = Math.floor(info.war.timeLeftSeconds / 60);
    const timeLeftSeconds = info.war.timeLeftSeconds - timeLeftMinutes * 60;
    const bar = this.getBar(
      info.respawn.duration,
      info.respawn.timeUntilRespawn
    );

    return (
      `# ${this.getTitle(
        info.respawn.remainingRespawns,
        info.respawn.timeUntilRespawn
      )}\n` +
      `${bar ? `### ${bar}\n\n` : ""}
            *This Respawn Duration*: **${
              info.respawn.duration >= 0 ? info.respawn.duration : "-"
            }**  
            *Next Respawn Duration*: **${
              info.respawn.durationNext >= 0 ? info.respawn.durationNext : "-"
            }**${
        info.respawn.durationNext > info.respawn.duration ? " ⬆️" : ""
      }  
            *Respawns Remaining*: **${info.respawn.remainingRespawns}**  
            *Time Remaining*: **${
              timeLeftMinutes > 9 ? timeLeftMinutes : "0" + timeLeftMinutes
            }:${
        timeLeftSeconds > 9 ? timeLeftSeconds : "0" + timeLeftSeconds
      }**`
    );
  }
  private getBar(timeTotal: number, timeLeft: number): string {
    const progress = Math.round(
      settings.barWidth * ((timeTotal - timeLeft) / timeTotal)
    );
    return timeLeft < 0
      ? ""
      : "[" +
          settings.barIconFull.repeat(clamp(progress, 0, settings.barWidth)) +
          settings.barIconEmpty.repeat(
            clamp(settings.barWidth - progress, 0, settings.barWidth)
          ) +
          "]";
  }
  private getTitle(remainingRespawns: number, timeLeft: number): string {
    const respawn =
      remainingRespawns === 0
        ? "NO MORE RESPAWNS"
        : timeLeft <= 0
        ? "RESPAWN"
        : timeLeft.toString();
    return `${timeLeft === 0 ? "🔶" : "🔸"} ` + respawn;
  }

  public subscribe(guildId: string): void {
    this.subscribers[guildId] = Date.now();
  }
  public unsubscribe(guildId: string): void {
    delete this.subscribers[guildId];
  }
}
export default new TextManager();
