/* eslint-disable no-console */
import { TestClient } from 'djs-test-client';
import Firebase from '../../../lib/firebase';
import { configureTrigger } from '../../triggers/configure.trigger';
import { configurePrefixReaction } from './prefix.reaction';
import { reflectVariables } from '../../common/util';
import { GuildSettings } from '../../common/types';
import { GuildMessage } from '../../common/reaction';
import logger from '../../../lib/logger';

describe('Configure', () => {
    let client: TestClient;
    let db: Firebase;
    beforeAll(async () => {
        client = await TestClient.connect();
        db = await Firebase.init();
        reflectVariables(configureTrigger, { db });
        reflectVariables(configurePrefixReaction, { trigger: configureTrigger });
    });
    afterAll(async () => {
        try {
            await db.firestore.delete(['guilds', client.guild.id].join('/'));
        } catch (e) {
            logger.error(e);
        }
        await client.destroy();
    });

    it('should store prefix', async () => {
        const newPrefix = '$';
        const channel = await client.createTextChannel('prefixTest');
        const message = await client.sendMessage(channel, '$');
        await configurePrefixReaction.run(message as GuildMessage);
        const dbSettings = await db.firestore.doc<GuildSettings>(
            ['guilds', client.guild.id].join('/')
        );
        expect(dbSettings?.prefix).toEqual(newPrefix);
    });
});