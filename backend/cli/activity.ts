#!/usr/bin/env node
/* eslint-disable no-console */

import { ActivityOptions, Client, Presence } from 'discord.js';
import { exit } from 'process';
import yargs from 'yargs';
import { config } from 'dotenv';
config();

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

const set = async (client: Client, options?: ActivityOptions): Promise<Presence> => {
    if (!client.user) {
        throw new Error('Cannot get user from client');
    }
    const activity = await client.user.setActivity(options);
    console.log(JSON.stringify(activity));    
    console.info('Successfully set status!');
    return activity;
};

(async (args) => {
    try {
        const client = await getClient();
        
        await set(client, {
            name: args.content,
            type: args.type as 'PLAYING' | 'STREAMING' |
                'LISTENING' | 'WATCHING' |
                'CUSTOM_STATUS' | 'COMPETING' | undefined,
            url: args.url
        });
        
        client.destroy();
        exit(0);
    } catch (e) {
        console.error(e);
        exit(1);
    }
})(yargs
    .scriptName('activity')
    .usage('Usage: $0 <cmd> [args]')
    .command('set', 'Sets the bot\'s activity')
    .option('content', {
        alias: 'c',
        type: 'string'
    })
    .option('type', {
        alias: 't',
        type: 'string',
        choices: [
            'PLAYING',
            'STREAMING',
            'LISTENING',
            'WATCHING',
            'CUSTOM_STATUS',
            'COMPETING'
        ]
    })
    .option('url', {
        alias: 'u',
        type: 'string'
    })
    .help()
    .argv);