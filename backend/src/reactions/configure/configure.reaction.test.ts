/* eslint-disable no-console */
import { TestClient } from 'djs-test-client';
import Firebase from '../../../lib/firebase';
import { configureTrigger } from '../../triggers/configure.trigger';
import { configurePrefixReaction } from './configure-prefix.reaction';
import { reflectVariables } from '../../common/util';
import { GuildSettings } from '../../common/types';
import { GuildMessage } from '../../common/reaction';

describe('Configure', () => {
    let client: TestClient;
    let db: Firebase;
    beforeAll(async () => {
        client = await TestClient.connect();
        db = await Firebase.init();
        reflectVariables(configureTrigger, { db });
        reflectVariables(configurePrefixReaction, { trigger: configureTrigger });
    });
    afterAll(() => {
        return db.firestore.delete(client.guild.id) // TODO: THIS DOESN'T WORK
            .then(() => client.destroy());
    });

    it('should store prefix', () => {
        const newPrefix = '$';
        return client.createTextChannel('prefixTest')
            .then((channel) => client.sendMessage(channel, '$'))
            .then((message) => configurePrefixReaction.run(message as GuildMessage))
            .then(() => db.firestore.get<GuildSettings>(
                [client.guild.id, 'config'].join('/')
            ))
            .then((dbSettings) => expect(dbSettings?.prefix).toEqual(newPrefix));
    });
});