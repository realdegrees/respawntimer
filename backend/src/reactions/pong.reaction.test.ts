import { MockClient } from '../../lib/discord-mock';
import { pong } from './pong.reaction';

describe('Pong Reaction', () => {
    let client: MockClient;
    beforeEach(async () => {
        client = await MockClient.connect();
    });
    afterAll(async () => {
        await client.cleanup();
    });

    it('should send pong command', (done) => {
        client.createTextChannel()
            .then(async (channel) => {
                const message = await client.sendMessage(channel, '!ping');
                expect(pong.run(message)).resolves.toBeUndefined();
                return client.awaitMessage(channel);
            })
            .then((message) => {
                expect(message.content).toEqual('pong!');
                done();
            })
            .catch(done);
    });
});