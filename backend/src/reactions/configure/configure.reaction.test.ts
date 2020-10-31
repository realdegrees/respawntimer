import { TestClient } from 'djs-test-client';
import Firebase from '../../../lib/firebase';
import { configureTrigger } from '../../triggers/configure.trigger';
import { configurePrefixReaction } from './configure-prefix.reaction';
import { reflectVariables } from '../../common/util';
import { GuildSettings } from '../../common/types';

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
        await db.firestore.delete(client.guild.id);
        await client.destroy();
    });

    it('should store prefix', async (done) => {
        const newPrefix = '$';
        const channel = await client.createTextChannel('prefix');
        const message = await client.sendMessage(
            channel,
            newPrefix
        );

        await configurePrefixReaction.run(message);

        const dbSettings =
            await db.firestore.get<GuildSettings>(
                [client.guild.id, 'config'].join('/')
            );

        expect(dbSettings?.prefix).toEqual(newPrefix);
        done();
    });
});