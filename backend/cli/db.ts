#!/usr/bin/env node
/* eslint-disable no-console */

import { Client } from 'discord.js';
import { exit } from 'process';
import yargs from 'yargs';
import { Z_UNKNOWN } from 'zlib';
import Firebase from '../lib/firebase';
import { GuildSettings } from '../src/common/types';
import { debug } from '../src/common/util';

const getClient = (): Promise<Client> => {
    return new Promise((resolve, reject) => {
        const client = new Client();
        const discordToken = process.env['DISCORD_CLIENT_TOKEN'];

        if (!discordToken) {
            throw new Error('Environment variable "DISCORD_CLIENT_TOKEN" not found!');
        }

        client.on('error', (e) => {
            console.error(e);
            process.exit(0);
        });

        client.login(discordToken)
            .then(() => client)
            .then(resolve)
            .catch(reject);
    });
};

(async (args) => {
    try {        
        const client = await getClient();
        const db = await Firebase.init();

        const guilds = await db.firestore.collection<GuildSettings>('guilds');

        // console.log('Found ' + guilds.length + ' in db!');
        guilds.forEach((guild) => console.log(guild.id));

        if (!args.test && !args.guild && !args.derelict && !args.force) {
            console.warn(
                'You are about to delete all guilds from the database! Aborting.\n' +
                'Use the force argument (-f | --force) to force delete!'
            );
            process.exit(1);
        }


        const deletions = await Promise.resolve(guilds)
            .then((guilds) => {
                const filtered = guilds.filter((guild) => args.guild ?
                    guild.id === args.guild :
                    true);
                if (filtered[0]?.id === args.guild) {
                    console.debug(`Found guild with id ${args.guild}`);
                } else if (args.guild) {
                    console.info(`Guild with id ${args.guild}`);
                }

                return filtered;
            })
            .then((guilds) => {
                const filtered = guilds.filter((guild) => args.derelict ?
                    !client.guilds.cache.has(guild.id) :
                    true
                );
                if (args.derelict && filtered.length !== guilds.length) {
                    console.debug(`Found ${filtered.length} derelict guilds.`);
                }
                return filtered;
            })
            .then((guilds) => {
                const filtered = guilds.filter((guild) => {
                    const guildRef = client.guilds.cache.get(guild.id);
                    return args.test ?
                        guildRef?.ownerID === client.user?.id && guildRef?.name.startsWith('test') :
                        true;
                });
                if (args.test && filtered.length !== guilds.length) {
                    console.debug(`Found ${filtered.length} test guilds.`);
                }
                return filtered;
            })
            .then((guilds) =>
                guilds.map((guild) => db.firestore.delete(['guilds', guild.id].join('/')))
            );

        await Promise.all(deletions);
        console.info(`Deleted ${deletions.length} guilds from the database.`);

        exit(0);
    } catch (e) {
        console.error(e);
        exit(1);
    }
})(yargs
    .scriptName('db')
    .usage('Usage: $0 <cmd> [args]')
    .command('remove', 'Removes the specified guild(s) from the db')
    .option('guild', {
        alias: 'g',
        describe: 'The discord guild ID',
        type: 'string'
    })
    .option('test', {
        alias: 't',
        describe: 'Removes all test guilds',
        type: 'boolean'
    })
    .option('derelict', {
        alias: 'd',
        describe: 'Removes all guilds from db where the bot is not a member of.',
        type: 'boolean'
    })
    .option('force', {
        alias: 'f',
        describe: 'Removes all guilds from db where the bot is not a member of.',
        type: 'boolean'
    })
    .conflicts('force', ['derelict', 'test', 'guild'])
    .help()
    .argv);