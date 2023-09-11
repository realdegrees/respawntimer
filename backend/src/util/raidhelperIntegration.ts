import { RaidhelperEvent } from '../common/types/raidhelperEvent';
import { getGuild } from '../db/guild.schema';
import { Guild } from 'discord.js';

const POLL_INTERVAL_MS = 600000;
export class RaidhelperIntegration {
    public constructor() {
        setInterval(() => {

        }, POLL_INTERVAL_MS);
    }
    /**
     * Retrieves current events, saves them to the guild object in db
     * and returns the events
     * @param guild 
     * @returns 
     */
    public async getEvents(guild: Guild): Promise<RaidhelperEvent[]> {
        return getGuild(guild)
            .then((dbGuild) => {
                if (!dbGuild.raidHelper.apiKey) {
                    throw new Error('Raidhelper API Key not set.');
                }
                const url = `https://raid-helper.dev/api/v3/servers/${dbGuild.id}/events`;
                const header = new Headers();
                header.set('Authorization', dbGuild.raidHelper.apiKey);

                return fetch(url, {
                    headers: header
                })
                    .then((res) => res.json())
                    .then((data) => {
                        const events = (data as {
                            postedEvents?: RaidhelperEvent[];
                        }).postedEvents ?? [];
                        dbGuild.raidHelper.events = events;
                        return dbGuild.save();
                    })
                    .then((dbGuild) => dbGuild.raidHelper.events);
            });
    }
    public async checkApiKey(guild: Guild, apiKey: string): Promise<boolean> {
        return new Promise((res) => {
            const url = `https://raid-helper.dev/api/v3/servers/${guild.id}/events`;
            const header = new Headers();
            header.set('Authorization', apiKey);

            fetch(url, {
                headers: header
            })
                .then((response) => {
                    res(response.ok);
                })
                .catch(() => {
                    res(false);
                });
        });
    }
}
export default new RaidhelperIntegration();